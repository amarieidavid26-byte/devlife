// session replay strip: HR polyline colored by cognitive state + intervention ticks,
// scrubbable with the mouse. data comes from /api/session/replay (polled by the overlay)

import { i18n } from '../../i18n/index.js';
import { STATE_COLORS_CSS as STATE_COLORS } from '../../theme.js';

export class ReplayPanel {
    constructor(canvas, readoutEl) {
        this._canvas = canvas;
        this._readout = readoutEl;
        this._data = null;
        canvas.addEventListener('mousemove', (e) => this._scrub(e));
        canvas.addEventListener('mouseleave', () => {
            this._readout.textContent = i18n.t('dashboard.replay_hint');
        });
    }

    setData(data) {
        this._data = data;
        this.draw();
    }

    draw() {
        const data = this._data;
        const canvas = this._canvas;
        if (!data || !canvas.clientWidth) return;
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.clientWidth, H = 70;
        canvas.width = W * dpr; canvas.height = H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const samples = (data.samples || []).filter(s => s.hr > 0);
        if (samples.length < 2) return;
        const t0 = samples[0].ts, t1 = samples[samples.length - 1].ts;
        const span = Math.max(t1 - t0, 1);
        const hrs = samples.map(s => s.hr);
        const hrMin = Math.min(...hrs) - 5, hrMax = Math.max(...hrs) + 5;
        const x = (ts) => ((ts - t0) / span) * W;
        const y = (hr) => H - 8 - ((hr - hrMin) / (hrMax - hrMin)) * (H - 16);

        for (let i = 1; i < samples.length; i++) {
            ctx.beginPath();
            ctx.moveTo(x(samples[i - 1].ts), y(samples[i - 1].hr));
            ctx.lineTo(x(samples[i].ts), y(samples[i].hr));
            ctx.strokeStyle = STATE_COLORS[samples[i].state] || '#888';
            ctx.lineWidth = 1.6;
            ctx.stroke();
        }
        for (const iv of (data.interventions || [])) {
            const ix = x(iv.ts);
            ctx.beginPath();
            ctx.moveTo(ix, 4); ctx.lineTo(ix, H - 4);
            ctx.strokeStyle = 'rgba(255,122,106,0.75)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ix, 6, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = '#FF7A6A';
            ctx.fill();
        }
    }

    _scrub(e) {
        const data = this._data;
        if (!data) return;
        const samples = (data.samples || []).filter(s => s.hr > 0);
        if (samples.length < 2) return;
        const rect = this._canvas.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        const t0 = samples[0].ts, t1 = samples[samples.length - 1].ts;
        const t = t0 + frac * (t1 - t0);
        let best = samples[0];
        for (const s of samples) if (Math.abs(s.ts - t) < Math.abs(best.ts - t)) best = s;
        const time = new Date(best.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const iv = (data.interventions || []).find(v => Math.abs(v.ts - t) < (t1 - t0) * 0.01 + 2);
        const stateName = best.state ? i18n.t('state.' + best.state) : '?';
        this._readout.textContent = iv
            ? `${time} · 👻 ${(iv.claude_text || '').slice(0, 80)}`
            : `${time} · ${Math.round(best.hr)} bpm · HRV ${Math.round(best.hrv || 0)}ms · ${stateName}`;
    }
}
