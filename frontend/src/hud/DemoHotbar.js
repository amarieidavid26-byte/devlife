
const STATES = [
    { key: 1, label: 'FOCUS',   emoji: '🟣', color: '#8000ff', id: 'DEEP_FOCUS' },
    { key: 2, label: 'STRESS',  emoji: '🔴', color: '#ff5050', id: 'STRESSED'   },
    { key: 3, label: 'FATIGUE', emoji: '🟡', color: '#ffa000', id: 'FATIGUED'   },
    { key: 4, label: 'RELAX',   emoji: '🟢', color: '#00c864', id: 'RELAXED'    },
    { key: 5, label: 'WIRED',   emoji: '🔵', color: '#0096ff', id: 'WIRED'      },
];

export class DemoHotbar {
    constructor() {
        this._active  = null;
        this._keyEls  = {};
        this._source  = 'mock';
        this._bleConnected = false;
        this._demoOverride = false;
        this._headerEl = null;
        this._rowEl    = null;
        this._el      = this._build();
        document.body.appendChild(this._el);
    }

    _build() {
        if (!document.getElementById('dh-style')) {
            const style = document.createElement('style');
            style.id = 'dh-style';
            style.textContent = `
                @keyframes _hotbarPulse {
                    0%, 100% { opacity: 0.92; }
                    50%       { opacity: 1.0;  }
                }
                .dh-key {
                    width: 56px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 10px;
                    padding: 7px 4px 8px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 3px;
                    transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
                    cursor: pointer;
                    user-select: none;
                }
                .dh-key:hover { background: rgba(255,255,255,0.09); }
                .dh-key.dh-active {
                    animation: _hotbarPulse 1.6s ease-in-out infinite;
                }
                .dh-num  { font-size: 10px; font-family: monospace; color: rgba(255,255,255,0.4); font-weight: 700; }
                .dh-icon { font-size: 15px; line-height: 1; }
                .dh-name { font-size: 8px;  font-family: monospace; color: rgba(255,255,255,0.5); letter-spacing: 0.06em; }
            `;
            document.head.appendChild(style);
        }

        const el = document.createElement('div');
        el.id = 'demo-hotbar';
        el.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 24px;
            background: rgba(10,10,25,0.78);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255,255,255,0.07);
            border-radius: 14px;
            padding: 10px 12px 10px;
            font-family: 'Segoe UI', monospace, sans-serif;
            z-index: 150;
            pointer-events: all;
            box-shadow: 0 4px 24px rgba(0,0,0,0.45);
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            font-size: 9px; letter-spacing: 0.14em;
            color: rgba(255,255,255,0.3); text-align: center;
            margin-bottom: 8px; font-family: monospace;
            display: flex; align-items: center; justify-content: center; gap: 6px;
        `;
        this._headerEl = header;
        this._updateHeader();
        el.appendChild(header);

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;';
        this._rowEl = row;

        STATES.forEach(s => {
            const box = document.createElement('div');
            box.className = 'dh-key';
            box.innerHTML = `
                <span class="dh-num">[${s.key}]</span>
                <span class="dh-icon">${s.emoji}</span>
                <span class="dh-name">${s.label}</span>
            `;
            box.addEventListener('click', () => {
                this.setActive(s.id);
                if (this._onClick) this._onClick(s.key);
            });
            this._keyEls[s.id] = { el: box, color: s.color };
            row.appendChild(box);
        });

        el.appendChild(row);
        return el;
    }

    setClickHandler(fn) { this._onClick = fn; }

    setSource(source) {
        if (this._source === source) return;
        this._source = source;
        if (source === 'ble') this._bleConnected = true;
        if (this._rowEl) {
            const isLive = source === 'whoop' || source === 'ble';
            this._rowEl.style.display = (isLive && !this._demoOverride) ? 'none' : 'flex';
        }
        this._updateHeader();
    }

    setBLEConnected(connected) {
        if (this._bleConnected === connected) return;
        this._bleConnected = connected;
        if (this._rowEl) {
            const isLive = this._source === 'whoop' || this._source === 'ble' || connected;
            this._rowEl.style.display = (isLive && !this._demoOverride) ? 'none' : 'flex';
        }
        this._updateHeader();
    }

    
    get manualEnabled() {
        const isLive = this._source === 'whoop' || this._source === 'ble' || this._bleConnected;
        return !isLive || this._demoOverride;
    }

    _updateHeader() {
        if (!this._headerEl) return;
        this._headerEl.innerHTML = '';
        const isLive = this._bleConnected || this._source === 'whoop' || this._source === 'ble';

        if (isLive && !this._demoOverride) {
            const dot = document.createElement('span');
            dot.textContent = '\u2764\uFE0F';
            dot.style.cssText = 'animation:_hotbarPulse 1s ease-in-out infinite;';
            this._headerEl.appendChild(dot);
            const txt = document.createElement('span');
            txt.textContent = this._bleConnected ? ' WHOOP LIVE' : ' WHOOP API';
            txt.style.color = '#00c864';
            this._headerEl.appendChild(txt);
            const toggle = document.createElement('span');
            toggle.textContent = 'Demo Mode';
            toggle.style.cssText = `
                color: rgba(255,255,255,0.25); cursor: pointer; font-size: 7px;
                border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;
                padding: 1px 4px; margin-left: 2px;
            `;
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this._demoOverride = true;
                if (this._rowEl) this._rowEl.style.display = 'flex';
                this._updateHeader();
            });
            this._headerEl.appendChild(toggle);
        } else if (isLive && this._demoOverride) {
            const txt = document.createElement('span');
            txt.textContent = 'DEMO OVERRIDE';
            txt.style.color = '#ffa000';
            this._headerEl.appendChild(txt);
            const toggle = document.createElement('span');
            toggle.textContent = 'Back to Live';
            toggle.style.cssText = `
                color: #00c864; cursor: pointer; font-size: 7px;
                border: 1px solid rgba(0,200,100,0.3); border-radius: 3px;
                padding: 1px 4px; margin-left: 2px;
            `;
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this._demoOverride = false;
                if (this._rowEl) this._rowEl.style.display = 'none';
                this._updateHeader();
            });
            this._headerEl.appendChild(toggle);
        } else {
            const txt = document.createElement('span');
            txt.textContent = 'DEMO STATES \xB7 NO SENSOR';
            this._headerEl.appendChild(txt);
            const btn = document.createElement('span');
            btn.textContent = '\uD83D\uDD17 PAIR WHOOP';
            btn.style.cssText = `
                color: #0096ff; cursor: pointer; font-size: 8px;
                border: 1px solid rgba(0,150,255,0.3); border-radius: 4px;
                padding: 1px 5px; letter-spacing: 0.05em;
            `;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.connectWHOOP) window.connectWHOOP();
            });
            this._headerEl.appendChild(btn);
        }
    }

    setActive(stateName) {
        if (this._active === stateName) return;

        if (this._active && this._keyEls[this._active]) {
            const prev = this._keyEls[this._active].el;
            prev.classList.remove('dh-active');
            prev.style.background   = 'rgba(255,255,255,0.04)';
            prev.style.borderColor  = 'rgba(255,255,255,0.08)';
            prev.style.boxShadow    = '';
        }

        this._active = stateName;

        if (stateName && this._keyEls[stateName]) {
            const { el, color } = this._keyEls[stateName];
            el.classList.add('dh-active');
            el.style.background  = `${color}20`;
            el.style.borderColor = `${color}99`;
            el.style.boxShadow   = `0 0 14px ${color}44, inset 0 0 8px ${color}18`;
        }
    }
}
