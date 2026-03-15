const WebSocket = require('ws');
const crypto = require('crypto');

const wss = new WebSocket.Server({ port: 8000 });

let currentState = 'RELAXED';
let stateNumber = 4;
let interventionCount = 0;
const connectedClients = new Set();

const STATE_NAMES = {
    1: 'DEEP_FOCUS',
    2: 'STRESSED',
    3: 'FATIGUED',
    4: 'RELAXED',
    5: 'WIRED'
};

const BIOMETRIC_PRESETS = {
    DEEP_FOCUS: { heartRate: 64, hrv: 58, strain: 10.0, recovery: 72, estimated_stress: 0.8, spo2: 98, skinTemp: 36.4, sleepPerformance: 0.82, state: 'DEEP_FOCUS' },
    STRESSED:   { heartRate: 95, hrv: 22, strain: 18.0, recovery: 38, estimated_stress: 2.6, spo2: 97, skinTemp: 36.8, sleepPerformance: 0.65, state: 'STRESSED' },
    FATIGUED:   { heartRate: 58, hrv: 35, strain: 4.0,  recovery: 28, estimated_stress: 1.8, spo2: 96, skinTemp: 36.2, sleepPerformance: 0.45, state: 'FATIGUED' },
    RELAXED:    { heartRate: 68, hrv: 72, strain: 5.0,  recovery: 85, estimated_stress: 0.5, spo2: 99, skinTemp: 36.5, sleepPerformance: 0.90, state: 'RELAXED' },
    WIRED:      { heartRate: 88, hrv: 30, strain: 14.0, recovery: 52, estimated_stress: 1.5, spo2: 97, skinTemp: 36.7, sleepPerformance: 0.70, state: 'WIRED' }
};

const FAKE_INTERVENTIONS = [
    {
        message: "Looks like you've been stuck on this for a while. Want a hint?",
        priority: 'medium',
        reason: 'stuck_detected',
        buttons: ['Show Hint', 'Not Now'],
        app_type: 'code',
        code_suggestion: null,
        risky: false
    },
    {
        message: "Bug on line 7 -- you're passing None to a function that expects a list.",
        priority: 'high',
        reason: 'bug_detected',
        buttons: ['Apply Fix', 'Show More', 'Not Now'],
        app_type: 'code',
        code_suggestion: 'if items is not None:\n    total = sum(item.price for item in items)',
        risky: false
    },
    {
        message: 'Nice approach! Consider using a list comprehension here for cleaner code.',
        priority: 'low',
        reason: 'suggestion',
        buttons: ['Show Example', 'Not Now'],
        app_type: 'code',
        code_suggestion: 'total = sum(item.price for item in items)',
        risky: false
    },
    {
        message: 'Your tests are failing. The module path might be wrong.',
        priority: 'medium',
        reason: 'stuck_detected',
        buttons: ['Show Solution', 'Not Now'],
        app_type: 'terminal',
        code_suggestion: null,
        risky: false
    },
    {
        message: '\u26A0\uFE0F FATIGUE FIREWALL: Your recovery is 28%. Force pushing to main is risky right now. Sleep on it.',
        priority: 'critical',
        reason: 'fatigue_firewall',
        buttons: ['Push Anyway', 'Good Call'],
        app_type: 'terminal',
        code_suggestion: null,
        risky: true
    },
    {
        message: "You've been browsing Stack Overflow for 2 minutes. Want me to help directly?",
        priority: 'low',
        reason: 'browsing_help',
        buttons: ['Yes, Help', 'Not Now'],
        app_type: 'browser',
        code_suggestion: null,
        risky: false
    }
];

function jitter(value, percent) {
    const range = value * (percent / 100);
    return +(value + (Math.random() * range * 2 - range)).toFixed(1);
}

function getJitteredBiometrics() {
    const base = BIOMETRIC_PRESETS[currentState];
    return {
        heartRate: Math.round(jitter(base.heartRate, 5)),
        hrv: Math.round(jitter(base.hrv, 5)),
        strain: jitter(base.strain, 5),
        recovery: Math.round(jitter(base.recovery, 5)),
        estimated_stress: jitter(base.estimated_stress, 5),
        spo2: base.spo2,
        skinTemp: jitter(base.skinTemp, 1),
        sleepPerformance: jitter(base.sleepPerformance, 3),
        state: currentState
    };
}

function broadcast(msg) {
    const data = JSON.stringify(msg);
    connectedClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });
}

function randomIntervention() {
    const intervention = FAKE_INTERVENTIONS[Math.floor(Math.random() * FAKE_INTERVENTIONS.length)];
    const bio = getJitteredBiometrics();
    interventionCount++;
    const msg = {
        type: 'intervention',
        message: intervention.message,
        priority: intervention.priority,
        reason: intervention.reason,
        state: currentState,
        buttons: intervention.buttons,
        code_suggestion: intervention.code_suggestion,
        risky: intervention.risky,
        app_type: intervention.app_type,
        biometric: {
            heartRate: bio.heartRate,
            recovery: bio.recovery,
            strain: bio.strain,
            hrv: bio.hrv,
            estimated_stress: bio.estimated_stress,
            spo2: bio.spo2,
            skinTemp: bio.skinTemp,
            sleepPerformance: bio.sleepPerformance
        }
    };
    broadcast(msg);
    console.log(`\u{1F47B} Ghost intervention #${interventionCount}: ${intervention.message.slice(0, 60)}...`);
}

// Biometric update loop -- every 5 seconds
setInterval(() => {
    if (connectedClients.size === 0) return;
    const bio = getJitteredBiometrics();
    broadcast({
        type: 'biometric_update',
        ...bio
    });
}, 5000);

// Intervention loop -- every 20 seconds
setInterval(() => {
    if (connectedClients.size === 0) return;
    randomIntervention();
}, 20000);

wss.on('connection', (ws) => {
    connectedClients.add(ws);
    const sessionId = crypto.randomBytes(6).toString('hex');

    ws.send(JSON.stringify({
        type: 'connection_established',
        session_id: sessionId,
        mock_mode: true,
        current_state: currentState
    }));

    console.log(`\u2705 Client connected (total: ${connectedClients.size})`);

    ws.on('close', () => {
        connectedClients.delete(ws);
        console.log(`\u274C Client disconnected (total: ${connectedClients.size})`);
    });

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch (e) {
            console.error('Invalid JSON received:', raw.toString());
            return;
        }

        switch (msg.type) {
            case 'content_update':
                console.log(`\u{1F4DD} [${msg.app}] Content update (${msg.content.length} chars)`);
                // Simulate Ghost analyzing content -- send intervention after 3-5 seconds
                setTimeout(() => {
                    if (connectedClients.size > 0) randomIntervention();
                }, 3000 + Math.random() * 2000);
                break;

            case 'mock_state': {
                const oldState = currentState;
                currentState = STATE_NAMES[msg.state] || currentState;
                stateNumber = msg.state;
                const preset = BIOMETRIC_PRESETS[currentState];
                broadcast({
                    type: 'state_change',
                    from: oldState,
                    to: currentState,
                    reason: 'Mock state switch',
                    estimated_stress: preset.estimated_stress
                });
                // Immediately send biometric update with new state values
                const bio = getJitteredBiometrics();
                broadcast({
                    type: 'biometric_update',
                    ...bio
                });
                console.log(`\u{1F504} State: ${oldState} \u2192 ${currentState}`);
                break;
            }

            case 'feedback':
                console.log(`\u{1F44D} Feedback: ${msg.action}`);
                break;

            case 'app_focus':
                console.log(`\u{1F5A5}\uFE0F  App focus: ${msg.app || 'Room'}`);
                break;

            default:
                console.warn('Unknown message type:', msg.type);
        }
    });
});

console.log('');
console.log('\u{1F916} Ghost Test Server running on ws://localhost:8000');
console.log('\u{1F4CA} Biometric updates every 5s | Interventions every 20s');
console.log('\u{1F3AE} Waiting for connections...');
console.log('');
