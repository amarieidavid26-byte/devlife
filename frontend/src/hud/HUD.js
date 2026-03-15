
const STATE_COLORS = {
    DEEP_FOCUS: '#9B6AFF',
    STRESSED:   '#FF7A6A',
    FATIGUED:   '#FFB84A',
    RELAXED:    '#6AD89A',
    WIRED:      '#6AB8FF',
};

const BEAT_SHAPE = [
    0.5, 0.5, 0.5, 0.5,
    0.44, 0.38, 0.38, 0.44,
    0.5, 0.5,
    0.58,
    0.14, 0.07, 0.14,
    0.64, 0.58,
    0.5, 0.5, 0.5,
    0.40, 0.33, 0.30, 0.33, 0.40,
    0.5, 0.5, 0.5, 0.5,
];

const ECG_W = 220;
const ECG_H = 50;

export class HUD {
    constructor() {
        this._connected = false;
        this._data = {
            heartRate:        '--',
            recovery:         '--',
            strain:           '--',
            hrv:              '--',
            state:            'CONNECTING',
            estimated_stress: 0,
        };

        this._ecgBPM = 72; // 72 = avg resting hr, looked this up on google
        this._ecgTargetBPM = 72;
        this._ecgColor = STATE_COLORS.RELAXED;
        this._ecgBuffer = new Float32Array(ECG_W).fill(0.5);
        this._ecgMsSinceBeat = 0;
        this._ecgBeatIndex = -1;
        this._ecgLastTs = null;

        this._sleepMode = false;
        this._lastHR = '--';
        this._sleepData = null;
        this._cqi = null;

        this._injectStyles();
        this._el = this._createEl();
        document.body.appendChild(this._el);

        this._render();
        this._startEcgLoop();
    }

    _injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes hud-pulse {
                0%   { transform: scale(1); }
                50%  { transform: scale(1.15); }
                100% { transform: scale(1); }
            }
            @keyframes hud-blink {
                0%, 100% { opacity: 1; }
                50%      { opacity: 0.3; }
            }
            #ghost-hud .hr-pulse.pulse {
                animation: hud-pulse 0.3s ease;
            }
            #ghost-hud .live-dot {
                animation: hud-blink 1s ease infinite;
            }
        `;
        document.head.appendChild(style);
    }

    _createEl() {
        const el = document.createElement('div');
        el.id = 'ghost-hud';
        el.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            width: 220px;
            background: rgba(42,36,28,0.85);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255,228,181,0.12);
            border-radius: 12px;
            overflow: hidden;
            font-family: 'Nunito', sans-serif;
            font-size: 13px;
            color: #F5F0E8;
            z-index: 150;
            pointer-events: none;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            line-height: 1.7;
        `;

        this._ecgCanvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        this._ecgCanvas.width = ECG_W * dpr;
        this._ecgCanvas.height = ECG_H * dpr;
        this._ecgCanvas.style.cssText = `display:block;width:${ECG_W}px;height:${ECG_H}px;`;
        this._ecgCtx = this._ecgCanvas.getContext('2d');
        this._ecgCtx.scale(dpr, dpr);
        this._ecgDpr = dpr;
        el.appendChild(this._ecgCanvas);

        const divider = document.createElement('div');
        divider.style.cssText = 'height:1px;background:rgba(255,228,181,0.1);';
        el.appendChild(divider);

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

        this._ecgBPM += (this._ecgTargetBPM - this._ecgBPM) * 0.05;

        buf.copyWithin(0, 1);

        const clampedDelta = Math.min(deltaMs, 50);
        this._ecgMsSinceBeat += clampedDelta;
        const beatInterval = 60000 / Math.max(30, Math.min(150, this._ecgBPM));

        if (this._ecgBeatIndex < 0 && this._ecgMsSinceBeat >= beatInterval) {
            this._ecgMsSinceBeat -= beatInterval;
            this._ecgBeatIndex = 0;
        }

        if (this._sleepMode) {
            if (!this._sleepPhase) this._sleepPhase = 0;
            this._sleepPhase += clampedDelta * 0.0008;
            buf[ECG_W - 1] = 0.5 + Math.sin(this._sleepPhase) * 0.06;
        } else if (this._ecgBeatIndex >= 0 && this._ecgBeatIndex < BEAT_SHAPE.length) {
            buf[ECG_W - 1] = BEAT_SHAPE[this._ecgBeatIndex++];
            this._sleepPhase = 0;
        } else {
            buf[ECG_W - 1] = 0.5;
            if (this._ecgBeatIndex >= BEAT_SHAPE.length) this._ecgBeatIndex = -1;
        }

        this._drawEcg();
    }

    // console.log('ecg tick')
    _drawEcg() {
        const ctx = this._ecgCtx;
        const W = ECG_W;
        const H = ECG_H;
        const col = this._ecgColor;
        const buf = this._ecgBuffer;

        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let x = 44; x < W; x += 44) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

        ctx.save();
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth   = 4;
        ctx.lineJoin    = 'round';
        ctx.beginPath();
        for (let x = 0; x < W; x++) {
            const y = buf[x] * (H - 10) + 5;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();

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
        const prevHR = this._data.heartRate;
        this._data = { ...this._data, ...data };
        if (data.heartRate && data.heartRate !== '--') {
            this._ecgTargetBPM = parseFloat(data.heartRate) || 72;
        }
        if (data.state && STATE_COLORS[data.state]) {
            this._ecgColor = STATE_COLORS[data.state];
        }
        this._render();

        // pulse HR display on change
        if (data.heartRate && data.heartRate !== prevHR) {
            const hrEl = this._textEl.querySelector('.hr-pulse');
            if (hrEl) {
                hrEl.classList.remove('pulse');
                void hrEl.offsetWidth;
                hrEl.classList.add('pulse');
                setTimeout(() => hrEl.classList.remove('pulse'), 300);
            }
        }
    }

    setConnected(v) {
        this._connected = v;
        this._render();
    }

    setVisible(visible) {
        this._el.style.display = visible ? '' : 'none';
    }

    setSleepData(data) {
        this._sleepData = data;
        this._render();
    }

    updateCQI(value) {
        this._cqi = value;
        this._render();
    }

    setSleepMode(active) {
        this._sleepMode = active;
        if (active) {
            this._ecgColor = '#4444aa';
        }
        this._render();
    }

    _renderSleep() {
        const s = this._sleepData;
        if (!s) return '';
        const score = s.score || 0;
        let icon, label, color;
        if (score > 80) { icon = '\u{1F634}'; label = 'Well rested'; color = '#6AD89A'; }
        else if (score >= 50) { icon = '\u{1F610}'; label = 'Fair sleep'; color = '#FFB84A'; }
        else { icon = '\u{1F635}'; label = 'Sleep deprived'; color = '#FF7A6A'; }
        return `
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,228,181,0.08)">
                <div style="font-size:10px;color:#B8A88C;margin-bottom:2px">
                    Last Night: ${s.hours.toFixed(1)}h · ${s.efficiency}% eff
                </div>
                <div style="font-size:10px;color:${color}">
                    ${icon} ${label}
                </div>
            </div>
        `;
    }

    // TODO: make this responsive
    _render() {
        const d          = this._data;
        const stateColor = this._sleepMode ? '#4444aa' : (STATE_COLORS[d.state] || '#888888');
        const stateLabel = this._sleepMode ? '😴 SLEEP MODE' : d.state;

        const rec    = parseFloat(d.recovery);
        const recDot = isNaN(rec) ? '⚫' : rec >= 66 ? '🟢' : rec >= 33 ? '🟡' : '🔴';
        const recFmt = isNaN(rec) ? '--' : `${rec}%`;

        const stress         = parseFloat(d.estimated_stress) || 0;
        const stressBarWidth = Math.min(100, (stress / 3) * 100);
        const stressBarColor = stress < 1 ? '#6AD89A' : stress < 2 ? '#FFB84A' : '#FF7A6A';

        const strainFmt = d.strain    !== '--' ? parseFloat(d.strain).toFixed(1)  : '--';
        const hrvFmt    = d.hrv       !== '--' ? `${Math.round(d.hrv)}ms`         : '--';
        const bpmFmt    = d.heartRate !== '--' ? `${Math.round(d.heartRate)}`     : '--';

        const connDot = this._connected
            ? '<span class="live-dot" style="color:#6AD89A;font-size:10px;letter-spacing:0.05em">● LIVE</span>'
            : '<span style="color:#444;font-size:10px;letter-spacing:0.05em">● OFFLINE</span>';

        this._textEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span class="hr-pulse" style="display:inline-block">❤️ <strong style="font-family:monospace">${bpmFmt}</strong> bpm</span>
                <span>${connDot}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span>${recDot} Rec: <strong>${recFmt}</strong></span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:2px">
                <span>Strain: <strong>${strainFmt}</strong></span>
                <span>HRV: <strong style="font-family:monospace">${hrvFmt}</strong></span>
            </div>
            <div style="margin:6px 0 4px">
                State: <strong style="color:${stateColor};font-family:'Fredoka',sans-serif;font-weight:600">${stateLabel}</strong>${this._cqi != null ? ` · <span style="font-size:11px;color:${this._cqi >= 80 ? '#6AD89A' : this._cqi >= 50 ? '#FFB84A' : '#FF7A6A'}">CQI: ${Math.round(this._cqi)}%</span>` : ''}
            </div>
            <div style="font-size:11px;color:#B8A88C;margin-bottom:4px">
                Stress ${stress.toFixed(1)}/3.0
            </div>
            <div style="background:rgba(255,228,181,0.08);border-radius:4px;height:6px;overflow:hidden">
                <div style="
                    width:${stressBarWidth}%;
                    height:100%;
                    background:${stressBarColor};
                    border-radius:4px;
                    transition: width 0.5s ease, background 0.5s ease;
                "></div>
            </div>
            ${this._sleepData ? this._renderSleep() : ''}
        `;
    }
}
