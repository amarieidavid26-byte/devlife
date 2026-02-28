// Biometric HUD overlay — top-right corner, HTML-based for easy styling

const STATE_COLORS = {
    DEEP_FOCUS: '#8000ff',
    STRESSED:   '#ff5050',
    FATIGUED:   '#ffa000',
    RELAXED:    '#00c864',
    WIRED:      '#0096ff',
};

// P-QRS-T waveform shape (0..1, where 0.5 = baseline, lower = spike upward)
const BEAT_SHAPE = [
    0.5, 0.5, 0.5, 0.5,
    0.44, 0.38, 0.38, 0.44,       // P-wave
    0.5, 0.5,                      // PQ interval
    0.58,                          // Q dip
    0.14, 0.07, 0.14,              // R spike (tall)
    0.64, 0.58,                    // S dip
    0.5, 0.5, 0.5,                 // ST segment
    0.40, 0.33, 0.30, 0.33, 0.40, // T wave
    0.5, 0.5, 0.5, 0.5,           // return to baseline
];

const ECG_W   = 220;
const ECG_H   = 50;

export class HUD {
    constructor() {
        this._connected = false;
        this._data = {
            heartRate:        '—',
            recovery:         '—',
            strain:           '—',
            hrv:              '—',
            state:            'CONNECTING',
            estimated_stress: 0,
        };

        // ECG state
        this._ecgBPM         = 72;
        this._ecgColor       = STATE_COLORS.RELAXED;
        this._ecgBuffer      = new Float32Array(ECG_W).fill(0.5);
        this._ecgMsSinceBeat = 0;
        this._ecgBeatIndex   = -1;  // -1 = idle, ≥0 = index into BEAT_SHAPE
        this._ecgLastTs      = null;

        this._el = this._createEl();
        document.body.appendChild(this._el);

        this._render();
        this._startEcgLoop();
    }

    _createEl() {
        const el = document.createElement('div');
        el.id = 'ghost-hud';
        el.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            width: 220px;
            background: rgba(10,10,25,0.80);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            overflow: hidden;
            font-family: 'Segoe UI', monospace, sans-serif;
            font-size: 13px;
            color: #cccccc;
            z-index: 150;
            pointer-events: none;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            line-height: 1.7;
        `;

        // ECG canvas sits flush at the top
        this._ecgCanvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        this._ecgCanvas.width  = ECG_W * dpr;
        this._ecgCanvas.height = ECG_H * dpr;
        this._ecgCanvas.style.cssText = `display:block;width:${ECG_W}px;height:${ECG_H}px;`;
        this._ecgCtx = this._ecgCanvas.getContext('2d');
        this._ecgCtx.scale(dpr, dpr);
        this._ecgDpr = dpr;
        el.appendChild(this._ecgCanvas);

        // Text area below canvas
        this._textEl = document.createElement('div');
        this._textEl.style.cssText = 'padding:10px 16px 12px;';
        el.appendChild(this._textEl);

        return el;
    }

    _startEcgLoop() {
        const tick = (ts) => {
            if (this._ecgLastTs !== null) {
                this._ecgTick(ts - this._ecgLastTs);
            }
            this._ecgLastTs = ts;
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    _ecgTick(deltaMs) {
        const buf = this._ecgBuffer;

        // Scroll the buffer one sample to the left
        buf.copyWithin(0, 1);

        // Advance beat accumulator
        this._ecgMsSinceBeat += deltaMs;
        const beatInterval = 60000 / Math.max(30, Math.min(220, this._ecgBPM));

        if (this._ecgBeatIndex < 0 && this._ecgMsSinceBeat >= beatInterval) {
            this._ecgMsSinceBeat -= beatInterval;
            this._ecgBeatIndex = 0;
        }

        // Write next beat sample or baseline to the rightmost slot
        if (this._ecgBeatIndex >= 0 && this._ecgBeatIndex < BEAT_SHAPE.length) {
            buf[ECG_W - 1] = BEAT_SHAPE[this._ecgBeatIndex++];
        } else {
            buf[ECG_W - 1] = 0.5;
            if (this._ecgBeatIndex >= BEAT_SHAPE.length) this._ecgBeatIndex = -1;
        }

        this._drawEcg();
    }

    _drawEcg() {
        const ctx  = this._ecgCtx;
        const W    = ECG_W;
        const H    = ECG_H;
        const col  = this._ecgColor;
        const buf  = this._ecgBuffer;

        ctx.clearRect(0, 0, W, H);

        // Dark background
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);

        // Faint grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let x = 44; x < W; x += 44) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

        // Trailing glow pass (wider, more transparent)
        ctx.save();
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.18;
        ctx.lineWidth   = 3.5;
        ctx.lineJoin    = 'round';
        ctx.beginPath();
        for (let x = 0; x < W; x++) {
            const y = buf[x] * (H - 10) + 5;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();

        // Main ECG line
        ctx.save();
        ctx.shadowBlur  = 7;
        ctx.shadowColor = col;
        ctx.strokeStyle = col;
        ctx.lineWidth   = 1.5;
        ctx.lineJoin    = 'round';
        ctx.globalAlpha = 1;
        ctx.beginPath();
        for (let x = 0; x < W; x++) {
            const y = buf[x] * (H - 10) + 5;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Leading dot
        const lastY = buf[W - 1] * (H - 10) + 5;
        ctx.shadowBlur  = 12;
        ctx.shadowColor = col;
        ctx.fillStyle   = col;
        ctx.beginPath();
        ctx.arc(W - 1, lastY, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    update(data) {
        this._data = { ...this._data, ...data };
        if (data.heartRate && data.heartRate !== '—') {
            this._ecgBPM = parseFloat(data.heartRate) || 72;
        }
        if (data.state && STATE_COLORS[data.state]) {
            this._ecgColor = STATE_COLORS[data.state];
        }
        this._render();
    }

    setConnected(v) {
        this._connected = v;
        this._render();
    }

    _render() {
        const d          = this._data;
        const stateColor = STATE_COLORS[d.state] || '#888888';

        const rec    = parseFloat(d.recovery);
        const recDot = isNaN(rec) ? '⚫' : rec >= 66 ? '🟢' : rec >= 33 ? '🟡' : '🔴';
        const recFmt = isNaN(rec) ? '—' : `${rec}%`;

        const stress         = parseFloat(d.estimated_stress) || 0;
        const stressBarWidth = Math.min(100, (stress / 3) * 100);
        const stressBarColor = stress < 1 ? '#00c864' : stress < 2 ? '#ffa000' : '#ff5050';

        const strainFmt = d.strain    !== '—' ? parseFloat(d.strain).toFixed(1)  : '—';
        const hrvFmt    = d.hrv       !== '—' ? `${Math.round(d.hrv)}ms`         : '—';
        const bpmFmt    = d.heartRate !== '—' ? `${Math.round(d.heartRate)}`     : '—';

        const connDot = this._connected
            ? '<span style="color:#00c864;font-size:10px;letter-spacing:0.05em">● LIVE</span>'
            : '<span style="color:#444;font-size:10px;letter-spacing:0.05em">● OFFLINE</span>';

        this._textEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span>❤️ <strong>${bpmFmt}</strong> bpm</span>
                <span>${connDot}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span>${recDot} Rec: <strong>${recFmt}</strong></span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:2px">
                <span>Strain: <strong>${strainFmt}</strong></span>
                <span>HRV: <strong>${hrvFmt}</strong></span>
            </div>
            <div style="margin:6px 0 4px">
                State: <strong style="color:${stateColor}">${d.state}</strong>
            </div>
            <div style="font-size:11px;color:#888;margin-bottom:4px">
                Stress ${stress.toFixed(1)}/3.0
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:6px;overflow:hidden">
                <div style="
                    width:${stressBarWidth}%;
                    height:100%;
                    background:${stressBarColor};
                    border-radius:4px;
                    transition: width 0.5s ease, background 0.5s ease;
                "></div>
            </div>
        `;
    }
}
