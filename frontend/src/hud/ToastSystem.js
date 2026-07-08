import { i18n } from '../i18n/index.js';

export class ToastSystem {
  static TYPES = {
    achievement: { color: '#FFB84A', icon: '\u2B50' },
    state:       { color: '#B8A88C', icon: '\uD83E\uDDE0' },
    ghost:       { color: '#6AD89A', icon: '\uD83D\uDC7B' },
    warning:     { color: '#FF7A6A', icon: '\u26A0\uFE0F' },
    info:        { color: '#6AB8FF', icon: '\u2139\uFE0F' },
  };

  static ACHIEVEMENTS = {
    first_flow:       { titleKey: 'toast.ach.first_flow_title',       msgKey: 'toast.ach.first_flow_body' },
    night_owl:        { titleKey: 'toast.ach.night_owl_title',        msgKey: 'toast.ach.night_owl_body' },
    coffee_addict:    { titleKey: 'toast.ach.coffee_addict_title',    msgKey: 'toast.ach.coffee_addict_body' },
    ghost_whisperer:  { titleKey: 'toast.ach.ghost_whisperer_title',  msgKey: 'toast.ach.ghost_whisperer_body' },
    firewall_blocked: { titleKey: 'toast.ach.firewall_blocked_title', msgKey: 'toast.ach.firewall_blocked_body' },
    marathon:         { titleKey: 'toast.ach.marathon_title',         msgKey: 'toast.ach.marathon_body' },
    healthy_break:    { titleKey: 'toast.ach.healthy_break_title',     msgKey: 'toast.ach.healthy_break_body' },
  };

  constructor() {
    this._nextId = 0;
    this._toasts = new Map();          // id -> { el, timeout }
    this._unlocked = new Set();        // achievement ids already triggered
    this._enabled = true;

    this._container = document.createElement('div');
    this._container.style.cssText = 'position:fixed; top:0; right:0; width:0; height:0; z-index:9000; pointer-events:none;';
    document.body.appendChild(this._container);
  }

  // ---- public api ----

  setEnabled(enabled) { this._enabled = enabled; } // so toasts dont show over cutscenes

  show(type, title, message, duration = 3000, action = null) {
    if (!this._enabled) return;
    const id = this._nextId++;
    const cfg = ToastSystem.TYPES[type] || ToastSystem.TYPES.info;

    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      right: '20px',
      top: `${20 + this._toasts.size * 60}px`,
      maxWidth: '320px',
      background: 'rgba(42, 36, 28, 0.92)',
      borderLeft: `3px solid ${cfg.color}`,
      borderRadius: '4px',
      padding: '12px 16px',
      fontFamily: "'Nunito', sans-serif",
      fontSize: '13px',
      color: '#F5F0E8',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      zIndex: '9000',
      pointerEvents: 'auto',
      transform: 'translateX(120%)',
      transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
      opacity: '1',
    });

    el.innerHTML =
      `<div style="display:flex;align-items:baseline;gap:6px">` +
        `<span>${cfg.icon}</span>` +
        `<span style="font-weight:bold;font-family:'Fredoka',sans-serif">${this._esc(title)}</span>` +
      `</div>` +
      `<div style="color:#B8A88C;margin-top:2px">${this._esc(message)}</div>`;

    if (action && action.label) {
      const btn = document.createElement('button');
      btn.textContent = action.label;
      btn.style.cssText =
        `margin-top:8px; padding:4px 12px; background:transparent; color:${cfg.color};` +
        `border:1px solid ${cfg.color}; border-radius:4px; cursor:pointer;` +
        `font-family:'Fredoka',sans-serif; font-size:12px; font-weight:bold;`;
      btn.onclick = () => {
        this.dismiss(id);
        if (action.onClick) action.onClick();
      };
      el.appendChild(btn);
    }

    this._container.appendChild(el);

    // trigger enter animation on next frame
    requestAnimationFrame(() => {
      el.style.transform = 'translateX(0)';
    });

    const timeout = setTimeout(() => this.dismiss(id), duration);
    this._toasts.set(id, { el, timeout });

    return id;
  }

  dismiss(id) {
    const entry = this._toasts.get(id);
    if (!entry) return;

    clearTimeout(entry.timeout);
    const { el } = entry;

    // exit animation
    el.style.transform = 'translateX(120%)';
    el.style.opacity = '0';

    setTimeout(() => {
      el.remove();
      this._toasts.delete(id);
      this._reflow();
    }, 300);
  }

  clear() {
    for (const id of [...this._toasts.keys()]) {
      this.dismiss(id);
    }
  }

  destroy() {
    for (const { el, timeout } of this._toasts.values()) {
      clearTimeout(timeout);
      el.remove();
    }
    this._toasts.clear();
    this._container.remove();
  }

  triggerAchievement(id) {
    if (this._unlocked.has(id)) return;
    const ach = ToastSystem.ACHIEVEMENTS[id];
    if (!ach) return;
    this._unlocked.add(id);
    this.show('achievement', i18n.t(ach.titleKey), i18n.t(ach.msgKey), 4000);
  }

  // ---- internal ----

  _reflow() {
    let i = 0;
    for (const { el } of this._toasts.values()) {
      el.style.top = `${20 + i * 60}px`;
      i++;
    }
  }

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}
