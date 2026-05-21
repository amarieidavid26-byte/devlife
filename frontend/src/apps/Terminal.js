// Real terminal: xterm.js in the browser <-> a true PTY on the local backend.
// Replaces the old fake lookup-table terminal. Input goes out as binary frames,
// terminal output comes back as binary, window resize is a JSON control frame.
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { privilegedWsUrl, getFeatures } from '../network/session.js';
import { i18n } from '../i18n/index.js';

const ENC = new TextEncoder();

export class TerminalApp {
    constructor(socket) {
        this.socket = socket;
        this.appType = 'terminal';
        // tell the global key handler to leave ALL keys to us (digits, Escape for vim, etc.)
        this.capturesKeyboard = true;
        this.isOpen = false;
        this.overlay = null;
        this.term = null;
        this.fit = null;
        this.ws = null;
        this._resizeObserver = null;
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;

        this.overlay = document.createElement('div');
        this.overlay.id = 'terminal-overlay';
        Object.assign(this.overlay.style, {
            position: 'fixed', inset: '0', background: '#0a0a0f', zIndex: '1000',
            display: 'flex', flexDirection: 'column', pointerEvents: 'auto',
        });
        document.getElementById('app-overlay-root').appendChild(this.overlay);
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt =>
            this.overlay.addEventListener(evt, e => e.stopPropagation())
        );

        // top bar
        const topBar = document.createElement('div');
        Object.assign(topBar.style, {
            height: '36px', background: '#15151f', borderBottom: '1px solid #2a2a3a',
            display: 'flex', alignItems: 'center', padding: '0 16px',
            justifyContent: 'space-between', flexShrink: '0',
            fontFamily: "'Nunito', system-ui, sans-serif",
        });
        const title = document.createElement('span');
        title.textContent = i18n.t('terminal.title');
        Object.assign(title.style, { color: '#9aa', fontSize: '13px' });
        const closeBtn = document.createElement('button');
        closeBtn.textContent = i18n.t('terminal.close');
        Object.assign(closeBtn.style, {
            background: 'transparent', color: '#9aa', fontSize: '13px',
            border: 'none', cursor: 'pointer', padding: '4px 8px',
        });
        closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#fff'; });
        closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#9aa'; });
        // route through main.js so the game state is restored (avoids the post-close lockout)
        closeBtn.addEventListener('click', () => (this.onClose ? this.onClose() : this.close()));
        topBar.appendChild(title);
        topBar.appendChild(closeBtn);
        this.overlay.appendChild(topBar);

        // terminal host
        const host = document.createElement('div');
        Object.assign(host.style, { flex: '1', minHeight: '0', padding: '6px 8px' });
        this.overlay.appendChild(host);

        if (!getFeatures().terminal) {
            host.innerHTML = `<div style="color:#c98;font-family:monospace;padding:20px">${i18n.t('terminal.disabled')}</div>`;
            return;
        }

        this.term = new Terminal({
            cursorBlink: true,
            fontFamily: "Menlo, Monaco, 'Courier New', monospace",
            fontSize: 14,
            theme: { background: '#0a0a0f', foreground: '#d6d6e0', cursor: '#6AD89A' },
            scrollback: 5000,
        });
        this.fit = new FitAddon();
        this.term.loadAddon(this.fit);
        this.term.open(host);
        this.fit.fit();

        this._connect();

        this._resizeObserver = new ResizeObserver(() => this._fitAndNotify());
        this._resizeObserver.observe(host);

        setTimeout(() => { this.term && this.term.focus(); }, 120);
        this.overlay.addEventListener('click', () => { this.term && this.term.focus(); });
    }

    _connect() {
        const url = privilegedWsUrl('/terminal');
        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            this._fitAndNotify();
            // keystrokes -> binary frames
            this.term.onData(d => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(ENC.encode(d));
            });
        };
        this.ws.onmessage = (e) => {
            if (typeof e.data === 'string') return; // (no text frames expected from server)
            this.term.write(new Uint8Array(e.data));
        };
        this.ws.onclose = () => {
            if (this.term) this.term.write(`\r\n\x1b[90m${i18n.t('terminal.session_ended')}\x1b[0m\r\n`);
        };
        this.ws.onerror = () => {
            if (this.term) this.term.write(`\r\n\x1b[31m${i18n.t('terminal.connection_error')}\x1b[0m\r\n`);
        };
    }

    _fitAndNotify() {
        if (!this.fit || !this.term) return;
        try { this.fit.fit(); } catch (_) { /* host not laid out yet */ }
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'resize', rows: this.term.rows, cols: this.term.cols }));
        }
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
        if (this.ws) { try { this.ws.close(); } catch (_) {} this.ws = null; }
        if (this.term) { try { this.term.dispose(); } catch (_) {} this.term = null; }
        this.fit = null;
        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    }
}
