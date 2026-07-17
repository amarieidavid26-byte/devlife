"""The two daemon threads that drive DevLife.

- biometric_loop (5s): pulls WHOOP / mock / BLE data, classifies the cognitive state,
  persists a session-replay sample and broadcasts the biometric_update.
- ghost_loop (1s): consumes pending app content, runs the ContentAnalyzer + GhostBrain
  pipeline and broadcasts interventions (with fallback lines when Claude is down).

Both are started from server.py's lifespan and communicate with the async world
through runtime.broadcast_sync.
"""

import logging
import time

import persistence.db as db
from config import GAME_MODE, DEMO_OFFLINE, CONTENT_MIN_LENGTH, WHOOP_OFF_GRACE_SECONDS
from fallback_responses import get_fallback_intervention
from runtime import (
    app_state, bio, mock, brain, tracker, content_analyzer, capture, vision,
    broadcast_sync, build_biometric_msg, _degraded_banner, save_calibration,
)

logger = logging.getLogger(__name__)


def _update_baseline(new_avg):
    app_state.baseline_hr += (new_avg - app_state.baseline_hr) * 0.1


def _mark_stress_peak():
    app_state.last_stress_peak = time.time()


def _mark_recovery():
    app_state.recovery_velocity = time.time() - app_state.last_stress_peak
    app_state.last_stress_peak = None


def _set_sleep_mode(active, reason):
    if app_state.sleep_mode_active == active:
        return
    app_state.sleep_mode_active = active
    broadcast_sync({"type": "sleep_mode", "active": active, "reason": reason})
    logger.info("sleep mode %s -- %s", "on" if active else "off", reason)


def _check_sleep_mode(data):
    # Wear is inferred from the live BLE pulse only. We never look at the WHOOP API resting
    # HR here -- that value persists for hours after the band is removed, so it can't tell us
    # whether the band is on the wrist right now.
    now = time.time()

    # Manual activity -- a demo state key (mock_override_until) OR movement (manual_awake_until)
    # -- is an explicit "I'm awake and driving" signal and must win over off-wrist inference.
    # Without this, once the band disconnects (unplugged, or a page refresh kills the BLE link)
    # there is no live pulse left to ever reach the wake branch below, so the character latches
    # asleep with no escape but a server restart.
    if now < app_state.mock_override_until or now < app_state.manual_awake_until:
        app_state.sleep_low_hr_count = 0
        _set_sleep_mode(False, "manual activity")
        return
    had_ble = bio.live_hr_timestamp > 0          # the band has streamed at least once this session
    age = now - bio.live_hr_timestamp
    ble_fresh = bio.live_heart_rate > 0 and age < 5

    # Never paired a band (pure WHOOP-API mode): no live pulse to reason about, leave as-is.
    if not had_ble:
        return

    # Band streamed a pulse and then went silent past the grace window -> taken off the wrist.
    if not ble_fresh and age >= WHOOP_OFF_GRACE_SECONDS:
        app_state.sleep_low_hr_count = 0
        _set_sleep_mode(True, "WHOOP off wrist (no live HR for %ds)" % int(age))
        return

    # Within the grace window after a dropout: hold the current state, don't flip yet.
    if not ble_fresh:
        return

    # Live pulse is flowing -> band is worn. Sleep only on a genuinely low resting pulse
    # (user actually dozing off), and wake as soon as it climbs back.
    hr = bio.live_heart_rate
    if hr < 50:
        app_state.sleep_low_hr_count += 1
        if app_state.sleep_low_hr_count >= 5:
            _set_sleep_mode(True, "low HR=%s for %d cycles" % (hr, app_state.sleep_low_hr_count))
    else:
        app_state.sleep_low_hr_count = 0
        _set_sleep_mode(False, "HR=%s" % hr)


def biometric_loop():
    cycles = 0
    while app_state.ghost_running:
        # o exceptie aici omora firul de biometrie definitiv: e daemon, nu are supervizor
        # si nimic nu-l reporneste, deci HUD-ul ingheata pana la restart. Un ciclu prost
        # se sare, ca in ghost_loop
        try:
            is_whoop = False
            demo_locked = DEMO_OFFLINE or time.time() < app_state.mock_override_until
            if demo_locked:
                data = mock.get_data()
            elif bio.access_token:
                data = bio.fetch_data()
                if data is None:
                    data = mock.get_data()
                    _degraded_banner("WHOOP API unavailable")
                else:
                    is_whoop = True
            else:
                data = mock.get_data()

            if data:
                ble_fresh = bio.live_heart_rate and (time.time() - bio.live_hr_timestamp < 5)
                if ble_fresh:
                    data["heartRate"] = bio.live_heart_rate
                elif bio.live_hr_timestamp > 0:
                    # a band streamed a live pulse and it stopped -> WHOOP is off the wrist. Don't
                    # pass the API resting HR off as a live heartbeat; null it so the HUD honestly
                    # shows "--" and the character can fall asleep (see _check_sleep_mode).
                    data["heartRate"] = None
                # else: pure WHOOP-API mode (no band ever paired) -> keep the real resting HR from
                # fetch_data. We never synthesize a fake live pulse.
                if app_state.forced_state and time.time() < app_state.forced_until:
                    # A demo state is locked (keys 1-5). Hold it verbatim -- don't re-classify the
                    # transitioning mock numbers, which would briefly read as neighbouring states.
                    state = app_state.forced_state
                    bio.current_state = state
                    bio.estimated_stress = data.get("estimated_stress", bio.estimated_stress)
                else:
                    state = bio.classify(data, demo_locked=demo_locked)

                hr = data.get("heartRate") or 0
                if hr > 0:
                    app_state.hr_history.append((time.time(), hr))
                    if len(app_state.hr_history) > 120:
                        del app_state.hr_history[:-120]

                    if len(app_state.hr_history) >= 5:
                        sorted_hrs = sorted(h for _, h in app_state.hr_history)
                        low_count = max(1, len(sorted_hrs) // 5)
                        _update_baseline(sum(sorted_hrs[:low_count]) / low_count)

                    if hr > app_state.baseline_hr + 20 and app_state.last_stress_peak is None:
                        _mark_stress_peak()
                    if app_state.last_stress_peak is not None and hr < app_state.baseline_hr + 5:
                        _mark_recovery()

                if is_whoop:
                    src = "ble" if ble_fresh else "whoop"
                    logger.info("WHOOP state=%s rec=%s strain=%s hrv=%s hr=%s src=%s", state, data.get("recovery"), data.get("strain"), data.get("hrv"), data.get("heartRate"), src)
                    # personal HRV baseline learns once per NEW morning summary, not per cycle
                    daily_hrv = data.get("hrv")
                    if daily_hrv and daily_hrv != app_state.last_whoop_hrv:
                        if app_state.last_whoop_hrv is not None:
                            bio.hrv_baseline += (daily_hrv - bio.hrv_baseline) * 0.1
                        app_state.last_whoop_hrv = daily_hrv

                # black-box recording: one sample per cycle feeds the session replay
                try:
                    live_hrv = bio.live_hrv if (time.time() - bio.live_hrv_timestamp < 30) else None
                    db.save_biometric(
                        hr=data.get("heartRate") or 0,
                        hrv=live_hrv if live_hrv is not None else data.get("hrv", 0),
                        recovery=data.get("recovery", 0),
                        strain=data.get("strain", 0),
                        source="ble" if ble_fresh else ("whoop" if is_whoop else "mock"),
                        state=state,
                    )
                except Exception as e:
                    logger.warning("biometric sample persist failed: %s", e)

                broadcast_sync(build_biometric_msg(data, state))

            _check_sleep_mode(data)
            if app_state.last_coding_activity > 0 and time.time() - app_state.last_coding_activity > 60:
                app_state.last_coding_activity = time.time()
                broadcast_sync({"type": "plant_update", "delta": -2})

            cycles += 1
            if cycles % 12 == 0:  # ~60s
                try:
                    save_calibration()
                except Exception as e:
                    logger.warning("calibration persist failed: %s", e)

        except Exception as e:
            logger.exception("biometric_loop error: %s", e)
        time.sleep(5)


def ghost_loop():
    time.sleep(2)
    while app_state.ghost_running:
        try:
            state = bio.current_state
            modifiers = bio.get_personality_modifiers(state)

            if GAME_MODE:
                analysis = None
                app_type = None
                content_data = None
                content_hash = None

                with app_state.content_lock:
                    latest_time = 0
                    for atype, d in app_state.pending_content.items():
                        if d["timestamp"] > latest_time:
                            latest_time = d["timestamp"]
                            app_type = atype
                            content_data = d

                if content_data and len(content_data.get("content", "")) >= CONTENT_MIN_LENGTH:
                    content_hash = hash(content_data["content"])
                    already_analyzed = content_hash == app_state.last_analyzed_hashes.get(app_type)
                    in_cooldown      = time.time() < app_state.intervention_cooldown_until
                    user_suppressed  = app_state.suppressed_hashes.get(content_hash, 0) > time.time()

                    if already_analyzed or in_cooldown or user_suppressed:
                        with app_state.content_lock:
                            app_state.pending_content.pop(app_type, None)
                    else:
                        context_summary = tracker.get_summary()
                        try:
                            analysis = content_analyzer.analyze(
                                app_type=app_type,
                                content=content_data["content"],
                                extra_context=context_summary or "",
                                **content_data.get("kwargs", {}),
                            )
                            app_state.last_analyzed_hashes[app_type] = content_hash
                            with app_state.content_lock:
                                app_state.pending_content.pop(app_type, None)
                        except Exception as e:
                            logger.warning("content analysis failed: %s -- fallback ghost line", e)
                            app_state.last_analyzed_hashes[app_type] = content_hash
                            with app_state.content_lock:
                                app_state.pending_content.pop(app_type, None)
                            fb = get_fallback_intervention(state, brain.lang)
                            bio_data = mock.get_data() if (not bio.access_token or time.time() < app_state.mock_override_until) else (bio.current_data or {})
                            fb["biometric"] = build_biometric_msg(bio_data, state)
                            fb["app_type"] = app_type
                            app_state.intervention_cooldown_until = time.time() + 8
                            broadcast_sync(fb)

                if analysis:
                    tracker.update(analysis, state, bio.estimated_stress)
                    intervention = brain.process(analysis, state, modifiers)

                    if intervention:
                        app_state.intervention_cooldown_until = time.time() + 8
                        app_state.last_intervention_hash = content_hash
                        app_state.last_analyzed_hashes.clear()
                        bio_data = mock.get_data() if (not bio.access_token or time.time() < app_state.mock_override_until) else (bio.current_data or {})
                        intervention["biometric"] = build_biometric_msg(bio_data, state)
                        intervention["app_type"] = app_type
                        broadcast_sync(intervention)
                        app_state.intervention_history.append(intervention)
                        if len(app_state.intervention_history) > 50:
                            app_state.intervention_history.pop(0)
                        db.save_intervention(
                            state=state,
                            source=app_type or "game",
                            claude_text=intervention["message"],
                            content_hash=str(content_hash) if content_hash else None,
                        )
                        logger.info("intervention (%s/%s): %s...", state, app_type, intervention["message"][:80])
                        plant_delta = -25 if intervention.get("priority") == "critical" else -15
                        broadcast_sync({"type": "plant_update", "delta": plant_delta})
                    else:
                        broadcast_sync({"type": "plant_update", "delta": 10})

            else:
                if not capture:
                    time.sleep(1)
                    continue
                screenshots = capture.get_buffer()
                if not screenshots:
                    time.sleep(1)
                    continue

                context_summary = tracker.get_summary()
                try:
                    analysis = vision.analyze(screenshots, context_summary)
                except Exception as e:
                    logger.warning("vision analysis failed: %s", e)
                    time.sleep(modifiers.get("capture_interval", 3))
                    continue

                tracker.update(analysis, state, bio.estimated_stress)
                intervention = brain.process(analysis, state, modifiers)

                if intervention:
                    bio_data = mock.get_data() if (not bio.access_token or time.time() < app_state.mock_override_until) else (bio.current_data or {})
                    intervention["biometric"] = build_biometric_msg(bio_data, state)
                    broadcast_sync(intervention)
                    app_state.intervention_history.append(intervention)
                    if len(app_state.intervention_history) > 50:
                        app_state.intervention_history.pop(0)
                    logger.info("intervention (%s): %s...", state, intervention["message"][:80])

        except Exception as e:
            logger.error("ghost_loop error: %s", e)
            import traceback
            traceback.print_exc()
        time.sleep(1)
