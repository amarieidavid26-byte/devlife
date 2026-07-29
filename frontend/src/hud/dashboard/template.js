// dashboard DOM: the full grid template + a map of cached element refs
// (so the render loops never query the DOM per frame)

import { infoBtn } from '../InfoPanel.js';

export function buildDashboardDOM() {
    const root = document.createElement('div');
    root.id = 'dov-root';
    root.innerHTML = `
<div class="dash" id="dov-dash">

    <div class="topbar">
        <div class="topbar-logo">DEVLIFE <span id="dov-topbar-accent">&times;</span> GHOST</div>
        <div class="topbar-clock" id="dov-clock">--:--:--</div>
        <div class="topbar-right">
            <a id="dov-settings-btn" href="#"
               style="color:#B8A88C;text-decoration:none;border:1px solid rgba(255,228,181,0.2);border-radius:4px;padding:3px 8px">
               &#9881; <span data-i18n="apikeys.button">API keys</span></a>
            <a id="dov-export" href="#" target="_blank" rel="noopener"
               style="color:#B8A88C;text-decoration:none;border:1px solid rgba(255,228,181,0.2);border-radius:4px;padding:3px 8px">
               &#10515; <span data-i18n="dashboard.export_report">Export report</span></a>
            <span class="session-dot" id="dov-session-dot"></span>
            <span id="dov-session-label" data-i18n="dashboard.offline" style="color:#8A7E6A">BACKEND OFFLINE</span>
            <span id="dov-session-timer" style="color:#8A7E6A">00:00:00</span>
            <span class="tab-hint">&nbsp;&middot;&nbsp;<span data-i18n="dashboard.tab_to_close">TAB to close</span></span>
        </div>
    </div>

    <div class="left">

        <div class="hr-section">
            <div class="sec-hdr" data-i18n="dashboard.cardiac_output">Cardiac Output</div>
            <div class="hr-row">
                <span class="hr-heart" id="dov-heart">&#10084;&#65039;</span>
                <span class="hr-value" id="dov-hr">--</span>
                <span class="hr-unit">BPM</span>
            </div>
        </div>

        <div class="metrics">
            <div class="metric">
                <div><span class="val" id="dov-hrv">--</span><span class="unit"> ms</span></div>
                <div class="lbl" data-i18n="dashboard.hrv">HRV</div>
            </div>
            <div class="metric">
                <div><span class="val" id="dov-rec">--</span><span class="unit"> %</span></div>
                <div class="lbl" data-i18n="dashboard.recovery">Recovery</div>
            </div>
            <div class="metric">
                <div><span class="val" id="dov-strain">--</span></div>
                <div class="lbl" data-i18n="dashboard.strain">Strain</div>
            </div>
        </div>

        <div class="state-section">
            <div class="state-name" id="dov-state" style="color:var(--dov-state-color,#6A5E4C)">—</div>
            <div class="state-lbl"><span data-i18n="dashboard.cognitive_state">Cognitive State</span>${infoBtn('state')}</div>
        </div>

        <div class="expl-section" id="dov-expl">
            <div class="sec-hdr"><span data-i18n="expl.header">Why this state?</span></div>
            <div class="expl-signal">
                <span class="expl-signal-lbl" data-i18n="expl.signal_label">Dominant signal</span>
                <span class="expl-signal-val" id="dov-expl-signal">—</span>
            </div>
            <div class="expl-reason" id="dov-expl-reason" data-i18n="expl.awaiting">Awaiting biometric data...</div>
            <div class="expl-factors" id="dov-expl-factors"></div>
            <div class="expl-note" data-i18n="expl.formula_note">Inverted-U model (Yerkes-Dodson): performance falls when stress is too low or too high.</div>
        </div>

        <div class="bio-section">
            <div class="sec-hdr"><span data-i18n="dashboard.biology_header">The biology behind it</span>${infoBtn('biology')}</div>
            <div style="font-family:'Nunito',sans-serif;font-size:10.5px;color:#8A7E6A;line-height:1.55;margin-top:4px" data-i18n="dashboard.biology_hint">heart -> vagus nerve -> HRV -> prefrontal cortex -> performance</div>
        </div>

        <div class="stress-section">
            <div class="stress-header">
                <span class="lbl"><span data-i18n="dashboard.stress_level">Stress Level</span>${infoBtn('stress')}</span>
                <span class="val" id="dov-stress-val">0.0 / 3.0</span>
            </div>
            <div class="stress-track">
                <div class="stress-fill" id="dov-stress-bar" style="width:0%;background:#6AD89A"></div>
            </div>
        </div>

        <div class="cqi-section">
            <div class="sec-hdr" style="font-family:'Fredoka',sans-serif;font-size:12px"><span data-i18n="dashboard.cqi_header">Code Quality Index</span>${infoBtn('cqi')}</div>
            <div class="cqi-row">
                <div class="cqi-track"><div class="cqi-fill" id="dov-cqi-bar" style="width:0%;background:#6AD89A"></div></div>
                <span class="cqi-val" id="dov-cqi-val" style="color:#6AD89A">CQI: --%</span>
            </div>
            <div class="cqi-hint" id="dov-cqi-hint" data-i18n="dashboard.cqi_awaiting">Awaiting biometric data...</div>
        </div>

        <div class="ans-section">
            <div class="sec-hdr"><span data-i18n="dashboard.autonomic_balance">Autonomic Balance</span>${infoBtn('autonomic')}</div>
            <div class="ans-bars">
                <div class="ans-bar-group">
                    <div class="ans-bar" id="dov-ans-sns" style="background:#FF7A6A;height:2px"></div>
                    <span class="ans-bar-lbl" data-i18n="dashboard.sns">SNS</span>
                </div>
                <div class="ans-bar-group">
                    <div class="ans-bar" id="dov-ans-pns" style="background:#6AD89A;height:2px"></div>
                    <span class="ans-bar-lbl" data-i18n="dashboard.pns">PNS</span>
                </div>
            </div>
            <div class="ans-status" id="dov-ans-status" data-i18n="dashboard.ans_awaiting">Awaiting data...</div>
        </div>

        <div class="hrv-section">
            <div class="sec-hdr" data-i18n="dashboard.hrv_trend">HRV Trend</div>
            <canvas class="hrv-spark-canvas" id="dov-hrv-spark"></canvas>
        </div>

        <div class="gauges-row">
            <div class="gauge-box">
                <div class="sec-hdr" data-i18n="dashboard.recovery_zones">Recovery Zones</div>
                <svg width="140" height="80" viewBox="0 0 140 80">
                    <path d="M15 72 A55 55 0 0 1 125 72" fill="none" stroke="rgba(255,228,181,0.06)" stroke-width="8" stroke-linecap="round"/>
                    <path d="M15 72 A55 55 0 0 1 125 72" fill="none" stroke="url(#dovRecGrad)" stroke-width="3" stroke-linecap="round" opacity="0.12"/>
                    <path d="M15 72 A55 55 0 0 1 125 72" fill="none" stroke="#6AD89A" stroke-width="8" stroke-linecap="round"
                          id="dov-rec-arc" stroke-dasharray="172.79" stroke-dashoffset="172.79"
                          style="transition:stroke-dashoffset 0.6s ease,stroke 0.4s"/>
                    <line x1="70" y1="72" x2="70" y2="22" stroke="#F5F0E8" stroke-width="1.5" stroke-linecap="round"
                          id="dov-rec-needle" style="transform-origin:70px 72px;transition:transform 0.6s ease"/>
                    <defs><linearGradient id="dovRecGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%"   stop-color="#FF7A6A"/><stop offset="33%" stop-color="#FF7A6A"/>
                        <stop offset="34%"  stop-color="#FFB84A"/><stop offset="66%" stop-color="#FFB84A"/>
                        <stop offset="67%"  stop-color="#6AD89A"/><stop offset="100%" stop-color="#6AD89A"/>
                    </linearGradient></defs>
                </svg>
                <div class="gauge-val" id="dov-rec-gauge-val">--%</div>
                <div class="gauge-sub" data-i18n="dashboard.recovery">Recovery</div>
            </div>

            <div class="gauge-box" id="dov-cog-box">
                <div class="sec-hdr"><span data-i18n="dashboard.cognitive_load">Cognitive Load</span>${infoBtn('cognitive_load')}</div>
                <div style="position:relative;width:120px;height:120px">
                    <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,228,181,0.06)" stroke-width="7"/>
                        <circle cx="60" cy="60" r="48" fill="none" stroke="#6AB8FF" stroke-width="7"
                                stroke-dasharray="301.59" stroke-dashoffset="301.59" stroke-linecap="round"
                                id="dov-cog-fill"
                                style="transition:stroke-dashoffset 0.6s ease,stroke 0.4s;transform:rotate(-90deg);transform-origin:60px 60px"/>
                    </svg>
                    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
                        <div class="gauge-val" id="dov-cog-val" style="font-size:24px">0%</div>
                        <div data-i18n="dashboard.index" style="font-family:'Nunito',sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#B8A88C;margin-top:2px">INDEX</div>
                    </div>
                </div>
            </div>
        </div>

        <div style="margin-top:14px">
            <div class="sec-hdr"><span data-i18n="dashboard.replay">Session Replay</span></div>
            <canvas id="dov-replay" style="width:100%;height:70px;display:block;cursor:crosshair;border-radius:4px;background:rgba(255,228,181,0.03)"></canvas>
            <div id="dov-replay-readout" style="font-family:'Nunito',sans-serif;font-size:10px;color:#8a7a5c;min-height:14px;margin-top:3px" data-i18n="dashboard.replay_hint">hover to scrub the session</div>
        </div>
    </div>

    <div class="right">
        <div class="threat nominal" id="dov-threat">
            <div class="threat-dot"></div>
            <div>
                <div class="threat-label" data-i18n="dashboard.threat_level">Threat Level</div>
                <div class="threat-val" id="dov-threat-val" data-i18n="dashboard.threat_nominal">NOMINAL</div>
            </div>
        </div>
        <div class="int-count" id="dov-int-count"><strong>0</strong> <span data-i18n="dashboard.interventions">INTERVENTIONS</span></div>
        <div class="log-title" data-i18n="dashboard.intervention_log">Intervention Log</div>
        <div class="log-scroll" id="dov-log">
            <div class="log-empty" id="dov-log-empty" data-i18n="dashboard.monitoring">Monitoring...</div>
        </div>

        <div class="log-title" style="margin-top:14px"><span data-i18n="dashboard.ghost_learning">Ghost Learning</span></div>
        <div id="dov-learn" style="font-family:'Nunito',sans-serif;font-size:11px;color:#B8A88C;line-height:1.7">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <span data-i18n="dashboard.accept_rate">Accept rate</span>
                <strong id="dov-learn-rate" style="color:#F5F0E8">--%</strong>
            </div>
            <div class="stress-track" style="margin:3px 0 6px">
                <div class="stress-fill" id="dov-learn-bar" style="width:0%;background:#6AD89A"></div>
            </div>
            <div id="dov-learn-mode" style="font-style:italic"></div>
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,228,181,0.08)">
                <div style="display:flex;justify-content:space-between"><span data-i18n="dashboard.sess_duration">Session</span><strong id="dov-sess-dur" style="color:#F5F0E8">--</strong></div>
                <div style="display:flex;justify-content:space-between"><span data-i18n="dashboard.sess_analyses">Analyses</span><strong id="dov-sess-analyses" style="color:#F5F0E8">--</strong></div>
                <div style="display:flex;justify-content:space-between"><span data-i18n="dashboard.sess_stuck">Times stuck</span><strong id="dov-sess-stuck" style="color:#F5F0E8">--</strong></div>
            </div>
        </div>
    </div>

    <div class="bottom" id="dov-ecg-container">
        <div class="ecg-lbl-left" data-i18n="dashboard.ecg_lead">Lead II &middot; ECG</div>
        <div class="ecg-lbl-right">
            <span class="ecg-bpm-num" id="dov-ecg-bpm-num">72</span>
            <span class="ecg-bpm-unit">BPM</span>
        </div>
        <canvas class="ecg-canvas" id="dov-ecg"></canvas>
    </div>

</div>`;

    const $ = {
        dash:         root.querySelector('#dov-dash'),
        clock:        root.querySelector('#dov-clock'),
        exportBtn:    root.querySelector('#dov-export'),
        settingsBtn:  root.querySelector('#dov-settings-btn'),
        sessionDot:   root.querySelector('#dov-session-dot'),
        sessionLabel: root.querySelector('#dov-session-label'),
        sessionTimer: root.querySelector('#dov-session-timer'),
        topbarAccent: root.querySelector('#dov-topbar-accent'),
        heart:        root.querySelector('#dov-heart'),
        hr:           root.querySelector('#dov-hr'),
        hrv:          root.querySelector('#dov-hrv'),
        rec:          root.querySelector('#dov-rec'),
        strain:       root.querySelector('#dov-strain'),
        state:        root.querySelector('#dov-state'),
        explSignal:   root.querySelector('#dov-expl-signal'),
        explReason:   root.querySelector('#dov-expl-reason'),
        explFactors:  root.querySelector('#dov-expl-factors'),
        stressVal:    root.querySelector('#dov-stress-val'),
        stressBar:    root.querySelector('#dov-stress-bar'),
        log:          root.querySelector('#dov-log'),
        logEmpty:     root.querySelector('#dov-log-empty'),
        ecgContainer: root.querySelector('#dov-ecg-container'),
        ecgCanvas:    root.querySelector('#dov-ecg'),
        ecgBpmNum:    root.querySelector('#dov-ecg-bpm-num'),
        sparkCanvas:  root.querySelector('#dov-hrv-spark'),
        recArc:       root.querySelector('#dov-rec-arc'),
        recNeedle:    root.querySelector('#dov-rec-needle'),
        recGaugeVal:  root.querySelector('#dov-rec-gauge-val'),
        cogFill:      root.querySelector('#dov-cog-fill'),
        cogVal:       root.querySelector('#dov-cog-val'),
        threat:       root.querySelector('#dov-threat'),
        threatVal:    root.querySelector('#dov-threat-val'),
        intCount:     root.querySelector('#dov-int-count'),
        cqiBar:       root.querySelector('#dov-cqi-bar'),
        cqiVal:       root.querySelector('#dov-cqi-val'),
        cqiHint:      root.querySelector('#dov-cqi-hint'),
        ansSns:       root.querySelector('#dov-ans-sns'),
        ansPns:       root.querySelector('#dov-ans-pns'),
        ansStatus:    root.querySelector('#dov-ans-status'),
        replayCanvas: root.querySelector('#dov-replay'),
        replayReadout:root.querySelector('#dov-replay-readout'),
        learnRate:    root.querySelector('#dov-learn-rate'),
        learnBar:     root.querySelector('#dov-learn-bar'),
        learnMode:    root.querySelector('#dov-learn-mode'),
        sessDur:      root.querySelector('#dov-sess-dur'),
        sessAnalyses: root.querySelector('#dov-sess-analyses'),
        sessStuck:    root.querySelector('#dov-sess-stuck'),
    };

    return { root, $ };
}
