// all WS message -> UI wiring: interventions, biometric updates, state changes,
// plant health, sleep mode, connect/disconnect

import { i18n } from '../i18n/index.js';
import { setWhoopConnected } from '../network/session.js';

export function wireSocketHandlers(deps) {
    const { socket, offlineBio, hud, dashboard, demoHotbar, atmosphere,
            ghost, player, furniture, soundManager, toastSystem, apps, settingsMenu } = deps;
    let lastRecVel = null;

    // The offline simulator exists for the backend-less teaser deploy, NOT as a fallback for a
    // transient socket blip. Once we've reached a real backend, a drop is a reconnect: freeze the
    // last-good values behind the offline badge and let WebSocket.js reconnect -- do NOT repaint
    // real WHOOP recovery/HRV/strain with the RELAXED demo preset. Only simulate if the WS has
    // NEVER connected, and even then after a short grace so a blip during the first connect (or a
    // page reload while the backend is up) doesn't flash presets.
    let everConnected = false;
    let simArmTimer = null;

    socket.on('connected', () => {
        everConnected = true;
        if (simArmTimer) { clearTimeout(simArmTimer); simArmTimer = null; }
        hud.setConnected(true); dashboard.setConnected(true);
        offlineBio.stop();
    });
    socket.on('disconnected', () => {
        hud.setConnected(false); dashboard.setConnected(false);
        if (everConnected || simArmTimer) return;   // reconnect: keep last-good, never simulate
        simArmTimer = setTimeout(() => {
            simArmTimer = null;
            if (!everConnected) offlineBio.start();
        }, 2000);
    });

    const syncWhoopRow = (v) => {
        setWhoopConnected(v);
        if (settingsMenu && settingsMenu.refreshWhoopRow) settingsMenu.refreshWhoopRow();
    };
    socket.on('whoop_connected', () => syncWhoopRow(true));
    socket.on('whoop_disconnected', () => syncWhoopRow(false));

    socket.on('intervention', (data) => {
        // the terminal firewall draws its own banner; a bubble would render behind the
        // fullscreen terminal where it can't be seen or dismissed
        if (!data.silent) ghost.showSpeechBubble(data);
        dashboard.addIntervention(data);
        if (data.priority === 'critical' || data.priority === 'warning') {
            soundManager.playGhostAlert();
        } else {
            soundManager.playGhostSpeak();
        }
        if (data.priority === 'critical') {
            toastSystem.triggerAchievement('firewall_blocked');
        }
    });

    socket.on('biometric_update', (data) => {
        // dupa reload-ul de OAuth, broadcast-ul one-shot whoop_connected s-a pierdut; starea vine de aici
        if (data.whoop_connected !== undefined) {
            setWhoopConnected(data.whoop_connected);
            if (settingsMenu && settingsMenu.refreshWhoopRow) settingsMenu.refreshWhoopRow();
        }
        hud.update(data);
        dashboard.update(data);
        demoHotbar.setActive(data.state);
        atmosphere.setState(data.state);
        ghost.setStateTint(data.state);
        ghost.setBiometrics(data);
        furniture.setMonitorState(data.state);
        soundManager.setState(data.state);
        soundManager.setHeartbeat(data.heartRate, data.state === 'FATIGUED' || data.state === 'STRESSED');
        if (apps && apps.desk_computer && apps.desk_computer.isOpen) {
            apps.desk_computer.setBiometricState(data.state); // biometric Cursor indicator
        }

        // real "last night" sleep from WHOOP's sleep endpoint (null until it's scored)
        if (data.sleepHours != null && data.sleepScore != null) {
            hud.setSleepData({
                hours: data.sleepHours,
                efficiency: data.sleepEfficiency ?? 0,
                rem_pct: data.sleepRemPct ?? 0,
                deep_pct: data.sleepDeepPct ?? 0,
                score: data.sleepScore,
            });
        }

        // CQI - weighted composite of recovery, HRV, and inverse stress. Use the stable WHOOP
        // daily HRV (hrv_daily) rather than the overloaded `hrv` field, which carries the jumpy
        // live BLE RMSSD when a strap is streaming and would otherwise make CQI spike.
        const recovery = data.recovery || 50;
        const hrv = (data.hrv_daily != null ? data.hrv_daily : data.hrv) || 40;
        const stress = data.estimated_stress || 0;
        const cqi = Math.round((Math.min(recovery / 100, 1) * 0.4 + Math.min(hrv / 80, 1) * 0.35 + Math.max(0, 1 - stress / 3) * 0.25) * 100);
        hud.updateCQI(cqi);

        // dont spam this
        if (data.recovery_velocity && data.recovery_velocity > 0) {
            if (lastRecVel !== data.recovery_velocity) {
                lastRecVel = data.recovery_velocity;
                const mins = (data.recovery_velocity / 60).toFixed(1);
                toastSystem.show('info', '💓 ' + i18n.t('toast.recovery_complete'), i18n.t('toast.recovery_complete_body', { mins }), 4000);
            }
        } else {
            lastRecVel = null;
        }
    });

    socket.on('state_change', (data) => {
        demoHotbar.setActive(data.to);
        atmosphere.transition(data.from, data.to);
        ghost.setStateTint(data.to);
        furniture.setMonitorState(data.to);
        soundManager.setState(data.to);
        toastSystem.show('state', i18n.t('toast.state_prefix') + i18n.t('state.' + data.to), i18n.t('toast.state_change_body', { state: i18n.t('state.' + data.to) }));
        if (data.to === 'DEEP_FOCUS') {
            toastSystem.triggerAchievement('first_flow');
        }
    });

    // Plant health from backend: clean code heals it, ignored interventions wither it
    socket.on('plant_update', (data) => {
        if (furniture && typeof data.delta === 'number') {
            furniture.adjustPlantHealth(data.delta);
        }
    });

    // Sleep mode from backend: WHOOP taken off the wrist (live pulse stopped) or a very low
    // resting HR. The character and the ghost both fall asleep, and we stop trusting the
    // resting-HR fallback as a live reading.
    let _asleep = false;
    socket.on('sleep_mode', (data) => {
        _asleep = data.active;
        if (ghost) ghost.setSleepMode(data.active);
        if (player) player.setSleepMode(data.active);
        const offWrist = data.reason && data.reason.indexOf('off wrist') !== -1;
        if (data.active && offWrist) {
            toastSystem.show('info', '💤 ' + i18n.t('sleep.whoop_off_title'), i18n.t('sleep.whoop_off_body'), 4000);
        } else if (!data.active) {
            toastSystem.show('info', '❤️ ' + i18n.t('sleep.awake_title'), i18n.t('sleep.awake_body'), 2500);
        }
    });

    // sleep-ul blocheaza Player.update(), deci tastele de miscare se prind aici;
    // serverul e anuntat ca sa nu re-adoarma
    const WAKE_KEYS = new Set(['w', 'a', 's', 'd', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
    window.addEventListener('keydown', (ev) => {
        if (!_asleep) return;
        const tag = ev.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || ev.target.isContentEditable) return;
        if (!WAKE_KEYS.has(ev.key.toLowerCase())) return;
        _asleep = false;
        if (ghost) ghost.setSleepMode(false);
        if (player) player.setSleepMode(false);
        socket.send({ type: 'wake' });
    });
}
