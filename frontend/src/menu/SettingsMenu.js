const KEYBINDS = [
  ['WASD', 'Move'],
  ['E', 'Interact'],
  ['T', 'Toggle Room/Town'],
  ['1-5', 'Switch State (Demo)'],
  ['TAB', 'Ghost Vision'],
  ['ESC', 'Close App'],
];

export class SettingsMenu {
  constructor() {
    this._volumeCb = null;
    this._muteCb = null;

    // --- root overlay ---
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '10001',
      background: 'rgba(5, 5, 15, 0.92)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      visibility: 'hidden',
      opacity: '0',
      transition: 'opacity 0.2s ease',
    });
    this._root = root;

    // --- panel ---
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      maxWidth: '480px',
      width: '90%',
      maxHeight: '85vh',
      overflowY: 'auto',
      background: 'rgba(15, 15, 30, 0.95)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px',
      padding: '32px',
      boxSizing: 'border-box',
    });
    root.appendChild(panel);

    // --- title ---
    panel.appendChild(this._heading('SETTINGS', {
      fontSize: '24px',
      color: '#e0e0e0',
      letterSpacing: '4px',
      textAlign: 'center',
      marginBottom: '28px',
    }));

    // --- audio section ---
    panel.appendChild(this._sectionLabel('AUDIO'));

    // volume row
    const volRow = this._row();
    const volLabel = this._label('Master Volume');
    const volValue = this._label('70%');
    volValue.style.color = '#e0e0e0';
    volValue.style.minWidth = '36px';
    volValue.style.textAlign = 'right';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = '70';
    Object.assign(slider.style, {
      flex: '1',
      height: '4px',
      margin: '0 12px',
      cursor: 'pointer',
      accentColor: '#00c864',
    });
    slider.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      volValue.textContent = v + '%';
      if (this._volumeCb) this._volumeCb(v / 100);
    });

    volRow.appendChild(volLabel);
    volRow.appendChild(slider);
    volRow.appendChild(volValue);
    panel.appendChild(volRow);

    // mute row
    const muteRow = this._row();
    muteRow.style.marginTop = '12px';
    const muteLabel = this._label('Mute All');

    const muteBox = document.createElement('input');
    muteBox.type = 'checkbox';
    Object.assign(muteBox.style, {
      width: '16px',
      height: '16px',
      cursor: 'pointer',
      accentColor: '#00c864',
    });
    muteBox.addEventListener('change', () => {
      if (this._muteCb) this._muteCb(muteBox.checked);
    });

    muteRow.appendChild(muteLabel);
    muteRow.appendChild(muteBox);
    panel.appendChild(muteRow);

    // --- controls section ---
    panel.appendChild(this._sectionLabel('CONTROLS'));

    for (const [key, desc] of KEYBINDS) {
      const row = this._row();
      const k = this._label(key);
      k.style.color = '#00c864';
      k.style.minWidth = '80px';
      const sep = this._label('\u2014');
      sep.style.margin = '0 10px';
      sep.style.color = '#555';
      const d = this._label(desc);
      d.style.color = '#888';
      row.appendChild(k);
      row.appendChild(sep);
      row.appendChild(d);
      panel.appendChild(row);
    }

    // --- about section ---
    panel.appendChild(this._sectionLabel('ABOUT'));

    const aboutLines = [
      'DevLife v0.1',
      'The Biometric Developer Simulator',
      'Built for ROG 20-Year Coding Challenge 2026',
      'by David Amariei',
    ];
    for (const line of aboutLines) {
      const p = document.createElement('div');
      p.textContent = line;
      Object.assign(p.style, {
        fontFamily: "'Courier New', monospace",
        fontSize: '12px',
        color: '#555',
        textAlign: 'center',
        lineHeight: '1.8',
      });
      panel.appendChild(p);
    }

    // --- close button ---
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715 CLOSE';
    Object.assign(closeBtn.style, {
      display: 'block',
      margin: '28px auto 0',
      padding: '10px 28px',
      fontFamily: "'Courier New', monospace",
      fontSize: '14px',
      color: '#aaa',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '4px',
      cursor: 'pointer',
      letterSpacing: '2px',
      transition: 'border-color 0.15s, color 0.15s, box-shadow 0.15s',
    });
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = '#00c864';
      closeBtn.style.borderColor = '#00c864';
      closeBtn.style.boxShadow = '0 0 12px rgba(0,200,100,0.25)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = '#aaa';
      closeBtn.style.borderColor = 'rgba(255,255,255,0.12)';
      closeBtn.style.boxShadow = 'none';
    });
    closeBtn.addEventListener('click', () => this.hide());
    panel.appendChild(closeBtn);

    document.body.appendChild(root);
  }

  // ---- public api ----

  show() {
    this._root.style.visibility = 'visible';
    void this._root.offsetWidth;
    this._root.style.opacity = '1';
  }

  hide() {
    this._root.style.opacity = '0';
    setTimeout(() => {
      this._root.style.visibility = 'hidden';
    }, 200);
  }

  onVolumeChange(callback) {
    this._volumeCb = callback;
  }

  onMuteToggle(callback) {
    this._muteCb = callback;
  }

  destroy() {
    this._root.remove();
  }

  // ---- internal helpers ----

  _heading(text, styles) {
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
      fontFamily: "'Courier New', monospace",
      ...styles,
    });
    return el;
  }

  _sectionLabel(text) {
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
      fontFamily: "'Courier New', monospace",
      fontSize: '11px',
      color: '#555',
      letterSpacing: '3px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      paddingBottom: '6px',
      marginTop: '24px',
      marginBottom: '14px',
    });
    return el;
  }

  _row() {
    const el = document.createElement('div');
    Object.assign(el.style, {
      display: 'flex',
      alignItems: 'center',
      marginBottom: '6px',
    });
    return el;
  }

  _label(text) {
    const el = document.createElement('span');
    el.textContent = text;
    Object.assign(el.style, {
      fontFamily: "'Courier New', monospace",
      fontSize: '14px',
      color: '#aaa',
    });
    return el;
  }
}
