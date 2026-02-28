// DevLife — Terminal App (fake shell UI)
// Player walks to desk_terminal → this opens.

const FAKE_RESPONSES = {
    'help': 'Available commands: ls, cd, cat, pwd, npm, git, python3, clear, exit',
    'ls': 'node_modules/  src/  public/  package.json  vite.config.js  README.md  .gitignore',
    'ls -la': 'total 156\ndrwxr-xr-x  8 david staff  256 Feb 25 10:30 .\ndrwxr-xr-x  5 david staff  160 Feb 24 09:00 ..\n-rw-r--r--  1 david staff  234 Feb 25 10:30 .gitignore\ndrwxr-xr-x 12 david staff  384 Feb 25 10:28 node_modules\n-rw-r--r--  1 david staff  482 Feb 25 10:28 package.json\ndrwxr-xr-x  6 david staff  192 Feb 25 10:30 src\n-rw-r--r--  1 david staff  156 Feb 24 14:00 vite.config.js',
    'pwd': '/home/david/devlife-frontend',
    'cat package.json': '{\n  "name": "devlife-frontend",\n  "version": "1.0.0",\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build"\n  },\n  "dependencies": {\n    "pixi.js": "^7.3.0"\n  }\n}',
    'npm run dev': '  VITE v5.0.0  ready in 342ms\n\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: http://192.168.1.42:5173/',
    'npm run build': 'vite v5.0.0 building for production...\n✓ 42 modules transformed.\ndist/index.html          0.45 kB │ gzip:  0.29 kB\ndist/assets/index-Ck1.js 142.30 kB │ gzip: 45.67 kB\n✓ built in 1.23s',
    'npm test': 'FAIL src/utils/isometric.test.js\n  ● Test suite failed to run\n    Cannot find module \'./isometric\' from \'src/utils/isometric.test.js\'\n\nTest Suites: 1 failed, 2 passed, 3 total\nTests:       1 failed, 5 passed, 6 total\nTime:        2.341s',
    'git status': 'On branch main\nChanges not staged for commit:\n  modified:   src/main.js\n  modified:   src/apps/CodeEditor.js\n\nUntracked files:\n  src/room/Atmosphere.js',
    'git log --oneline': 'a3f2b1c Fix Ghost intervention timing\n8d4e6f2 Add biometric HUD component\n1c9a3b5 Wire up WebSocket events\nb7e4a90 Initial PixiJS setup\nf2d8c11 Initial commit',
    'git push --force': '⚠️  Force pushing to main...\nCounting objects: 42, done.\nDelta compression using up to 8 threads.\nCompressing objects: 100% (38/38), done.\nTotal 42 (delta 12), reused 0 (delta 0)\nTo github.com:devlife-game/devlife.git\n + a3f2b1c...f2d8c11 main -> main (forced update)'
};

function getResponse(cmd) {
    const trimmed = cmd.trim();
    if (FAKE_RESPONSES[trimmed] !== undefined) return { text: FAKE_RESPONSES[trimmed], isError: trimmed === 'npm test' };
    if (trimmed.startsWith('cd ')) return { text: '', isError: false };
    if (trimmed.startsWith('python3') || trimmed.startsWith('python')) return { text: 'Python 3.11.0 (main, Oct 24 2023)\n>>> ', isError: false };
    if (trimmed.startsWith('echo ')) return { text: trimmed.slice(5), isError: false };
    if (trimmed.startsWith('cat ')) { const file = trimmed.slice(4).trim(); return { text: `${file}: No such file or directory`, isError: true }; }
    if (trimmed.startsWith('mkdir ')) return { text: '', isError: false };
    return { text: `${trimmed}: command not found`, isError: true };
}

export class TerminalApp {
    constructor(socket) {
        this.socket = socket;
        this.appType = 'terminal';
        this.isOpen = false;
        this.overlay = null;
        this.history = [];
        this.commandHistory = [];
        this.historyIndex = -1;
        this.inputEl = null;
        this.outputEl = null;
    }

    open() {
        if (this.isOpen) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'terminal-overlay';
        Object.assign(this.overlay.style, {
            position: 'fixed',
            inset: '0',
            background: '#0a0a0a',
            zIndex: '1000',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Courier New', 'Consolas', monospace",
            pointerEvents: 'auto'
        });
        document.getElementById('app-overlay-root').appendChild(this.overlay);
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt =>
            this.overlay.addEventListener(evt, e => e.stopPropagation())
        );

        // Top bar
        const topBar = document.createElement('div');
        Object.assign(topBar.style, {
            height: '36px',
            background: '#1a1a1a',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            justifyContent: 'space-between',
            flexShrink: '0'
        });

        const title = document.createElement('span');
        title.textContent = 'Terminal — bash';
        Object.assign(title.style, { color: '#888', fontSize: '13px' });

        const closeBtn = document.createElement('button');
        Object.assign(closeBtn.style, {
            background: 'transparent',
            color: '#888',
            fontSize: '13px',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px'
        });
        closeBtn.textContent = 'ESC to close';
        closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#ffffff'; });
        closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#888'; });
        closeBtn.addEventListener('click', () => this.close());

        topBar.appendChild(title);
        topBar.appendChild(closeBtn);
        this.overlay.appendChild(topBar);

        // Output area
        this.outputEl = document.createElement('div');
        Object.assign(this.outputEl.style, {
            flex: '1',
            overflowY: 'auto',
            padding: '16px',
            color: '#00ff00',
            fontSize: '14px',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap'
        });
        this.outputEl.innerHTML = '<span style="color:#00ff00">DevLife Terminal v1.0\nType \'help\' for available commands.\n\n</span>';
        this.overlay.appendChild(this.outputEl);

        // Input line
        const inputLine = document.createElement('div');
        Object.assign(inputLine.style, {
            background: '#111',
            borderTop: '1px solid #333',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            flexShrink: '0'
        });

        const prompt = document.createElement('span');
        prompt.textContent = '$ ';
        Object.assign(prompt.style, {
            color: '#00ff00',
            fontWeight: 'bold',
            marginRight: '8px',
            fontFamily: "'Courier New', 'Consolas', monospace"
        });

        this.inputEl = document.createElement('input');
        this.inputEl.type = 'text';
        this.inputEl.tabIndex = 0;
        this.inputEl.autofocus = true;
        Object.assign(this.inputEl.style, {
            flex: '1',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#00ff00',
            fontFamily: "'Courier New', 'Consolas', monospace",
            fontSize: '14px',
            caretColor: '#00ff00'
        });

        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.executeCommand(this.inputEl.value);
                this.inputEl.value = '';
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.commandHistory.length > 0) {
                    if (this.historyIndex === -1) {
                        this.historyIndex = this.commandHistory.length - 1;
                    } else if (this.historyIndex > 0) {
                        this.historyIndex--;
                    }
                    this.inputEl.value = this.commandHistory[this.historyIndex];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.historyIndex !== -1) {
                    if (this.historyIndex < this.commandHistory.length - 1) {
                        this.historyIndex++;
                        this.inputEl.value = this.commandHistory[this.historyIndex];
                    } else {
                        this.historyIndex = -1;
                        this.inputEl.value = '';
                    }
                }
            }
        });

        inputLine.appendChild(prompt);
        inputLine.appendChild(this.inputEl);
        this.overlay.appendChild(inputLine);

        // Delayed focus — DOM may not be painted yet on the synchronous call
        setTimeout(() => { this.inputEl.focus(); }, 150);

        // Clicking anywhere in the terminal re-focuses the input
        this.overlay.addEventListener('click', () => {
            if (this.inputEl) this.inputEl.focus();
        });

        this.isOpen = true;
    }

    executeCommand(cmd) {
        if (cmd.trim() === '') return;
        this.commandHistory.push(cmd);
        this.historyIndex = -1;

        if (cmd === 'clear') {
            this.outputEl.innerHTML = '';
            return;
        }
        if (cmd === 'exit') {
            this.close();
            return;
        }

        const response = getResponse(cmd);
        this.history.push({ command: cmd, output: response.text });

        const cmdSpan = document.createElement('span');
        cmdSpan.style.color = '#ffffff';
        cmdSpan.textContent = `$ ${cmd}\n`;

        const outSpan = document.createElement('span');
        outSpan.style.color = response.isError ? '#ff5050' : '#00ff00';
        outSpan.textContent = response.text ? `${response.text}\n\n` : '\n';

        this.outputEl.appendChild(cmdSpan);
        this.outputEl.appendChild(outSpan);

        this.socket.sendContentUpdate(this.appType, this.getFullText(), { shell: 'bash' });
        this.outputEl.scrollTop = this.outputEl.scrollHeight;
    }

    getFullText() {
        return this.history.map(h => `$ ${h.command}\n${h.output}\n`).join('');
    }

    close() {
        if (!this.isOpen) return;
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        this.inputEl = null;
        this.outputEl = null;
        this.isOpen = false;
    }
}
