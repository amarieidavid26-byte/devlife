import logging
# biometric engine - here we have the whoop integration and cognitive state classifier
# smart ass file right here
# connects to whoop api via oauth2, fetches recov/strain/sleep data and classifies them into
# deepfocus - stressed - wired - fatigued - relaxed
# classification is based on the inverted U model (yerkes-dodson basically)
# performance peaks at moderate arousal, drops at both extremes
# i read a bunch of papers on this, peifer 2014 was the most useful one
# alright lets code enough science

import httpx

logger = logging.getLogger(__name__)
import time
import json 
import os 

class BiometricEngine:
    TOKENS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
        ".whoop_tokens.json")

    def __init__ (self, client_id = None, client_secret = None):
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token = None
        self.current_data = None
        self.current_state = "RELAXED"
        self.on_state_change_callback = None
        self.polling = False
        self.hrv_history = []
        self.hrv_baseline = 50.0
        self.estimated_stress = 0.0
        self.rhr_baseline = 65.0
        # token refresh
        self.token_expiry = 0
        self.refresh_token = None
        self._sleep_error_logged = False
        self.live_heart_rate = 0
        self.live_hr_timestamp = 0
        # inter-beat (RR) intervals streamed over BLE -> live RMSSD-HRV
        self.live_rr = []          # list of (timestamp, rr_ms)
        self.live_hrv = None
        self.live_hrv_timestamp = 0
        self._load_tokens()

    RR_WINDOW_SECONDS = 60
    RR_MIN_MS, RR_MAX_MS = 300, 2000   # physiological bounds; outside = sensor artifact
    RR_MIN_SAMPLES = 8

    def add_rr_intervals(self, rr_list):
        # called from the WS 'heart_rate' handler with RR intervals (ms) parsed
        # from the BLE Heart Rate Measurement characteristic (flag bit 4)
        now = time.time()
        for rr in rr_list:
            if isinstance(rr, (int, float)) and self.RR_MIN_MS <= rr <= self.RR_MAX_MS:
                self.live_rr.append((now, float(rr)))
        cutoff = now - self.RR_WINDOW_SECONDS
        self.live_rr = [(t, v) for t, v in self.live_rr if t >= cutoff]
        hrv = self.compute_live_hrv()
        if hrv is not None:
            self.live_hrv = hrv
            self.live_hrv_timestamp = now

    def compute_live_hrv(self):
        # RMSSD over the sliding window: sqrt(mean(successive RR differences squared)).
        # This is the standard short-window HRV metric (same family WHOOP reports).
        values = [v for _, v in self.live_rr]
        if len(values) < self.RR_MIN_SAMPLES:
            return None
        diffs = [values[i + 1] - values[i] for i in range(len(values) - 1)]
        return round((sum(d * d for d in diffs) / len(diffs)) ** 0.5, 1)

    # oauth2 urls
    AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
    TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
    API_BASE = "https://api.prod.whoop.com/developer/v2"

    # the `offline` scope is required for WHOOP to issue a refresh token; without it
    # the connection silently dies after the first access token expires (~1h).
    # must match exactly the scopes enabled on the WHOOP dev app, or auth fails with
    # invalid_scope. `offline` is required for a refresh token (not shown in the dashboard
    # scope list). read:workout / read:body_measurement were removed — the app doesn't grant
    # them and we don't use them.
    SCOPES = "offline read:recovery read:cycles read:sleep read:profile"

    # oauth flow
    def get_auth_url(self, redirect_uri, state):
        # generate the WHOOP oauth url
        # user visits this URL, logs in and whoop redirects back with a code
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": self.SCOPES,
            "state": state,
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.AUTH_URL}?{query}"

    def exchange_token(self, code, redirect_uri):
        try:
            response = httpx.post(self.TOKEN_URL, data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri
            })
            if response.status_code == 401:
                logger.warning("token exchange failed: invalid or expired credentials")
                self.access_token = None
                return False
            if response.status_code < 200 or response.status_code >= 300:
                logger.warning("token exchange failed: HTTP %s", response.status_code)
                self.access_token = None
                return False
            data = response.json()
            self.access_token = data.get("access_token")
            self.refresh_token = data.get("refresh_token")
            expires_in = data.get("expires_in", 3600)
            self.token_expiry = time.time() + expires_in
            if self.access_token:
                self._save_tokens()
            return self.access_token is not None
        except Exception as e:
            logger.error("token exchange error: %s", e)
            self.access_token = None
            return False

    def refresh_access_token(self):
        if not self.refresh_token:
            return False
        try:
            response = httpx.post(self.TOKEN_URL, data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token",
                # WHOOP drops the refresh token unless `offline` is re-requested on refresh
                "scope": "offline",
            })
            if response.status_code == 200:
                data = response.json()
                self.access_token = data.get("access_token")
                self.refresh_token = data.get("refresh_token", self.refresh_token)
                expires_in = data.get("expires_in", 3600)
                self.token_expiry = time.time() + expires_in
                self._save_tokens()
                logger.info("token refreshed")
                return True
            else:
                logger.warning("token refresh failed: HTTP %s", response.status_code)
        except Exception as e:
            logger.error("token refresh failed: %s", e)
        return False

    def _check_token(self):
        if self.access_token and time.time() >= self.token_expiry - 60:
            logger.info("token expiring soon, refreshing")
            return self.refresh_access_token()
        return self.access_token is not None

    def update_baseline(self, hrv_value):
        self.hrv_history.append(hrv_value)
        if len(self.hrv_history) > 14:
            self.hrv_history.pop(0)
        if self.hrv_history:
            self.hrv_baseline = sum(self.hrv_history) / len(self.hrv_history)

    def fetch_data(self, _retry=True):
        if not self.access_token:
            # in-memory token was cleared (e.g. after a 401) but we may still hold a refresh
            # token — recover the session instead of silently falling back to mock forever
            if not (self.refresh_token and self.refresh_access_token()):
                return None
            logger.info("recovered session from saved refresh token")
        self._check_token()
        headers = {"Authorization": f"Bearer {self.access_token}"}
        try:
            recovery_resp = httpx.get(f"{self.API_BASE}/recovery", headers=headers, params={"limit": 1})
            if recovery_resp.status_code == 401:
                # access token expired between proactive checks: try the refresh token once
                # before giving up, so a valid offline session self-heals instead of dropping to mock
                if _retry and self.refresh_access_token():
                    logger.info("got 401 -- refreshed token, retrying fetch")
                    return self.fetch_data(_retry=False)
                logger.warning("token expired -- need to re-authenticate")
                self.access_token = None
                return None
            if recovery_resp.status_code < 200 or recovery_resp.status_code >= 300:
                logger.warning("recovery API error: HTTP %s", recovery_resp.status_code)
                return None
            recovery_data = recovery_resp.json()

            cycle_resp = httpx.get(f"{self.API_BASE}/cycle", headers=headers, params={"limit": 1})
            if cycle_resp.status_code == 401:
                if _retry and self.refresh_access_token():
                    logger.info("got 401 -- refreshed token, retrying fetch")
                    return self.fetch_data(_retry=False)
                logger.warning("token expired -- need to re-authenticate")
                self.access_token = None
                return None
            if cycle_resp.status_code < 200 or cycle_resp.status_code >= 300:
                logger.warning("cycle API error: HTTP %s", cycle_resp.status_code)
                return None
            cycle_data = cycle_resp.json()

            sleep_data = None
            try:
                sleep_resp = httpx.get(f"{self.API_BASE}/activity/sleep", headers=headers, params={"limit": 1})
                if sleep_resp.status_code == 200:
                    sleep_data = sleep_resp.json()
                    self._sleep_error_logged = False
                elif not self._sleep_error_logged:
                    logger.warning("sleep API HTTP %s -- skipping", sleep_resp.status_code)
                    self._sleep_error_logged = True
            except Exception as e:
                if not self._sleep_error_logged:
                    logger.warning("sleep API failed: %s -- skipping", e)
                    self._sleep_error_logged = True

            # WHOOP wraps each metric in records[0].score, but ONLY when score_state is
            # "SCORED". First thing in the morning it can be PENDING_SCORE/UNSCORABLE, and a
            # new member shows CALIBRATING. We start from the last-known reading and overwrite a
            # section only when it's freshly scored, so a not-yet-scored morning keeps the
            # previous real numbers instead of silently inventing plausible fakes.
            def _scored(payload):
                recs = payload.get("records", []) if payload else []
                if recs and recs[0].get("score_state") == "SCORED":
                    return recs[0].get("score", {}), recs[0].get("score_state")
                return None, (recs[0].get("score_state") if recs else "NO_DATA")

            data = dict(self.current_data) if self.current_data else {}

            rec_score, rec_state = _scored(recovery_data)
            if rec_score:
                data["recovery"] = rec_score.get("recovery_score")
                data["hrv"] = rec_score.get("hrv_rmssd_milli")            # WHOOP returns ms despite the name
                data["restingHeartRate"] = rec_score.get("resting_heart_rate")
                data["heartRate"] = rec_score.get("resting_heart_rate")   # resting HR; live BLE overrides in the loop
                data["spo2"] = rec_score.get("spo2_percentage")
                data["skinTemp"] = rec_score.get("skin_temp_celsius")
            else:
                logger.info("recovery not SCORED (state=%s) -- keeping last known", rec_state)

            cyc_score, cyc_state = _scored(cycle_data)
            if cyc_score:
                data["strain"] = cyc_score.get("strain")
            else:
                logger.info("cycle not SCORED (state=%s) -- keeping last known", cyc_state)

            # sleep_performance_percentage + stage durations live in the SLEEP object, NOT recovery
            slp_score, slp_state = _scored(sleep_data)
            if slp_score:
                stages = slp_score.get("stage_summary", {})
                in_bed = stages.get("total_in_bed_time_milli", 0)
                awake = stages.get("total_awake_time_milli", 0)
                asleep = max(0, in_bed - awake)
                rem = stages.get("total_rem_sleep_time_milli", 0)
                deep = stages.get("total_slow_wave_sleep_time_milli", 0)
                perf = slp_score.get("sleep_performance_percentage")
                if perf is not None:
                    data["sleepPerformance"] = perf / 100.0
                    data["sleepScore"] = round(perf)
                data["sleepEfficiency"] = slp_score.get("sleep_efficiency_percentage")
                data["sleepConsistency"] = slp_score.get("sleep_consistency_percentage")
                data["respiratoryRate"] = slp_score.get("respiratory_rate")
                data["sleepHours"] = round(asleep / 3_600_000.0, 2)
                data["sleepRemPct"] = round(rem / asleep * 100, 1) if asleep else 0.0
                data["sleepDeepPct"] = round(deep / asleep * 100, 1) if asleep else 0.0
            elif slp_state != "NO_DATA":
                logger.info("sleep not SCORED (state=%s) -- keeping last known", slp_state)

            # neutral fallbacks ONLY on a true cold start (nothing ever scored) so the classifier
            # and UI have numbers to work with; once real data lands these never apply again.
            data.setdefault("recovery", 50)
            data.setdefault("strain", 8.0)
            data.setdefault("hrv", 50)
            data.setdefault("heartRate", 60)

            self.current_data = data
            hrv_value = data.get("hrv")
            if hrv_value:
                self.update_baseline(hrv_value)

            logger.info(
                "WHOOP data: rec=%s strain=%s rhr=%s hrv=%sms sleep=%s%%",
                data.get("recovery"), data.get("strain"), data.get("restingHeartRate"),
                data.get("hrv"), round((data.get("sleepPerformance") or 0) * 100),
            )
            return data
        except Exception as e:
            logger.error("WHOOP API error: %s", e)
            return None

    def classify(self, data=None):
        if data is None:
            data = self.current_data
        if data is None:
            return "RELAXED"
        recovery = data.get("recovery", 50)
        strain = data.get("strain", 8)
        sleep = data.get("sleepPerformance", 0.75)
        hrv = data.get("hrv", 50)
        old_state = self.current_state
        hrv_ratio = hrv / self.hrv_baseline if self.hrv_baseline > 0 else 1.0
        if hrv_ratio < 0.6:
            estimated_stress = 2.5
        elif hrv_ratio < 0.75:
            estimated_stress = 1.8
        elif hrv_ratio < 0.85:
            estimated_stress = 1.2
        else:
            estimated_stress = 0.5
        live_hr = self.live_heart_rate if (time.time() - self.live_hr_timestamp < 5) else 0
        # real HRV computed from streamed RR intervals beats any estimate
        live_hrv = self.live_hrv if (time.time() - self.live_hrv_timestamp < 30) else None
        if live_hrv is not None and self.hrv_baseline > 0:
            live_ratio = live_hrv / self.hrv_baseline
            if live_ratio < 0.6:
                estimated_stress = 2.5
            elif live_ratio < 0.75:
                estimated_stress = 1.8
            elif live_ratio < 0.85:
                estimated_stress = 1.2
            else:
                estimated_stress = 0.5

        if live_hr > 0:
            if live_hr > 100:
                new_state = "STRESSED"
                estimated_stress = 2.5
            elif live_hr > 95:
                new_state = "WIRED"
                estimated_stress = 1.9
            elif live_hr > 75: 
                new_state = "DEEP_FOCUS"
                estimated_stress = 1.2
            elif live_hr >= 60:
                new_state = "RELAXED"
                estimated_stress = 0.5
            else:
                live_hr = 0
            # real WHOOP recovery/sleep can veto the HR-only bands: fatigue barely
            # shows in HR, so a normal pulse must not mask a 30% recovery day
            if live_hr > 0 and live_hr <= 95 and self.access_token:
                if recovery < 40 or sleep < 0.7:
                    new_state = "FATIGUED"
                    estimated_stress = max(estimated_stress, 1.8)
        if live_hr == 0:
            if recovery < 40 or sleep < 0.7:
                new_state = "FATIGUED"
            elif estimated_stress >= 2.0 or strain > 16:
                new_state = "STRESSED"
            elif strain > 12 and recovery < 60:
                new_state = "WIRED"
            elif 0.9 <= estimated_stress <= 1.5 and 8 <= strain <= 14 and recovery > 60:
                new_state = "DEEP_FOCUS"
            else:
                new_state = "RELAXED"
        self.current_state = new_state
        self.estimated_stress = estimated_stress
        if old_state != new_state and self.on_state_change_callback:
            self.on_state_change_callback(old_state, new_state)
        return new_state

    def get_personality_modifiers(self, state=None):
        if state is None:
            state = self.current_state
        modifiers = {
            "DEEP_FOCUS": {
                "intervention_threshold": 0.9,
                "verbosity": "minimal",
                "tone": "silent_supportive",
                "risk_sensitivity": "low",
                "capture_interval": 10,
                "max_tokens": 30
            },
            "STRESSED": {
                "intervention_threshold": 0.4,
                "verbosity": "medium",
                "tone": "warm_supportive",
                "risk_sensitivity": "high",
                "capture_interval": 2,
                "max_tokens": 100
            },
            "FATIGUED": {
                "intervention_threshold": 0.3,
                "verbosity": "short",
                "tone": "protective",
                "risk_sensitivity": "critical",
                "capture_interval": 3,
                "max_tokens": 80
            },
            "RELAXED": {
                "intervention_threshold": 0.5,
                "verbosity": "detailed",
                "tone": "curious_exploratory",
                "risk_sensitivity": "normal",
                "capture_interval": 5,
                "max_tokens": 200
            },
            "WIRED": {
                "intervention_threshold": 0.5,
                "verbosity": "short",
                "tone": "direct_action",
                "risk_sensitivity": "medium",
                "capture_interval": 3,
                "max_tokens": 60
            }
        }
        result = dict(modifiers.get(state, modifiers["RELAXED"]))
        result["estimated_stress"] = self.estimated_stress
        result["hrv_baseline"] = self.hrv_baseline
        return result

    def _save_tokens(self):
        try:
            with open(self.TOKENS_FILE, "w") as f:
                json.dump({
                    "access_token": self.access_token,
                    "refresh_token": self.refresh_token,
                    "expires_at": self.token_expiry
                }, f)
        except Exception as e:
            logger.error("failed to save tokens: %s", e)

    def _load_tokens(self):
        try: 
            if not os.path.exists(self.TOKENS_FILE):
                return
            with open(self.TOKENS_FILE, "r") as f:
                data = json.load(f)
            expires_at = data.get("expires_at", 0)
            if time.time() < expires_at - 60:
                self.access_token = data.get("access_token")
                self.refresh_token = data.get("refresh_token")
                self.token_expiry = expires_at
                logger.info("loaded saved tokens, auto connected")
            elif data.get("refresh_token"): 
                self.refresh_token = data.get("refresh_token")
                logger.info("saved token expired, refreshing")
                self.refresh_access_token()
        except Exception as e:
            logger.warning("failed to load tokens: %s", e)
    def on_state_change(self, callback):
        self.on_state_change_callback = callback
