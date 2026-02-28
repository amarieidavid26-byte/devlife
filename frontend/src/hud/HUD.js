// Biometric HUD overlay — top-right corner, HTML-based for easy styling

const STATE_COLORS = {
    DEEP_FOCUS: '#8000ff',
    STRESSED:   '#ff5050',
    FATIGUED:   '#ffa000',
    RELAXED:    '#00c864',
    WIRED:      '#0096ff',
};

export class HUD {
    constructor() {
        this._el = this._createEl();
        document.body.appendChild(this._el);

        this._connected = false;
        this._data = {
            heartRate: '—',
            recovery: '—',
            strain: '—',
            hrv: '—',
            state: 'CONNECTING',
            estimated_stress: 0,
        };
        this._render();
    }

    _createEl() {
        const el = document.createElement('div');
        el.id = 'ghost-hud';
        el.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            min-width: 220px;
            background: rgba(10,10,25,0.75);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 12px 16px;
            font-family: 'Segoe UI', monospace, sans-serif;
            font-size: 13px;
            color: #cccccc;
            z-index: 150;
            pointer-events: none;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            line-height: 1.7;
        `;
        return el;
    }

    update(data) {
        this._data = { ...this._data, ...data };
        this._render();
    }

    setConnected(v) {
        this._connected = v;
        this._render();
    }

    _render() {
        const d = this._data;
        const stateColor = STATE_COLORS[d.state] || '#888888';

        // Recovery dot
        const rec = parseFloat(d.recovery);
        const recDot = isNaN(rec) ? '⚫' : rec >= 66 ? '🟢' : rec >= 33 ? '🟡' : '🔴';
        const recFmt = isNaN(rec) ? '—' : `${rec}%`;

        // Stress bar (0-3 scale)
        const stress = parseFloat(d.estimated_stress) || 0;
        const stressBarWidth = Math.min(100, (stress / 3) * 100);
        const stressBarColor = stress < 1 ? '#00c864' : stress < 2 ? '#ffa000' : '#ff5050';

        const strainFmt = d.strain !== '—' ? parseFloat(d.strain).toFixed(1) : '—';
        const hrvFmt    = d.hrv    !== '—' ? `${Math.round(d.hrv)}ms`        : '—';
        const bpmFmt    = d.heartRate !== '—' ? `${Math.round(d.heartRate)}` : '—';

        const connDot = this._connected
            ? '<span style="color:#00c864;font-size:10px;letter-spacing:0.05em">● LIVE</span>'
            : '<span style="color:#444;font-size:10px;letter-spacing:0.05em">● OFFLINE</span>';

        this._el.innerHTML = `
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
