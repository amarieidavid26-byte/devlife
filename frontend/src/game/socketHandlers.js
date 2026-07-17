// all WS message -> UI wiring: interventions, biometric updates, state changes,
// plant health, sleep mode, connect/disconnect

import { i18n } from '../i18n/index.js';

export function wireSocketHandlers(deps) {
    const { socket, offlineBio, hud, dashboard, demoHotbar, atmosphere,
            ghost, player, furniture, soundManager, toastSystem, apps } = deps;
    let lastRecVel = null;

    socket.on('connected', () => { hud.setConnected(true); dashboard.setConnected(true); offlineBio.stop(); });
    socket.on('disconnected', () => { hud.setConnected(false); dashboard.setConnected(false); offlineBio.start(); });

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

        // CQI - weighted composite of recovery, HRV, and inverse stress
        const recovery = data.recovery || 50;
        const hrv = data.hrv || 40;
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

    // miscarea trezeste personajul. Sleep-ul blocheaza update()-ul de miscare din Player,
    // deci tasta de miscare nu poate porni singura mersul cat timp doarme -- o prindem aici,
    // trezim instant (local) si anuntam serverul ca sa nu re-adoarma. WASD, sageti si E
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
