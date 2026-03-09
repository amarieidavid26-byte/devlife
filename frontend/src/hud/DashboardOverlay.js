const STATE_COLORS = {
    DEEP_FOCUS: '#8000ff',
    STRESSED:   '#ff5050',
    FATIGUED:   '#ffa000',
    RELAXED:    '#00c864',
    WIRED:      '#0096ff',
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

const REC_ARC_LEN    = 172.79;
const COG_CIRC       = 301.59;
const HRV_MAX_POINTS = 30;

let _stylesInjected = false;

function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const s = document.createElement('style');
    s.id = 'dov-styles';
    s.textContent = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;600;700;800&display=swap');

#dov-root {
    position:fixed;top:0;left:0;width:100%;height:100%;
    overflow:hidden;
    background:rgba(10,10,25,0.92);
    color:#e0e0e0;
    font-family:'Inter',system-ui,sans-serif;
    z-index:500;
    display:none;
}
#dov-root::before {
    content:'';position:absolute;top:0;left:0;width:100%;height:100%;
    background-image:
        linear-gradient(rgba(255,255,255,0.008) 1px,transparent 1px),
        linear-gradient(90deg,rgba(255,255,255,0.008) 1px,transparent 1px);
    background-size:48px 48px;
    pointer-events:none;z-index:0;
}
#dov-root * { box-sizing:border-box; margin:0; padding:0; }

#dov-root .dash {
    display:grid;
    grid-template-columns:60fr 40fr;
    grid-template-rows:48px 1fr 150px;
    width:100%;height:100%;gap:0;
    position:relative;z-index:1;
    border:2px solid transparent;transition:border-color 0.4s;
}
#dov-root .dash.pulse { animation:dovBorderPulse 2s ease-out; }
@keyframes dovBorderPulse { 0%{border-color:var(--dov-state-color)} 100%{border-color:transparent} }

#dov-root .topbar {
    grid-column:1/-1;
    display:flex;align-items:center;justify-content:space-between;
    padding:0 32px;
    background:rgba(0,0,0,0.4);
    border-bottom:1px solid rgba(255,255,255,0.06);
}
#dov-root .topbar-logo { font-family:'JetBrains Mono',monospace;font-weight:700;letter-spacing:0.18em;color:#fff;font-size:13px; }
#dov-root .topbar-logo span { color:var(--dov-state-color,#00c864);transition:color 0.5s; }
#dov-root .topbar-clock { font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:600;color:#ccc;letter-spacing:0.1em; }
#dov-root .topbar-right { display:flex;align-items:center;gap:10px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.06em; }
#dov-root .session-dot { width:8px;height:8px;border-radius:50%;background:#333;transition:background 0.3s;flex-shrink:0; }
#dov-root .session-dot.on { background:#00c864;animation:dovPulseGlow 2s ease-in-out infinite; }
@keyframes dovPulseGlow { 0%,100%{box-shadow:0 0 4px rgba(0,200,100,0.3)} 50%{box-shadow:0 0 12px rgba(0,200,100,0.7)} }
#dov-root .tab-hint { color:#444;font-size:11px;letter-spacing:0.06em; }

#dov-root .left {
    padding:32px 40px;
    display:flex;flex-direction:column;gap:32px;
    border-right:1px solid rgba(255,255,255,0.05);
    overflow-y:auto;scrollbar-width:none;
}
#dov-root .left::-webkit-scrollbar { display:none; }
#dov-root .sec-hdr { font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#aaa;font-weight:600;margin-bottom:12px; }
#dov-root .hr-section { display:flex;flex-direction:column; }
#dov-root .hr-row { display:flex;align-items:baseline;gap:14px; }
#dov-root .hr-heart { font-size:34px;display:inline-block;transform-origin:center; }
#dov-root .hr-value {
    font-family:'JetBrains Mono',monospace;font-size:100px;font-weight:700;
    color:#ffffff;line-height:1;transition:opacity 0.1s;
    text-shadow:0 0 20px var(--dov-state-color,rgba(0,200,100,0.3));
}
#dov-root .hr-unit { font-family:'JetBrains Mono',monospace;font-size:24px;color:#888;font-weight:400; }
@keyframes dovHeartbeat { 0%,100%{transform:scale(1)} 15%{transform:scale(1.25)} 30%{transform:scale(1)} }

#dov-root .metrics { display:flex;gap:48px; }
#dov-root .metric .val {
    font-family:'JetBrains Mono',monospace;font-size:42px;font-weight:700;
    color:#ffffff;line-height:1;
    text-shadow:0 0 12px var(--dov-state-color,rgba(0,200,100,0.2));
}
#dov-root .metric .unit { font-size:18px;font-weight:400;color:#888; }
#dov-root .metric .lbl { font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#aaa;margin-top:6px; }

#dov-root .state-name {
    font-family:'JetBrains Mono',monospace;font-size:64px;font-weight:700;
    line-height:1;transition:color 0.5s;
}
#dov-root .state-lbl { font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#aaa;margin-top:8px; }

#dov-root .stress-header { display:flex;justify-content:space-between;align-items:center;margin-bottom:8px; }
#dov-root .stress-header .lbl { font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#aaa; }
#dov-root .stress-header .val { font-family:'JetBrains Mono',monospace;font-size:14px;color:#ccc; }
#dov-root .stress-track { width:100%;height:8px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden; }
#dov-root .stress-fill { height:100%;border-radius:4px;transition:width 0.6s ease,background 0.6s ease; }

#dov-root .hrv-spark-canvas { width:100%;height:80px;display:block;border-radius:6px;background:rgba(0,0,0,0.2); }
#dov-root .gauges-row { display:flex;gap:48px;align-items:flex-start; }
#dov-root .gauge-box { text-align:center; }
#dov-root .gauge-box .sec-hdr { margin-bottom:8px; }
#dov-root .gauge-val { font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;color:#ffffff; }
#dov-root .gauge-sub { font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#aaa;margin-top:4px; }

#dov-root .right {
    padding:32px 28px;
    display:flex;flex-direction:column;gap:24px;
    border-left:1px solid rgba(255,255,255,0.05);
    overflow-y:auto;scrollbar-width:none;
}
#dov-root .right::-webkit-scrollbar { display:none; }

#dov-root .threat {
    display:flex;align-items:center;gap:14px;
    padding:16px 20px;border-radius:8px;
    background:rgba(0,0,0,0.25);
    border:1px solid rgba(255,255,255,0.04);
    transition:border-color 0.4s;
}
#dov-root .threat-dot { width:14px;height:14px;border-radius:50%;flex-shrink:0;transition:all 0.4s; }
#dov-root .threat-label { font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#aaa; }
#dov-root .threat-val { font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;letter-spacing:1px;transition:color 0.4s; }
#dov-root .threat.nominal .threat-dot { background:#00c864;box-shadow:0 0 10px rgba(0,200,100,0.5); }
#dov-root .threat.nominal .threat-val { color:#00c864; }
#dov-root .threat.nominal { border-color:rgba(0,200,100,0.12); }
#dov-root .threat.elevated .threat-dot { background:#ffa000;box-shadow:0 0 10px rgba(255,160,0,0.5); }
#dov-root .threat.elevated .threat-val { color:#ffa000; }
#dov-root .threat.elevated { border-color:rgba(255,160,0,0.12); }
#dov-root .threat.critical .threat-dot { background:#ff5050;box-shadow:0 0 10px rgba(255,80,80,0.5);animation:dovPulseRed 1s ease-in-out infinite; }
#dov-root .threat.critical .threat-val { color:#ff5050; }
#dov-root .threat.critical { border-color:rgba(255,80,80,0.15); }
@keyframes dovPulseRed { 0%,100%{box-shadow:0 0 8px rgba(255,80,80,0.4)} 50%{box-shadow:0 0 22px rgba(255,80,80,0.9)} }

#dov-root .int-count {
    font-family:'JetBrains Mono',monospace;font-size:14px;color:#ccc;
    letter-spacing:1px;padding-bottom:4px;
    border-bottom:1px solid rgba(255,255,255,0.04);
}
#dov-root .int-count strong { font-size:20px;color:#ffffff;font-weight:700; }

#dov-root .log-title { font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#aaa;font-weight:600; }
#dov-root .log-scroll { flex:1;overflow-y:auto;scrollbar-width:none; }
#dov-root .log-scroll::-webkit-scrollbar { display:none; }
#dov-root .log-entry { padding:16px 0;border-bottom:1px solid rgba(255,255,255,0.03); }
#dov-root .log-meta { display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap; }
#dov-root .log-icon { font-size:14px;line-height:1; }
#dov-root .log-time { font-family:'JetBrains Mono',monospace;font-size:11px;color:#888; }
#dov-root .log-badge { padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;color:#fff; }
#dov-root .log-state { padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600;color:#fff; }
#dov-root .log-msg { font-size:13px;color:#ddd;line-height:1.55; }
#dov-root .log-entry.critical {
    background:rgba(255,50,50,0.04);border-left:3px solid #ff5050;
    padding-left:14px;margin-left:-14px;
}
#dov-root .log-empty { color:#666;font-size:13px;letter-spacing:0.08em;padding:40px 0;text-align:center;font-family:'JetBrains Mono',monospace; }

#dov-root .bottom {
    grid-column:1/-1;
    border-top:1px solid rgba(255,255,255,0.06);
    position:relative;background:rgba(0,0,0,0.3);
    transition:border-color 0.3s;
}
#dov-root .bottom.alarm { border-top:2px solid #ff5050;animation:dovEcgAlarm 0.8s ease-in-out infinite; }
@keyframes dovEcgAlarm { 0%,100%{border-top-color:#ff5050} 50%{border-top-color:rgba(255,50,50,0.15)} }
#dov-root .ecg-canvas { width:100%;height:100%;display:block; }
#dov-root .ecg-lbl-left { position:absolute;top:12px;left:20px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:2px; }
#dov-root .ecg-lbl-right { position:absolute;top:10px;right:24px;display:flex;align-items:baseline;gap:5px; }
#dov-root .ecg-bpm-num { font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;color:#ccc;transition:color 0.3s; }
#dov-root .ecg-bpm-unit { font-family:'JetBrains Mono',monospace;font-size:12px;color:#888; }
`;
    document.head.appendChild(s);
}

export class DashboardOverlay {
    constructor() {
        injectStyles();
        this._visible = false;

        this._ecgColor       = STATE_COLORS.RELAXED;
        this._ecgTargetBPM   = 72;
        this._ecgBPM         = 72;
        this._ecgBuffer      = [];
        this._ecgBeatIndex   = -1;
        this._ecgMsSinceBeat = 0;
        this._ecgLastTs      = null;

        this._targetHR  = 0; this._displayHR  = 0;
        this._targetHRV = 0; this._displayHRV = 0;
        this._targetRec = 0; this._displayRec = 0;
        this._targetStrain = 0; this._displayStrain = 0;
        this._targetStress = 0; this._displayStress = 0;

        this._curState      = 'RELAXED';
        this._interventions = [];
        this._intTotalCount = 0;
        this._hrvHistory    = [];
        this._heartbeatTimer = null;
        this._isConnected   = false;
        this._sessionStart  = null;

        this._buildDOM();
        this._startLoops();
        this._startClock();
    }


    _buildDOM() {
        this._el = document.createElement('div');
        this._el.id = 'dov-root';
        this._el.innerHTML = `
<div class="dash" id="dov-dash">

    <div class="topbar">
        <div class="topbar-logo">DEVLIFE <span id="dov-topbar-accent">&times;</span> GHOST</div>
        <div class="topbar-clock" id="dov-clock">--:--:--</div>
        <div class="topbar-right">
            <span class="session-dot" id="dov-session-dot"></span>
            <span id="dov-session-label" style="color:#888">OFFLINE</span>
            <span id="dov-session-timer" style="color:#888">00:00:00</span>
            <span class="tab-hint">&nbsp;&middot;&nbsp;TAB to close</span>
        </div>
    </div>

    <div class="left">

        <div class="hr-section">
            <div class="sec-hdr">Cardiac Output</div>
            <div class="hr-row">
                <span class="hr-heart" id="dov-heart">&#10084;&#65039;</span>
                <span class="hr-value" id="dov-hr">--</span>
                <span class="hr-unit">BPM</span>
            </div>
        </div>

        <div class="metrics">
            <div class="metric">
                <div><span class="val" id="dov-hrv">--</span><span class="unit"> ms</span></div>
                <div class="lbl">HRV</div>
            </div>
            <div class="metric">
                <div><span class="val" id="dov-rec">--</span><span class="unit"> %</span></div>
                <div class="lbl">Recovery</div>
            </div>
            <div class="metric">
                <div><span class="val" id="dov-strain">--</span></div>
                <div class="lbl">Strain</div>
            </div>
        </div>

        <div class="state-section">
            <div class="state-name" id="dov-state" style="color:var(--dov-state-color,#666)">CONNECTING</div>
            <div class="state-lbl">Cognitive State</div>
        </div>

        <div class="stress-section">
            <div class="stress-header">
                <span class="lbl">Stress Level</span>
                <span class="val" id="dov-stress-val">0.0 / 3.0</span>
            </div>
            <div class="stress-track">
                <div class="stress-fill" id="dov-stress-bar" style="width:0%;background:#00c864"></div>
            </div>
        </div>

        <div class="hrv-section">
            <div class="sec-hdr">HRV Trend</div>
            <canvas class="hrv-spark-canvas" id="dov-hrv-spark"></canvas>
        </div>

        <div class="gauges-row">
            <div class="gauge-box">
                <div class="sec-hdr">Recovery Zones</div>
                <svg width="140" height="80" viewBox="0 0 140 80">
                    <path d="M15 72 A55 55 0 0 1 125 72" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="8" stroke-linecap="round"/>
                    <path d="M15 72 A55 55 0 0 1 125 72" fill="none" stroke="url(#dovRecGrad)" stroke-width="3" stroke-linecap="round" opacity="0.12"/>
                    <path d="M15 72 A55 55 0 0 1 125 72" fill="none" stroke="#00c864" stroke-width="8" stroke-linecap="round"
                          id="dov-rec-arc" stroke-dasharray="172.79" stroke-dashoffset="172.79"
                          style="transition:stroke-dashoffset 0.6s ease,stroke 0.4s"/>
                    <line x1="70" y1="72" x2="70" y2="22" stroke="#e0e0e0" stroke-width="1.5" stroke-linecap="round"
                          id="dov-rec-needle" style="transform-origin:70px 72px;transition:transform 0.6s ease"/>
                    <defs><linearGradient id="dovRecGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%"   stop-color="#ff5050"/><stop offset="33%" stop-color="#ff5050"/>
                        <stop offset="34%"  stop-color="#ffa000"/><stop offset="66%" stop-color="#ffa000"/>
                        <stop offset="67%"  stop-color="#00c864"/><stop offset="100%" stop-color="#00c864"/>
                    </linearGradient></defs>
                </svg>
                <div class="gauge-val" id="dov-rec-gauge-val">--%</div>
                <div class="gauge-sub">Recovery</div>
            </div>

            <div class="gauge-box">
                <div class="sec-hdr">Cognitive Load</div>
                <div style="position:relative;width:120px;height:120px">
                    <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="7"/>
                        <circle cx="60" cy="60" r="48" fill="none" stroke="#0096ff" stroke-width="7"
                                stroke-dasharray="301.59" stroke-dashoffset="301.59" stroke-linecap="round"
                                id="dov-cog-fill"
                                style="transition:stroke-dashoffset 0.6s ease,stroke 0.4s;transform:rotate(-90deg);transform-origin:60px 60px"/>
                    </svg>
                    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
                        <div class="gauge-val" id="dov-cog-val" style="font-size:24px">0%</div>
                        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#aaa;margin-top:2px">INDEX</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="right">
        <div class="threat nominal" id="dov-threat">
            <div class="threat-dot"></div>
            <div>
                <div class="threat-label">Threat Level</div>
                <div class="threat-val" id="dov-threat-val">NOMINAL</div>
            </div>
        </div>
        <div class="int-count" id="dov-int-count"><strong>0</strong> INTERVENTIONS</div>
        <div class="log-title">Intervention Log</div>
        <div class="log-scroll" id="dov-log">
            <div class="log-empty" id="dov-log-empty">Monitoring...</div>
        </div>
    </div>

    <div class="bottom" id="dov-ecg-container">
        <div class="ecg-lbl-left">Lead II &middot; ECG</div>
        <div class="ecg-lbl-right">
            <span class="ecg-bpm-num" id="dov-ecg-bpm-num">72</span>
            <span class="ecg-bpm-unit">BPM</span>
        </div>
        <canvas class="ecg-canvas" id="dov-ecg"></canvas>
    </div>

</div>`;
        document.body.appendChild(this._el);

        this._$ = {
            dash:         this._el.querySelector('#dov-dash'),
            clock:        this._el.querySelector('#dov-clock'),
            sessionDot:   this._el.querySelector('#dov-session-dot'),
            sessionLabel: this._el.querySelector('#dov-session-label'),
            sessionTimer: this._el.querySelector('#dov-session-timer'),
            topbarAccent: this._el.querySelector('#dov-topbar-accent'),
            heart:        this._el.querySelector('#dov-heart'),
            hr:           this._el.querySelector('#dov-hr'),
            hrv:          this._el.querySelector('#dov-hrv'),
            rec:          this._el.querySelector('#dov-rec'),
            strain:       this._el.querySelector('#dov-strain'),
            state:        this._el.querySelector('#dov-state'),
            stressVal:    this._el.querySelector('#dov-stress-val'),
            stressBar:    this._el.querySelector('#dov-stress-bar'),
            log:          this._el.querySelector('#dov-log'),
            logEmpty:     this._el.querySelector('#dov-log-empty'),
            ecgContainer: this._el.querySelector('#dov-ecg-container'),
            ecgCanvas:    this._el.querySelector('#dov-ecg'),
            ecgBpmNum:    this._el.querySelector('#dov-ecg-bpm-num'),
            sparkCanvas:  this._el.querySelector('#dov-hrv-spark'),
            recArc:       this._el.querySelector('#dov-rec-arc'),
            recNeedle:    this._el.querySelector('#dov-rec-needle'),
            recGaugeVal:  this._el.querySelector('#dov-rec-gauge-val'),
            cogFill:      this._el.querySelector('#dov-cog-fill'),
            cogVal:       this._el.querySelector('#dov-cog-val'),
            threat:       this._el.querySelector('#dov-threat'),
            threatVal:    this._el.querySelector('#dov-threat-val'),
            intCount:     this._el.querySelector('#dov-int-count'),
        };

        this._ecgCtx   = this._$.ecgCanvas.getContext('2d');
        this._sparkCtx = this._$.sparkCanvas.getContext('2d');

        this._resizeECG();
        this._resizeSpark();
        window.addEventListener('resize', () => { this._resizeECG(); this._resizeSpark(); });
    }


    _resizeECG() {
        const canvas = this._$.ecgCanvas;
        const rect   = canvas.parentElement.getBoundingClientRect();
        const dpr    = window.devicePixelRatio || 1;
        canvas.width  = rect.width  * dpr;
        canvas.height = rect.height * dpr;
        this._ecgCtx.setTransform(1, 0, 0, 1, 0, 0);
        this._ecgCtx.scale(dpr, dpr);
        canvas._w = rect.width;
        canvas._h = rect.height;
        const newLen = Math.ceil(rect.width);
        const old    = this._ecgBuffer;
        this._ecgBuffer = new Array(newLen).fill(0.5);
        if (old.length) {
            const start = Math.max(0, old.length - newLen);
            for (let i = start; i < old.length; i++) this._ecgBuffer[newLen - (old.length - i)] = old[i];
        }
    }

    _resizeSpark() {
        const canvas = this._$.sparkCanvas;
        const rect   = canvas.parentElement.getBoundingClientRect();
        const dpr    = window.devicePixelRatio || 1;
        canvas.width  = rect.width * dpr;
        canvas.height = 80 * dpr;
        this._sparkCtx.setTransform(1, 0, 0, 1, 0, 0);
        this._sparkCtx.scale(dpr, dpr);
        canvas._w = rect.width;
        canvas._h = 80;
    }


    _startClock() {
        const padZ = n => (n < 10 ? '0' : '') + n;
        setInterval(() => {
            const now = new Date();
            this._$.clock.textContent =
                padZ(now.getHours()) + ':' + padZ(now.getMinutes()) + ':' + padZ(now.getSeconds());
            if (this._sessionStart && this._isConnected) {
                const s = Math.floor((Date.now() - this._sessionStart) / 1000);
                this._$.sessionTimer.textContent =
                    padZ(Math.floor(s / 3600)) + ':' + padZ(Math.floor((s % 3600) / 60)) + ':' + padZ(s % 60);
            }
        }, 1000);
    }


    _startLoops() {
        const ecgTick = (ts) => {
            if (this._ecgLastTs !== null && this._ecgBuffer.length > 0) {
                const delta = Math.min(ts - this._ecgLastTs, 50);
                this._ecgBPM += (this._ecgTargetBPM - this._ecgBPM) * 0.05;
                const beatInterval = 60000 / Math.max(30, Math.min(150, this._ecgBPM));
                this._ecgMsSinceBeat += delta;
                if (this._ecgBeatIndex < 0 && this._ecgMsSinceBeat >= beatInterval) {
                    this._ecgMsSinceBeat -= beatInterval;
                    this._ecgBeatIndex = 0;
                }
                this._ecgBuffer.shift();
                if (this._ecgBeatIndex >= 0 && this._ecgBeatIndex < BEAT_SHAPE.length) {
                    this._ecgBuffer.push(BEAT_SHAPE[this._ecgBeatIndex++]);
                } else {
                    this._ecgBuffer.push(0.5);
                    if (this._ecgBeatIndex >= BEAT_SHAPE.length) this._ecgBeatIndex = -1;
                }
                this._drawECG();
            }
            this._ecgLastTs = ts;
            requestAnimationFrame(ecgTick);
        };
        requestAnimationFrame(ecgTick);

        const lerpLoop = () => {
            this._displayHR     += (this._targetHR     - this._displayHR)     * 0.12;
            this._displayHRV    += (this._targetHRV    - this._displayHRV)    * 0.12;
            this._displayRec    += (this._targetRec    - this._displayRec)    * 0.12;
            this._displayStrain += (this._targetStrain - this._displayStrain) * 0.12;
            this._displayStress += (this._targetStress - this._displayStress) * 0.12;

            const $ = this._$;
            if (this._targetHR     > 0) $.hr.textContent     = Math.round(this._displayHR);
            if (this._targetHRV    > 0) $.hrv.textContent    = Math.round(this._displayHRV);
            if (this._targetRec    > 0) $.rec.textContent    = Math.round(this._displayRec);
            if (this._targetStrain > 0) $.strain.textContent = this._displayStrain.toFixed(1);

            $.stressVal.textContent = this._displayStress.toFixed(1) + ' / 3.0';
            $.stressBar.style.width = (Math.min(this._displayStress / 3, 1) * 100) + '%';
            $.stressBar.style.background =
                this._displayStress > 2 ? '#ff5050' : this._displayStress > 1 ? '#ffa000' : '#00c864';

            const bpmRound = Math.round(this._ecgBPM);
            $.ecgBpmNum.textContent = bpmRound;
            $.ecgBpmNum.style.color = bpmRound > 100 ? '#ff5050' : '#ccc';
            if (bpmRound > 100) $.ecgContainer.classList.add('alarm');
            else                $.ecgContainer.classList.remove('alarm');

            const recPct = Math.max(0, Math.min(100, this._displayRec));
            $.recArc.setAttribute('stroke-dashoffset', (REC_ARC_LEN * (1 - recPct / 100)).toFixed(2));
            $.recArc.setAttribute('stroke', recPct < 33 ? '#ff5050' : recPct < 67 ? '#ffa000' : '#00c864');
            $.recNeedle.setAttribute('transform', 'rotate(' + (-90 + (recPct / 100) * 180) + ')');
            $.recGaugeVal.textContent = (this._targetRec > 0 ? Math.round(this._displayRec) : '--') + '%';

            const cogPct = Math.min(100, (this._displayStress / 3) * 100);
            $.cogFill.setAttribute('stroke-dashoffset', (COG_CIRC * (1 - cogPct / 100)).toFixed(2));
            $.cogFill.setAttribute('stroke', cogPct > 66 ? '#ff5050' : cogPct > 33 ? '#ffa000' : '#0096ff');
            $.cogVal.textContent = Math.round(cogPct) + '%';

            this._drawSparkline();
            this._updateThreat();
            requestAnimationFrame(lerpLoop);
        };
        requestAnimationFrame(lerpLoop);
    }


    _drawECG() {
        const canvas = this._$.ecgCanvas;
        const W = canvas._w, H = canvas._h;
        if (!W) return;
        const ctx = this._ecgCtx;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)'; ctx.lineWidth = 0.5;
        for (let x = 0; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
        for (let y = 0; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 100) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
        for (let y = 0; y < H; y += 100) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();
        const buf = this._ecgBuffer, len = buf.length, pad = 12;
        ctx.save();
        ctx.strokeStyle = this._ecgColor; ctx.globalAlpha = 0.15; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath();
        for (let i = 0; i < len; i++) { const x=(i/len)*W, y=buf[i]*(H-pad*2)+pad; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
        ctx.stroke(); ctx.restore();

        ctx.save();
        ctx.shadowBlur = 10; ctx.shadowColor = this._ecgColor;
        ctx.strokeStyle = this._ecgColor; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < len; i++) { const x=(i/len)*W, y=buf[i]*(H-pad*2)+pad; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
        ctx.stroke();
        const lastY = buf[len-1]*(H-pad*2)+pad;
        ctx.shadowBlur = 16; ctx.fillStyle = this._ecgColor;
        ctx.beginPath(); ctx.arc(W-1, lastY, 3.5, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }

    _hexToRgba(hex, a) {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        return `rgba(${r},${g},${b},${a})`;
    }

    _drawSparkline() {
        const canvas = this._$.sparkCanvas;
        const W = canvas._w, H = canvas._h;
        if (!W || this._hrvHistory.length < 2) return; 
        const ctx = this._sparkCtx;
        const vals = this._hrvHistory;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, 0, W, H);
        const min  = Math.max(0, Math.min(...vals) - 5);
        const max  = Math.max(...vals) + 5;
        const range = max - min || 1;
        const padX = 6, padY = 14;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(padX, H - padY);
        for (let i = 0; i < vals.length; i++) {
            const x = padX + (i / (HRV_MAX_POINTS - 1)) * (W - padX * 2);
            const y = H - padY - ((vals[i] - min) / range) * (H - padY * 2);
            ctx.lineTo(x,y);
        }
        ctx.lineTo(padX + ((vals.length-1) / (HRV_MAX_POINTS-1)) * (W - padX*2), H - padY);
        ctx.closePath();
        ctx.fillStyle = this._hexToRgba(this._ecgColor, 0.08);
        ctx.fill(); ctx.restore();

        ctx.save();
        ctx.strokeStyle = this._ecgColor; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.shadowBlur = 8; ctx.shadowColor = this._ecgColor; ctx.beginPath();
        for (let i = 0; i < vals.length; i++) {
            const x = padX + (i / (HRV_MAX_POINTS - 1)) * (W - padX * 2);
            const y = H - padY - ((vals[i] - min) / range) * (H - padY * 2);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0; ctx.fillStyle = this._ecgColor;
        for (let i = 0; i < vals.length; i++) {
            const x = padX + (i / (HRV_MAX_POINTS - 1)) * (W - padX * 2);
            const y = H - padY - ((vals[i] - min) / range) * (H - padY * 2);
            ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#999'; ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(max) + ' ms', W - 8, 12);
        ctx.textAlign = 'left'; ctx.fillStyle = this._ecgColor;
        ctx.fillText(Math.round(vals[vals.length - 1]) + ' ms', 8, 12);
    }

    _syncHeartBeat(bpm) {
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        const ms = Math.max(300, 60000 / (bpm || 72));
        const heart = this._$.heart;
        const hr = this._$.hr;
        this._heartbeatTimer = setInterval(() => {
            heart.style.animation = 'none';
            void heart.offsetWidth;
            heart.style.animation = 'dovHeartbeat 0.3s ease';
            hr.style.opacity = '0.6';
            setTimeout(() => { hr.style.opacity = '1'; }, 100);
        }, ms);
    }

    _applyState(s) {
        if (!STATE_COLORS[s]) return;
        const changed = s !== this._curState;
        this._curState = s;
        const color = STATE_COLORS[s];
        this._ecgColor = color;
        const $ = this._$;

        $.state.textContent = s;
        $.state.style.color = color;
        $.state.style.textShadow = `0 0 24px ${color}, 0 0 48px ${this._hexToRgba(color, 0.3)}`;
        $.topbarAccent.style.color = color;
        this._el.style.setProperty('--dov-state-color', color);
        $.hr.style.textShadow     = `0 0 20px ${this._hexToRgba(color, 0.3)}`;
        $.hrv.style.textShadow    = `0 0 12px ${this._hexToRgba(color, 0.15)}`;
        $.rec.style.textShadow    = `0 0 12px ${this._hexToRgba(color, 0.15)}`;
        $.strain.style.textShadow = `0 0 12px ${this._hexToRgba(color, 0.15)}`;
        if (changed) { 
            $.dash.classList.remove('pulse');
            void $.dash.offsetWidth;
            $.dash.classList.add('pulse');
        }
    }

    _updateThreat() {
        let level = 'nominal';
        if (this._curState === 'STRESSED' || this._displayStress > 2)                       level = 'critical';
        else if (this._curState === 'FATIGUED' || this._curState === 'WIRED' || this._displayStress > 1) level = 'elevated';
        this._$.threat.className   = 'threat ' + level;
        this._$.threatVal.textContent = level.toUpperCase();
    }


    update(data) {
        if (data.heartRate) {
            this._targetHR = data.heartRate;
            this._ecgTargetBPM = data.heartRate;
            this._syncHeartBeat(data.heartRate);
        }
        if (data.hrv > 0) {
            this._targetHRV = data.hrv;
            this._hrvHistory.push(data.hrv);
            if (this._hrvHistory.length > HRV_MAX_POINTS)
                this._hrvHistory.shift();
        }
        if (data.recovery) this._targetRec = data.recovery;
        if (data.strain) this._targetStrain = data.strain;
        if (data.estimated_stress !== undefined) this._targetStress = data.estimated_stress;
        if (data.state) this._applyState(data.state);
    }

    setState(s){
        this._applyState(s);
    }

    ddIntervention(msg) {
        const $ = this._$;
        $.logEmpty.style.display = 'none';
        msg._time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this._interventions.unshift(msg);
        if (this._interventions.length > 8) this._interventions.pop();
        this._intTotalCount++;
        $.intCount.innerHTML = `<strong>${this._intTotalCount}</strong> INTERVENTION${this._intTotalCount !== 1 ? 'S' : ''}`;

        $.log.innerHTML = '';
        this._interventions.forEach(m => {
            const isCritical  = m.priority === 'critical';
            const stateColor  = STATE_COLORS[m.state] || '#888';
            const prioColor   = m.priority === 'critical' ? '#ff5050' : m.priority === 'high' ? '#ffa000' : m.priority === 'medium' ? '#0096ff' : '#444';
            const icon        = (m.message && m.message.includes('FIREWALL')) ? '🛡️' : m.priority === 'critical' ? '⚠️' : '💡';
            const div         = document.createElement('div');
            div.className     = 'log-entry' + (isCritical ? ' critical' : '');
            div.innerHTML     =
                `<div class="log-meta">` +
                    `<span class="log-icon">${icon}</span>` +
                    `<span class="log-time">${m._time || ''}</span>` +
                    `<span class="log-state" style="background:${stateColor}">${m.state || ''}</span>` +
                    `<span class="log-badge" style="background:${prioColor}">${m.priority || 'low'}</span>` +
                `</div>` +
                `<div class="log-msg">${this._escapeHtml(m.message || '')}</div>`;
            $.log.appendChild(div);
        });

        this._updateThreat();
    }

    setConnected(connected) {
        this._isConnected = connected;
        const $ = this._$;
        if (connected) {
            this._sessionStart = this._sessionStart || Date.now();
            $.sessionDot.classList.add('on');
            $.sessionLabel.textContent = 'SESSION ACTIVE';
            $.sessionLabel.style.color = '#00c864';
        } else {
            $.sessionDot.classList.remove('on');
            $.sessionLabel.textContent = 'OFFLINE';
            $.sessionLabel.style.color = '#888';
        }
    }

    toggle() {
        if (this._visible) {
            this.hide();
        } else {
            this._el.style.display = 'block';
            this._visible = true;
            requestAnimationFrame(() => {this._resizeECG(); this._resizeSpark(); });
        }
    }

    hide(){
        this._el.style.display = 'none';
        this._visible = false;
    }

    _escapeHtml(t) {const d = document.createElement('div'); d.textContent = t; return d.innerHTML;}

}

