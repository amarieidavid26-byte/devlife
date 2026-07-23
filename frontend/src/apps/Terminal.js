// Real terminal: xterm.js in the browser <-> a true PTY on the local backend.
// Replaces the old fake lookup-table terminal. Input goes out as binary frames,
// terminal output comes back as binary, window resize is a JSON control frame.
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { privilegedWsUrl, getFeatures } from '../network/session.js';
import { i18n } from '../i18n/index.js';

const ENC = new TextEncoder();

const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Risky-command firewall — JS mirror of content_analyzer.RISKY_COMMAND_PATTERNS. Commands that
// can nuke a repo/server. Each entry: [regex, short human description for the warning].
const RISKY_PATTERNS = [
    [/rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*-rf\s+)/i, 'rm -rf — deletes files permanently'],
    [/git\s+push\s+.*--force/i, 'git push --force — can overwrite the remote'],
    [/git\s+push\s+-f\b/i, 'git push -f — can overwrite the remote'],
    [/DROP\s+(TABLE|DATABASE|INDEX)/i, 'DROP — destroys database objects'],
    [/chmod\s+777\b/i, 'chmod 777 — far too permissive'],
    [/sudo\s+rm\b/i, 'sudo rm — elevated delete'],
    [/git\s+reset\s+--hard/i, 'git reset --hard — discards uncommitted work'],
    [/DELETE\s+FROM\s+\w+/i, 'DELETE FROM — removes database rows'],
    [/docker\s+rm\s+-f/i, 'docker rm -f — force-removes a container'],
    [/npm\s+publish\b/i, 'npm publish — publishes to the registry'],
];

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
        // firewall state
        this._lineBuf = '';                 // best-effort mirror of the current shell input line
        this._bio = {};                     // latest biometrics (state/heartRate/recovery/hrv)
        this._onBio = null;
        this._firewallEl = null;
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;

        // track the live cognitive state so the firewall message reflects real biometrics
        this._onBio = (d) => {
            this._bio = { state: d.state, heartRate: d.heartRate, recovery: d.recovery, hrv: d.hrv };
        };
        if (this.socket && this.socket.on) this.socket.on('biometric_update', this._onBio);

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

        // Shift+Esc closes; a bare Esc must stay a raw byte for vim and other TUIs
        this.term.attachCustomKeyEventHandler((e) => {
            if (e.type === 'keydown' && e.key === 'Escape' && e.shiftKey) {
                if (this.onClose) this.onClose(); else this.close();
                return false;
            }
            return true;
        });

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
            // keystrokes -> binary frames, but the firewall inspects each Enter first
            this.term.onData(d => this._handleInput(d));
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

    _send(d) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(ENC.encode(d));
    }

    _sendCtrl(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
    }

    // firewall blocks count as interventions in the dashboard; without a backend, emit the same event locally
    _reportBlock(cmd, desc) {
        if (this.socket && this.socket.isConnected) {
            this.socket.send({ type: 'firewall_block', command: cmd, description: desc });
            return;
        }
        const state = (this._bio && this._bio.state) || 'RELAXED';
        const critical = state === 'FATIGUED' || state === 'STRESSED' || state === 'WIRED';
        this.socket && this.socket.emit && this.socket.emit('intervention', {
            type: 'intervention',
            message: i18n.t('firewall.blocked_line', { cmd }),
            priority: critical ? 'critical' : 'high',
            reason: state === 'FATIGUED' ? 'fatigue_firewall' : 'stress_firewall',
            state,
            buttons: [],
            source: 'terminal_firewall',
            silent: true,
        });
    }

    _matchRisky(cmd) {
        for (const [re, desc] of RISKY_PATTERNS) { if (re.test(cmd)) return desc; }
        return null;
    }

    // Inspect every keystroke. Detect risky commands LIVE (as they're typed) and block the
    // Enter so they never reach the shell. Live echo stays intact — the chars sit in the shell
    // line, unexecuted, until the user clears them or chooses "Run anyway".
    _handleInput(d) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // ENTER: if the line is risky, withhold the Enter (command does NOT run). The banner is
        // already up from live detection; ensure it's shown.
        if (d === '\r' || d === '\n') {
            const cmd = this._lineBuf.trim();
            const desc = this._matchRisky(cmd);
            if (desc) {
                if (!this._firewallEl) this._showFirewall(cmd, desc);
                return;                          // do NOT forward Enter -> shell never runs it
            }
            this._dismissFirewall();
            this._lineBuf = '';
            this._send(d);
            return;
        }

        // update the best-effort mirror of the current input line
        if (d === '\x7f' || d === '\b') {
            this._lineBuf = this._lineBuf.slice(0, -1);
        } else if (d === '\x03' || d === '\x15' || d.charCodeAt(0) === 27) {
            this._lineBuf = '';                  // Ctrl+C / Ctrl+U / escape seq (arrows, history)
            this._dismissFirewall();
        } else {
            for (const ch of d) { if (ch >= ' ') this._lineBuf += ch; }
        }
        this._send(d);

        // LIVE detection: pop the firewall the instant the typed line matches a risky pattern
        const desc = this._matchRisky(this._lineBuf);
        if (desc && !this._firewallEl) this._showFirewall(this._lineBuf.trim(), desc);
        else if (!desc && this._firewallEl) this._dismissFirewall();
    }

    _showFirewall(cmd, desc) {
        this._dismissFirewall();
        this._reportBlock(cmd, desc);
        const b = this._bio || {};
        const rec = (b.recovery != null) ? b.recovery : '—';
        const hrv = (b.hrv != null) ? Math.round(b.hrv) : '—';
        const hr = (b.heartRate != null) ? Math.round(b.heartRate) : '—';

        let titleKey, bodyKey, critical;
        if (b.state === 'FATIGUED') {
            titleKey = 'firewall.fatigue_title'; bodyKey = 'firewall.fatigue_body'; critical = true;
        } else if (b.state === 'STRESSED' || b.state === 'WIRED') {
            titleKey = 'firewall.stress_title'; bodyKey = 'firewall.stress_body'; critical = true;
        } else {
            titleKey = 'firewall.risky_title'; bodyKey = 'firewall.risky_body'; critical = false;
        }
        const title = i18n.t(titleKey);
        const body = i18n.t(bodyKey, { desc, rec, hrv, hr });
        // NOTE: don't write to xterm here — the shell is actively drawing the (still-typed)
        // input line, so any write would corrupt it. The DOM banner is the whole UI.

        const accent = critical ? '#ff5050' : '#e0a84c';
        const el = document.createElement('div');
        Object.assign(el.style, {
            position: 'absolute', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
            width: 'min(560px, 92%)', background: critical ? 'rgba(40,12,12,0.97)' : 'rgba(34,28,12,0.97)',
            border: `1px solid ${accent}`, borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.55)',
            padding: '14px 16px', zIndex: '20', fontFamily: "'Nunito', system-ui, sans-serif", color: '#f0e8e8',
        });
        const btnBase = 'border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;';
        el.innerHTML =
            `<div style="font-weight:800;font-size:14px;color:${accent};margin-bottom:5px">🛡️ ${esc(title)}</div>` +
            `<div style="font-size:13px;line-height:1.45;color:#d8d2d2;margin-bottom:12px">${esc(body)}</div>` +
            `<div style="display:flex;gap:8px;justify-content:flex-end">` +
            `<button data-act="cancel" style="${btnBase}background:#2a2a3a;color:#e8e8ee">${esc(i18n.t('firewall.cancel'))}</button>` +
            `<button data-act="anyway" style="${btnBase}background:transparent;color:${accent};border:1px solid ${accent}">${esc(i18n.t('firewall.do_anyway'))}</button>` +
            `</div>`;
        el.addEventListener('click', (e) => e.stopPropagation());
        el.querySelector('[data-act="cancel"]').addEventListener('click', () => {
            // Ctrl+U: the one line-kill the server-side firewall also recognises, so both
            // its buffer and ours drop the command (Ctrl+A/Ctrl+K would desync them)
            this._send('\x15');
            this._lineBuf = '';
            this._dismissFirewall();
            this.term && this.term.focus();
        });
        el.querySelector('[data-act="anyway"]').addEventListener('click', () => {
            this._lineBuf = '';
            this._dismissFirewall();
            // the server firewall would swallow this Enter too; arm a one-shot override so the
            // user's explicit override actually runs (it is audited server-side)
            this._sendCtrl({ type: 'firewall_override' });
            this._send('\r');
            this.term && this.term.focus();
        });
        this.overlay.appendChild(el);
        this._firewallEl = el;
    }

    _dismissFirewall() {
        if (this._firewallEl) { this._firewallEl.remove(); this._firewallEl = null; }
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
        if (this.socket && this.socket.off && this._onBio) this.socket.off('biometric_update', this._onBio);
        this._onBio = null;
        this._dismissFirewall();
        this._lineBuf = '';
        if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
        if (this.ws) { try { this.ws.close(); } catch (_) {} this.ws = null; }
        if (this.term) { try { this.term.dispose(); } catch (_) {} this.term = null; }
        this.fit = null;
        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    }
}
