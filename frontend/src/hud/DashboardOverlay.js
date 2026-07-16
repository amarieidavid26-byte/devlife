// fullscreen biometric dashboard (TAB). module map:
// dashboard/styles.js   -- all CSS, injected once
// dashboard/template.js -- DOM grid + cached element refs
// dashboard/ECGRenderer.js      -- scrolling ECG trace
// dashboard/SparklineRenderer.js -- HRV trend sparkline
// dashboard/ReplayPanel.js      -- session replay strip (draw + scrub)
// this file -- state, lerp loop, WS-fed updates, intervention log, /api/status polling

import { ensureInfoPanel } from './InfoPanel.js';
import { i18n } from '../i18n/index.js';
import { STATE_COLORS_CSS as STATE_COLORS } from '../theme.js';
import { CONFIG } from '../config.js';
import { injectStyles } from './dashboard/styles.js';
import { buildDashboardDOM } from './dashboard/template.js';
import { ECGRenderer } from './dashboard/ECGRenderer.js';
import { SparklineRenderer, hexToRgba } from './dashboard/SparklineRenderer.js';
import { ReplayPanel } from './dashboard/ReplayPanel.js';

const REC_ARC_LEN = 172.79;
const COG_CIRC    = 301.59;

export class DashboardOverlay {
    constructor() {
        injectStyles();
        this._visible = false;

        this._targetHR = 0; this._displayHR = 0;
        this._targetHRV = 0; this._displayHRV = 0;
        this._targetRec = 0; this._displayRec = 0;
        this._targetStrain = 0; this._displayStrain = 0;
        this._targetStress = 0; this._displayStress = 0;
        this._targetCQI = 0; this._displayCQI = 0;
        this._targetSNS = 0; this._displaySNS = 0;
        this._targetPNS = 0; this._displayPNS = 0;

        this._curState = 'RELAXED';
        this._interventions = [];
        this._intTotalCount = 0;
        this._heartbeatTimer = null;
        this._isConnected = false;
        this._sessionStart = null;

        this._buildDOM();
        this._startLoops();
        this._startClock();
        this._localizeStatic();
        // live language switch: re-localize static labels + re-apply event-driven texts
        i18n.onChange(() => {
            this._localizeStatic();
            this._applyState(this._curState);
            this.setConnected(this._isConnected);
            this._setExportLink();
        });
    }

    // set every element carrying data-i18n from the current language (keeps sibling 💡 buttons)
    _localizeStatic() {
        this._el.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = i18n.t(el.dataset.i18n);
        });
    }

    _setExportLink() {
        this._$.exportBtn.href = `${CONFIG.BACKEND_URL}/api/session/report/html?lang=${i18n.getLang()}`;
    }

    _buildDOM() {
        const { root, $ } = buildDashboardDOM();
        this._el = root;
        this._$ = $;
        document.body.appendChild(this._el);

        // shared 💡 science panel (also used by the in-game HUD) handles all the wiring
        ensureInfoPanel();

        this._ecg = new ECGRenderer($.ecgCanvas);
        this._spark = new SparklineRenderer($.sparkCanvas);
        this._replay = new ReplayPanel($.replayCanvas, $.replayReadout);
        this._setExportLink();

        this._ecg.resize();
        this._spark.resize();
        window.addEventListener('resize', () => { this._ecg.resize(); this._spark.resize(); });
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
            this._ecg.tick(ts);
            requestAnimationFrame(ecgTick);
        };
        requestAnimationFrame(ecgTick);

        // lerp factor 0.12 felt smooth after testing a bunch of values
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
                this._displayStress > 2 ? '#FF7A6A' : this._displayStress > 1 ? '#FFB84A' : '#6AD89A';

            const bpmRound = Math.round(this._ecg.bpm);
            $.ecgBpmNum.textContent = bpmRound;
            $.ecgBpmNum.style.color = bpmRound > 100 ? '#FF7A6A' : '#D4CABC';
            if (bpmRound > 100) $.ecgContainer.classList.add('alarm');
            else                $.ecgContainer.classList.remove('alarm');

            const recPct = Math.max(0, Math.min(100, this._displayRec));
            $.recArc.setAttribute('stroke-dashoffset', (REC_ARC_LEN * (1 - recPct / 100)).toFixed(2));
            $.recArc.setAttribute('stroke', recPct < 33 ? '#FF7A6A' : recPct < 67 ? '#FFB84A' : '#6AD89A');
            $.recNeedle.setAttribute('transform', 'rotate(' + (-90 + (recPct / 100) * 180) + ')');
            $.recGaugeVal.textContent = (this._targetRec > 0 ? Math.round(this._displayRec) : '--') + '%';

            const cogPct = Math.min(100, (this._displayStress / 3) * 100);
            $.cogFill.setAttribute('stroke-dashoffset', (COG_CIRC * (1 - cogPct / 100)).toFixed(2));
            $.cogFill.setAttribute('stroke', cogPct > 66 ? '#FF7A6A' : cogPct > 33 ? '#FFB84A' : '#6AB8FF');
            $.cogVal.textContent = Math.round(cogPct) + '%';

            // CQI
            this._displayCQI += (this._targetCQI - this._displayCQI) * 0.12;
            const cqi = Math.round(this._displayCQI);
            const cqiColor = cqi > 66 ? '#6AD89A' : cqi > 33 ? '#FFB84A' : '#FF7A6A';
            $.cqiBar.style.width = cqi + '%';
            $.cqiBar.style.background = cqiColor;
            $.cqiVal.textContent = i18n.t('hud.cqi_label') + ' ' + (this._targetCQI > 0 ? cqi + '%' : '--%');
            $.cqiVal.style.color = cqiColor;
            if (this._targetCQI > 0) {
                $.cqiHint.textContent = cqi <= 25 ? i18n.t('dashboard.cqi_hint_high_risk')
                    : cqi <= 50 ? i18n.t('dashboard.cqi_hint_below')
                    : cqi <= 75 ? i18n.t('dashboard.cqi_hint_decent')
                    : i18n.t('dashboard.cqi_hint_peak');
            }

            // ANS Balance
            this._displaySNS += (this._targetSNS - this._displaySNS) * 0.12;
            this._displayPNS += (this._targetPNS - this._displayPNS) * 0.12;
            const snsH = Math.max(2, this._displaySNS * 46);
            const pnsH = Math.max(2, this._displayPNS * 46);
            $.ansSns.style.height = snsH + 'px';
            $.ansPns.style.height = pnsH + 'px';
            if (this._targetSNS > 0 || this._targetPNS > 0) {
                const diff = this._displaySNS - this._displayPNS;
                $.ansStatus.textContent = diff > 0.1 ? i18n.t('dashboard.ans_fight')
                    : diff < -0.1 ? i18n.t('dashboard.ans_rest')
                    : i18n.t('dashboard.ans_balanced');
            }

            this._spark.draw(this._ecg.color);
            this._updateThreat();
            requestAnimationFrame(lerpLoop);
        };
        requestAnimationFrame(lerpLoop);
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
        this._ecg.color = color;
        const $ = this._$;

        $.state.textContent = i18n.t('state.' + s);
        $.state.style.color = color;
        $.state.style.textShadow = `0 0 24px ${color}, 0 0 48px ${hexToRgba(color, 0.3)}`;
        $.topbarAccent.style.color = color;
        this._el.style.setProperty('--dov-state-color', color);
        $.hr.style.textShadow     = `0 0 20px ${hexToRgba(color, 0.3)}`;
        $.hrv.style.textShadow    = `0 0 12px ${hexToRgba(color, 0.15)}`;
        $.rec.style.textShadow    = `0 0 12px ${hexToRgba(color, 0.15)}`;
        $.strain.style.textShadow = `0 0 12px ${hexToRgba(color, 0.15)}`;
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
        this._$.threatVal.textContent = i18n.t('dashboard.threat_' + level);
    }

    update(data) {
        if (data.heartRate) {
            this._targetHR = data.heartRate;
            this._ecg.targetBPM = data.heartRate;
            this._syncHeartBeat(data.heartRate);
        }
        if (data.hrv > 0) {
            this._targetHRV = data.hrv;
            this._spark.push(data.hrv);
        }
        if (data.recovery) this._targetRec = data.recovery;
        if (data.strain) this._targetStrain = data.strain;
        if (data.estimated_stress !== undefined) this._targetStress = data.estimated_stress;
        if (data.state) this._applyState(data.state);

        // Code Quality Index
        const rec = data.recovery || this._targetRec || 50;
        const hrv = data.hrv || this._targetHRV || 40;
        const stress = data.estimated_stress !== undefined ? data.estimated_stress : this._targetStress;
        const recFactor     = Math.min(rec / 100, 1);
        const hrvFactor     = Math.min(hrv / 80, 1);
        const stressPenalty = Math.max(0, 1 - stress / 3);
        this._targetCQI = Math.round((recFactor * 0.4 + hrvFactor * 0.35 + stressPenalty * 0.25) * 100);

        // ANS Balance -- SNS driven by stress, PNS driven by HRV
        this._targetSNS = Math.min(stress / 3, 1);
        this._targetPNS = Math.min(hrv / 80, 1);
    }

    setState(s) {
        this._applyState(s);
    }

    // no-op: DashboardOverlay is HTML-based, no screen-space positions needed
    setPositions() {}

    addIntervention(msg) {
        const $ = this._$;
        $.logEmpty.style.display = 'none';
        msg._time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this._interventions.unshift(msg);
        if (this._interventions.length > 8) this._interventions.pop();
        this._intTotalCount++;
        $.intCount.innerHTML = `<strong>${this._intTotalCount}</strong> ${i18n.t('dashboard.interventions')}`;

        $.log.innerHTML = '';
        this._interventions.forEach(m => {
            const isCritical  = m.priority === 'critical';
            const stateColor  = STATE_COLORS[m.state] || '#8A7E6A';
            const prioColor   = m.priority === 'critical' ? '#FF7A6A' : m.priority === 'high' ? '#FFB84A' : m.priority === 'medium' ? '#6AB8FF' : '#4A3E2C';
            const icon        = (m.message && m.message.includes('FIREWALL')) ? '🛡️' : m.priority === 'critical' ? '⚠️' : '💡';
            const div         = document.createElement('div');
            div.className     = 'log-entry' + (isCritical ? ' critical' : '');
            div.innerHTML     =
                `<div class="log-meta">` +
                    `<span class="log-icon">${icon}</span>` +
                    `<span class="log-time">${m._time || ''}</span>` +
                    `<span class="log-state" style="background:${stateColor}">${m.state ? i18n.t('state.' + m.state) : ''}</span>` +
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
            $.sessionLabel.textContent = i18n.t('dashboard.session_active');
            $.sessionLabel.style.color = '#6AD89A';
        } else {
            $.sessionDot.classList.remove('on');
            $.sessionLabel.textContent = i18n.t('dashboard.offline');
            $.sessionLabel.style.color = '#8A7E6A';
        }
    }

    toggle() {
        if (this._visible) {
            this.hide();
        } else {
            this._el.style.display = 'block';
            this._visible = true;
            requestAnimationFrame(() => { this._ecg.resize(); this._spark.resize(); });
            this._pollStatus();
            this._statusTimer = setInterval(() => this._pollStatus(), 5000);
        }
    }

    hide() {
        this._el.style.display = 'none';
        this._visible = false;
        clearInterval(this._statusTimer);
    }

    // ghost-learning + session stats panel, fed by /api/status while the dashboard is open
    async _pollStatus() {
        let s;
        try {
            const res = await fetch(`${CONFIG.BACKEND_URL}/api/status`);
            s = await res.json();
        } catch (e) {
            return; // offline demo -- panel keeps showing '--'
        }
        const acc = s.interventions_accepted || 0;
        const ign = s.interventions_ignored || 0;
        const total = acc + ign;
        if (total > 0) {
            const rate = Math.round((acc / total) * 100);
            this._$.learnRate.textContent = `${rate}%`;
            this._$.learnBar.style.width = `${rate}%`;
            this._$.learnBar.style.background = rate >= 60 ? '#6AD89A' : rate >= 30 ? '#FFB84A' : '#FF7A6A';
        }
        // mirrors the backend's adaptive cooldown (ghost_brain.should_intervene)
        const modeKey = ign >= 3 ? 'dashboard.learn_backed_off'
            : (acc > ign && total > 0) ? 'dashboard.learn_speaks_more'
            : 'dashboard.learn_calibrating';
        this._$.learnMode.textContent = i18n.t(modeKey);

        const st = s.session_stats || {};
        if (st.session_duration_minutes != null) this._$.sessDur.textContent = `${st.session_duration_minutes} min`;
        if (st.total_analyses != null) this._$.sessAnalyses.textContent = st.total_analyses;
        if (st.times_stuck != null) this._$.sessStuck.textContent = st.times_stuck;

        try {
            const rres = await fetch(`${CONFIG.BACKEND_URL}/api/session/replay`);
            this._replay.setData(await rres.json());
        } catch (e) { /* offline -- keep last drawing */ }
    }

    _escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
}
