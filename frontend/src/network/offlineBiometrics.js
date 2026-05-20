// Client-side biometric simulation so DevLife is never "dead" — used when there's no
// backend (deployed teaser, or locally before the server is up). It feeds the SAME
// socket events the real backend emits (biometric_update / state_change), so the entire
// HUD, dashboard, ghost colors/expressions and ECG light up and react to keys 1-5.
// The real backend always wins: this stops the moment the WebSocket connects.
//
// Presets mirror the backend mock_biometrics.py. (Ghost *speech* still needs the backend.)

const PRESETS = {
    1: { name: 'DEEP_FOCUS', heartRate: 62, strain: 10.2, recovery: 75, sleepPerformance: 0.85, hrv: 40, estimated_stress: 1.2, spo2: 97.5, skinTemp: 33.2 },
    2: { name: 'STRESSED',   heartRate: 95, strain: 18.5, recovery: 45, sleepPerformance: 0.72, hrv: 22, estimated_stress: 2.6, spo2: 96.0, skinTemp: 34.1 },
    3: { name: 'FATIGUED',   heartRate: 55, strain: 3.1,  recovery: 30, sleepPerformance: 0.45, hrv: 28, estimated_stress: 1.8, spo2: 95.5, skinTemp: 33.0 },
    4: { name: 'RELAXED',    heartRate: 68, strain: 4.5,  recovery: 85, sleepPerformance: 0.92, hrv: 72, estimated_stress: 0.4, spo2: 98.0, skinTemp: 33.5 },
    5: { name: 'WIRED',      heartRate: 88, strain: 14.3, recovery: 50, sleepPerformance: 0.70, hrv: 35, estimated_stress: 1.9, spo2: 96.5, skinTemp: 33.8 },
};

const NUMERIC = ['heartRate', 'strain', 'recovery', 'sleepPerformance', 'hrv', 'estimated_stress', 'spo2', 'skinTemp'];

export class OfflineBiometrics {
    constructor(socket) {
        this.socket = socket;
        this.preset = 4; // RELAXED
        this.cur = { ...PRESETS[4] };
        this.target = { ...PRESETS[4] };
        this._timer = null;
        this._active = false;
        this._prevHr = PRESETS[4].heartRate;
    }

    isActive() { return this._active; }

    start() {
        if (this._active) return;
        this._active = true;
        this._tick(); // populate immediately so nothing shows "CONNECTING"
        this._timer = setInterval(() => this._tick(), 1000);
    }

    stop() {
        this._active = false;
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }

    setState(presetNum) {
        if (!PRESETS[presetNum]) return;
        const prevName = PRESETS[this.preset].name;
        this.preset = presetNum;
        this.target = { ...PRESETS[presetNum] };
        const newName = this.target.name;
        if (prevName !== newName) {
            this.socket.emit('state_change', {
                from: prevName, to: newName,
                reason: 'Manual (offline demo)', estimated_stress: this.target.estimated_stress,
            });
        }
        this._tick();
    }

    _tick() {
        for (const k of NUMERIC) {
            this.cur[k] = this.cur[k] + (this.target[k] - this.cur[k]) * 0.25; // ease toward target
        }
        const hr = Math.round(this.cur.heartRate + (Math.random() * 4 - 2));
        const trend = hr > this._prevHr + 1 ? 'rising' : hr < this._prevHr - 1 ? 'falling' : 'stable';
        this._prevHr = hr;
        this.socket.emit('biometric_update', {
            type: 'biometric_update',
            source: 'offline',
            heartRate: hr,
            recovery: Math.round(this.cur.recovery),
            strain: Math.round(this.cur.strain * 10) / 10,
            state: this.target.name,
            sleepPerformance: Math.round(this.cur.sleepPerformance * 100) / 100,
            hrv: Math.round(this.cur.hrv * 10) / 10,
            estimated_stress: Math.round(this.cur.estimated_stress * 100) / 100,
            spo2: Math.round(this.cur.spo2 * 10) / 10,
            skinTemp: Math.round(this.cur.skinTemp * 10) / 10,
            recovery_velocity: null,
            baseline_hr: 68,
            hr_trend: trend,
        });
    }
}
