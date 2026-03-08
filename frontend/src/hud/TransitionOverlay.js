const MESSAGES = [
  'Loading the neighborhood...',
  'Ghost is following...',
  'Compiling the outdoors...',
  'npm install fresh-air...',
  'Parsing sunlight...',
  'git checkout town-branch...',
  'Initializing grass.js...',
  'Warming up the coffee machine...',
  'Deploying to localhost:outside...',
];

export class TransitionOverlay {
  constructor() {
    this._visible = false;
    this._hideTimer = null;

    // inject keyframes once
    const style = document.createElement('style');
    style.textContent = `
      @keyframes ecg-slide {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
    `;
    document.head.appendChild(style);
    this._style = style;

    // root overlay
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '8000',
      background: 'rgba(10, 10, 25, 0.95)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: '0',
      transition: 'opacity 200ms ease',
      pointerEvents: 'none',
      visibility: 'hidden',
    });
    this._el = el;

    // ECG line container
    const ecgWrap = document.createElement('div');
    Object.assign(ecgWrap.style, {
      width: '200px',
      height: '2px',
      overflow: 'hidden',
      borderRadius: '1px',
      background: 'rgba(0, 200, 100, 0.15)',
      marginBottom: '20px',
    });

    const ecgBar = document.createElement('div');
    Object.assign(ecgBar.style, {
      width: '100%',
      height: '100%',
      background: 'linear-gradient(90deg, transparent 0%, #00c864 40%, #00c864 60%, transparent 100%)',
      animation: 'ecg-slide 1s linear infinite',
    });
    ecgWrap.appendChild(ecgBar);
    el.appendChild(ecgWrap);

    // message text
    const msg = document.createElement('div');
    Object.assign(msg.style, {
      fontFamily: "'Courier New', monospace",
      fontSize: '14px',
      color: '#888',
      textAlign: 'center',
    });
    this._msg = msg;
    el.appendChild(msg);

    document.body.appendChild(el);
  }

  show(duration = 1000) {
    clearTimeout(this._hideTimer);

    this._msg.textContent = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    this._el.style.visibility = 'visible';
    this._el.style.pointerEvents = 'all';

    // force reflow then fade in
    void this._el.offsetWidth;
    this._el.style.opacity = '1';
    this._visible = true;

    return new Promise(resolve => {
      // stay visible for (duration - 400ms fade total), minimum 0
      const stay = Math.max(duration - 400, 0);

      this._hideTimer = setTimeout(() => {
        this._el.style.opacity = '0';
        this._hideTimer = setTimeout(() => {
          this._el.style.visibility = 'hidden';
          this._el.style.pointerEvents = 'none';
          this._visible = false;
          resolve();
        }, 200);
      }, 200 + stay);
    });
  }

  hide() {
    clearTimeout(this._hideTimer);
    this._el.style.opacity = '0';
    this._el.style.visibility = 'hidden';
    this._el.style.pointerEvents = 'none';
    this._visible = false;
  }

  destroy() {
    clearTimeout(this._hideTimer);
    this._el.remove();
    this._style.remove();
  }
}
