// Demo hotbar — bottom-left, shows 1-5 state keys with active glow

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
        `;
        header.textContent = 'DEMO STATES · NO SENSOR';
        el.appendChild(header);

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;';

        STATES.forEach(s => {
            const box = document.createElement('div');
            box.className = 'dh-key';
            box.innerHTML = `
                <span class="dh-num">[${s.key}]</span>
                <span class="dh-icon">${s.emoji}</span>
                <span class="dh-name">${s.label}</span>
            `;
            box.addEventListener('click', () => {
                this.setActive(s.id);          // instant visual feedback
                if (this._onClick) this._onClick(s.key);
            });
            this._keyEls[s.id] = { el: box, color: s.color };
            row.appendChild(box);
        });

        el.appendChild(row);
        return el;
    }

    setClickHandler(fn) { this._onClick = fn; }

    setActive(stateName) {
        if (this._active === stateName) return;

        // Clear previous
        if (this._active && this._keyEls[this._active]) {
            const prev = this._keyEls[this._active].el;
            prev.classList.remove('dh-active');
            prev.style.background   = 'rgba(255,255,255,0.04)';
            prev.style.borderColor  = 'rgba(255,255,255,0.08)';
            prev.style.boxShadow    = '';
        }

        this._active = stateName;

        // Highlight new
        if (stateName && this._keyEls[stateName]) {
            const { el, color } = this._keyEls[stateName];
            el.classList.add('dh-active');
            el.style.background  = `${color}20`;
            el.style.borderColor = `${color}99`;
            el.style.boxShadow   = `0 0 14px ${color}44, inset 0 0 8px ${color}18`;
        }
    }
}
