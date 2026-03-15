// lol this is so hacky
const FAKE_RESPONSES = {
    'help': 'Available commands: ls, cd, cat, pwd, npm, git, python3, clear, exit, node, whoami, date, env',
    'ls': 'src/  package.json  README.md  node_modules/  .env  .gitignore  vite.config.js  server.py',
    'ls -la': 'total 156\ndrwxr-xr-x  8 dev staff  256 Mar 10 14:30 .\ndrwxr-xr-x  3 dev staff   96 Mar 10 09:00 ..\n-rw-r--r--  1 dev staff  142 Mar 10 14:28 .env\n-rw-r--r--  1 dev staff   38 Mar  8 11:00 .gitignore\n-rw-r--r--  1 dev staff 1247 Mar 10 14:30 README.md\ndrwxr-xr-x 12 dev staff  384 Mar 10 12:00 node_modules\n-rw-r--r--  1 dev staff  892 Mar 10 14:25 package.json\n-rw-r--r--  1 dev staff 4210 Mar 10 14:30 server.py\ndrwxr-xr-x  6 dev staff  192 Mar 10 14:30 src\n-rw-r--r--  1 dev staff  341 Mar  9 16:00 vite.config.js',
    'ls src': 'apps/  character/  hud/  network/  room/  town/  utils/  main.js',
    'pwd': '/home/dev/devlife-rog',
    'cat package.json': '{\n  "name": "devlife-rog",\n  "version": "1.0.0",\n  "description": "Biometric-driven ghost AI coding companion",\n  "main": "src/main.js",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build",\n    "test": "vitest run"\n  }\n}',
    'cat .env': '# Environment variables\nCLAUDE_API_KEY=sk-ant-***\nWHOOP_CLIENT_ID=***\nWHOOP_CLIENT_SECRET=***\nPORT=8000',
    'cat README.md': '# DevLife ROG\\n\\nBiometric-driven ghost AI that monitors developer wellness\\nvia WHOOP wearable data and provides real-time interventions.\\n\\n## Features\\n- Real-time HRV/HR monitoring\\n- Cognitive state classification\\n- AI ghost companion (Claude)\\n- Fatigue firewall for risky commands',
    'npm run dev': '  VITE v5.0.0  ready in 342ms\n\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: http://192.168.1.42:5173/',
    'npm run build': 'vite v5.0.0 building for production...\n✓ 42 modules transformed.\ndist/index.html    0.45 kB │ gzip:  0.29 kB\ndist/assets/main-Dk3f2.js  187.23 kB │ gzip: 58.12 kB\n✓ built in 1.84s',
    'npm test': 'PASS src/tests/ghost.test.js\n  ✓ biometric state classification (12ms)\n  ✓ intervention threshold adapts to feedback (8ms)\n  ✓ fatigue firewall triggers on risky + fatigued (5ms)\n  ✓ deep focus protection blocks low-priority (3ms)\n\n4 tests passed, 0 failed',
    'npm install': 'added 847 packages in 12s\n\n142 packages are looking for funding\n  run `npm fund` for details',
    'git status': 'On branch main\nYour branch is up to date with \'origin/main\'.\n\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n\n\tmodified:   src/ghost_brain.py\n\tmodified:   src/biometric_engine.py\n\nno changes added to commit',
    'git log --oneline': 'a3f2b1c Wire plant_update to frontend UI\n8d4e9f2 Add fatigue firewall for risky commands\n1b7c3a0 Implement ghost speech bubble typewriter\n5e2d8f1 Initial commit -- biometric engine + ghost brain',
    'git log': 'commit a3f2b1c (HEAD -> main)\nAuthor: dev <dev@devlife.rog>\nDate:   Mon Mar 10 14:30:00 2026\n\n    Wire plant_update to frontend UI\n\ncommit 8d4e9f2\nAuthor: dev <dev@devlife.rog>\nDate:   Sun Mar 9 22:15:00 2026\n\n    Add fatigue firewall for risky commands',
    'git diff': 'diff --git a/src/ghost_brain.py b/src/ghost_brain.py\n--- a/src/ghost_brain.py\n+++ b/src/ghost_brain.py\n@@ -45,6 +45,8 @@\n+    # Adaptive cooldown based on user feedback\n+    if self.ignored_count >= 3: self.cooldown = 60',
    'git branch': '* main\n  feature/ghost-vision\n  fix/biometric-thresholds',
    'git push --force': '⚠️  Force pushing to main...\nCounting objects: 42, done.\nDelta compression using up to 8 threads.\nremote: Resolving deltas: 100% (12/12), done.\nTo github.com:dev/devlife-rog.git\n + a3f2b1c...8d4e9f2 main -> main (forced update)',
    'node -v': 'v20.11.0',
    'node --version': 'v20.11.0',
    'python --version': 'Python 3.11.5',
    'python3 --version': 'Python 3.11.5',
    'whoami': 'developer',
    'hostname': 'devlife-workstation',
    'uname -a': 'Linux devlife-workstation 6.1.0 #1 SMP x86_64 GNU/Linux',
    'which python': '/usr/bin/python3',
    'which node': '/usr/local/bin/node',
    'echo $PATH': '/usr/local/bin:/usr/bin:/bin:/usr/sbin',
    'uptime': ' 14:30:00 up 3 days, 2:15,  1 user,  load average: 0.42, 0.38, 0.35',
    'free -h': '              total        used        free\nMem:          16Gi       8.2Gi       4.1Gi\nSwap:         2.0Gi       0.0Gi       2.0Gi',
    'df -h': 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       500G  124G  376G  25% /',
    'top': 'PID   USER      PR  NI    VIRT    RES  %CPU  %MEM  COMMAND\n1234  dev       20   0  1.2Gi  256Mi  12.3   1.6  node\n5678  dev       20   0  890Mi  180Mi   8.7   1.1  python3\n9012  dev       20   0  450Mi   92Mi   2.1   0.6  vite',
    'ps aux': 'USER       PID %CPU %MEM COMMAND\ndev       1234 12.3  1.6 node src/main.js\ndev       5678  8.7  1.1 python3 server.py\ndev       9012  2.1  0.6 vite --host',
    'curl localhost:8000/health': '{"status": "ok", "ghost_running": true, "connected_clients": 1, "biometric_source": "mock"}',
    'ping localhost': 'PING localhost (127.0.0.1): 56 data bytes\n64 bytes from 127.0.0.1: icmp_seq=0 ttl=64 time=0.042 ms\n64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=0.038 ms\n--- localhost ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss',
};

function getResponse(cmd) {
    const trimmed = cmd.trim();
    if (FAKE_RESPONSES[trimmed] !== undefined) return { text: FAKE_RESPONSES[trimmed], isError: trimmed === 'npm test' };
    if (trimmed.startsWith('cd ')) return { text: '', isError: false };
    if (trimmed.startsWith('python3') || trimmed.startsWith('python')) return { text: 'Python 3.11.0 (main, Oct 24 2023)\n>>> ', isError: false };
    if (trimmed.startsWith('echo ')) return { text: trimmed.slice(5), isError: false };
    if (trimmed.startsWith('cat ')) { const file = trimmed.slice(4).trim(); return { text: `${file}: No such file or directory`, isError: true }; }
    if (trimmed.startsWith('mkdir ')) return { text: '', isError: false };
    if (trimmed === 'date') return { text: new Date().toString(), isError: false };
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
        title.textContent = 'Terminal -- bash';
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

        setTimeout(() => { this.inputEl.focus(); }, 150);

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
