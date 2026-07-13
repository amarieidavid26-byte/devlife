// captures typing RHYTHM only, never key contents: for each keydown inside a
// typing surface we record [ms since previous key, category] and batch it to the
// backend every 5s. backend side: keystroke_dynamics.py
// categories: char / backspace / enter / nav

const TYPING_SURFACES = 'input, textarea, [contenteditable="true"], .monaco-editor, .xterm';
const FLUSH_MS = 5000;
const MAX_BATCH = 300;
const MAX_IKI_MS = 10000;

export class KeystrokeCapture {
    constructor(ws) {
        this.ws = ws;
        this.batch = [];
        this.lastKeyTime = 0;
        this.timer = null;
        this._onKey = this._onKey.bind(this);
    }

    start() {
        window.addEventListener('keydown', this._onKey, true);
        this.timer = setInterval(() => this.flush(), FLUSH_MS);
    }

    stop() {
        window.removeEventListener('keydown', this._onKey, true);
        clearInterval(this.timer);
    }

    _onKey(e) {
        if (e.repeat) return;
        const t = e.target;
        if (!(t && t.closest && t.closest(TYPING_SURFACES))) return;

        let cat;
        if (e.key === 'Backspace' || e.key === 'Delete') cat = 'backspace';
        else if (e.key === 'Enter') cat = 'enter';
        else if (e.key.startsWith('Arrow')) cat = 'nav';
        else if (e.key.length === 1) cat = 'char';
        else return;

        const now = performance.now();
        const iki = this.lastKeyTime ? Math.min(MAX_IKI_MS, Math.round(now - this.lastKeyTime)) : 0;
        this.lastKeyTime = now;
        if (this.batch.length < MAX_BATCH) this.batch.push([iki, cat]);
    }

    flush() {
        if (!this.batch.length) return;
        this.ws.sendKeystrokes(this.batch);
        this.batch = [];
    }
}
