export class ToastSystem {
  static TYPES = {
    achievement: { color: '#ffd700', icon: '\u2B50' },
    state:       { color: '#888',    icon: '\uD83E\uDDE0' },
    ghost:       { color: '#00c864', icon: '\uD83D\uDC7B' },
    warning:     { color: '#ff5050', icon: '\u26A0\uFE0F' },
    info:        { color: '#0096ff', icon: '\u2139\uFE0F' },
  };

  static ACHIEVEMENTS = {
    first_flow:       { title: 'First Flow State',      msg: 'You entered DEEP_FOCUS for the first time' },
    night_owl:        { title: 'Night Owl',              msg: 'Coding past midnight' },
    coffee_addict:    { title: 'Coffee Addict',          msg: 'Third coffee today...' },
    ghost_whisperer:  { title: 'Ghost Whisperer',        msg: 'Had 10 conversations with Ghost' },
    firewall_blocked: { title: 'Saved by the Ghost',     msg: 'Fatigue Firewall blocked a dangerous command' },
    marathon:         { title: 'Marathon Coder',          msg: '4 hours straight in one session' },
    healthy_break:    { title: 'Healthy Break',           msg: 'Took a break when Ghost suggested it' },
  };

  constructor() {
    this._nextId = 0;
    this._toasts = new Map();          // id -> { el, timeout }
    this._unlocked = new Set();        // achievement ids already triggered

    this._container = document.createElement('div');
    Object.assign(this._container.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: '0',
      height: '0',
      zIndex: '9000',
      pointerEvents: 'none',
    });
    document.body.appendChild(this._container);
  }

  // ---- public api ----

  show(type, title, message, duration = 3000) {
    const id = this._nextId++;
    const cfg = ToastSystem.TYPES[type] || ToastSystem.TYPES.info;

    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      right: '20px',
      top: `${20 + this._toasts.size * 60}px`,
      maxWidth: '320px',
      background: 'rgba(10, 10, 25, 0.92)',
      borderLeft: `3px solid ${cfg.color}`,
      borderRadius: '4px',
      padding: '12px 16px',
      fontFamily: "'Courier New', monospace",
      fontSize: '13px',
      color: '#e0e0e0',
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
        `<span style="font-weight:bold">${this._esc(title)}</span>` +
      `</div>` +
      `<div style="color:#aaa;margin-top:2px">${this._esc(message)}</div>`;

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
    this.show('achievement', ach.title, ach.msg, 4000);
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
