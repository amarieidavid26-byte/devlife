import { i18n } from '../i18n/index.js';
import { JsRunner } from './runners/JsRunner.js';
import { PythonRunner } from './runners/PythonRunner.js';

const STARTER_CODES = {
    python: {
        file: 'demo.py',
        lang: 'python',
        code: `# Ghost Demo -- Bug Detection
# Try introducing a bug and watch Ghost help you!

def calculate_total(items):
    total = 0
    for item in items:
        total += item.price
    return total

def get_user_data(user_id):
    data = fetch_from_database(user_id)
    return data

# Try typing: result = calculate_total(None)
# Ghost will detect the TypeError risk!
`,
    },
    javascript: {
        file: 'app.js',
        lang: 'javascript',
        code: `// Ghost Demo -- Bug Detection
// Try introducing a bug and watch Ghost help you!

function calculateTotal(items) {
    let total = 0;
    for (const item of items) {
        total += item.price;
    }
    return total;
}

async function getUserData(userId) {
    const data = await fetchFromDatabase(userId);
    return data;
}

// Try typing: const result = calculateTotal(null);
// Ghost will detect the TypeError risk!
`,
    },
    go: {
        file: 'main.go',
        lang: 'go',
        code: `// Ghost Demo -- Bug Detection
// Try introducing a bug and watch Ghost help you!
package main

func calculateTotal(items []Item) float64 {
    total := 0.0
    for _, item := range items {
        total += item.Price
    }
    return total
}

func getUserData(userID string) (User, error) {
    data, err := fetchFromDatabase(userID)
    return data, err
}

// Try typing: result := calculateTotal(nil)
// Ghost will detect the nil pointer risk!
`,
    },
    cpp: {
        file: 'main.cpp',
        lang: 'cpp',
        code: `// Ghost Demo -- Bug Detection
// Try introducing a bug and watch Ghost help you!

#include <vector>
#include <string>

double calculateTotal(std::vector<Item>& items) {
    double total = 0;
    for (auto& item : items) {
        total += item.price;
    }
    return total;
}

std::string getUserData(int userId) {
    auto data = fetchFromDatabase(userId);
    return data;
}

// Try typing: auto result = calculateTotal(nullptr);
// Ghost will detect the null pointer risk!
`,
    },
};

const LANG_BUTTONS = [
    { key: 'python', label: 'PY' },
    { key: 'javascript', label: 'JS' },
    { key: 'go', label: 'GO' },
    { key: 'cpp', label: 'C++' },
];

export class CodeEditorApp {
    constructor(socket) {
        this.socket = socket;
        this.appType = 'code';
        this.isOpen = false;
        this.overlay = null;
        this.editor = null;
        this.monacoLoaded = false;
        this.currentLang = 'python';
        this._tabEl = null;
        this._langBtns = {};
        this._monaco = null;
        // runner state
        this._runBtn = null;
        this._stopBtn = null;
        this._reviewOnlyEl = null;
        this._outputPanel = null;
        this._stdinEl = null;
        this._stdoutEl = null;
        this._badgeEl = null;
        this._outputTabBtns = null;
        this._stdinValue = '';
        this._currentOutputTab = 'stdout';
        this._isRunning = false;
        this._lastRunCode = '';
        this._jsRunner = null;
        this._lastRunErrorKey = '';
        this._lastRunErrorTime = 0;
    }

    open() {
        if (this.isOpen) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'code-editor-overlay';
        this.overlay.style.position = 'fixed';
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        this.overlay.style.width = '100%';
        this.overlay.style.height = '100%';
        this.overlay.style.background = '#1e1e1e';
        this.overlay.style.zIndex = '1000';
        this.overlay.style.display = 'flex';
        this.overlay.style.flexDirection = 'column';
        this.overlay.style.pointerEvents = 'auto';
        document.getElementById('app-overlay-root').appendChild(this.overlay);
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt =>
            this.overlay.addEventListener(evt, e => e.stopPropagation())
        );

        const topBar = document.createElement('div');
        topBar.style.height = '40px';
        topBar.style.background = '#252526';
        topBar.style.borderBottom = '1px solid #3c3c3c';
        topBar.style.display = 'flex';
        topBar.style.alignItems = 'center';
        topBar.style.justifyContent = 'space-between';
        topBar.style.padding = '0 16px';
        topBar.style.flexShrink = '0';

        // left side: tab + lang buttons
        const leftGroup = document.createElement('div');
        leftGroup.style.display = 'flex';
        leftGroup.style.alignItems = 'center';
        leftGroup.style.gap = '10px';

        const tab = document.createElement('span');
        tab.style.background = '#1e1e1e';
        tab.style.padding = '6px 16px';
        tab.style.borderTop = '2px solid #007acc';
        tab.style.color = '#ffffff';
        tab.style.fontSize = '13px';
        tab.textContent = STARTER_CODES[this.currentLang].file;
        this._tabEl = tab;
        leftGroup.appendChild(tab);

        // lang switcher buttons
        const langRow = document.createElement('div');
        langRow.style.display = 'flex';
        langRow.style.gap = '4px';

        for (const { key, label } of LANG_BUTTONS) {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = `
                width:28px; height:20px; border:none; border-radius:3px;
                font-family:'Nunito',sans-serif; font-size:10px; font-weight:700;
                cursor:pointer; transition:background 0.15s, color 0.15s;
                letter-spacing:0.5px;
            `;
            this._applyLangBtnStyle(btn, key === this.currentLang);
            btn.addEventListener('click', () => this._switchLang(key));
            this._langBtns[key] = btn;
            langRow.appendChild(btn);
        }
        leftGroup.appendChild(langRow);
        topBar.appendChild(leftGroup);

        // right group: review-only hint (go/cpp) | Run | Stop | close
        const rightGroup = document.createElement('div');
        rightGroup.style.cssText = 'display:flex;align-items:center;gap:10px;';

        const reviewOnly = document.createElement('span');
        reviewOnly.style.cssText = 'color:#777;font-family:"Nunito",sans-serif;font-size:11px;display:none;';
        reviewOnly.textContent = i18n.t('runner.review_only_hint');
        this._reviewOnlyEl = reviewOnly;
        rightGroup.appendChild(reviewOnly);

        const runBtn = document.createElement('button');
        runBtn.style.cssText = "display:flex;align-items:center;gap:5px;height:24px;padding:0 10px;background:#0e7a3c;color:#ffffff;border:none;border-radius:3px;font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:0.5px;transition:background 0.15s;";
        runBtn.innerHTML = `<span style="font-size:9px;">▶</span><span>${i18n.t('runner.run')}</span>`;
        runBtn.addEventListener('mouseenter', () => { runBtn.style.background = '#0fa551'; });
        runBtn.addEventListener('mouseleave', () => { runBtn.style.background = '#0e7a3c'; });
        runBtn.addEventListener('click', () => this.runCode());
        this._runBtn = runBtn;
        rightGroup.appendChild(runBtn);

        const stopBtn = document.createElement('button');
        stopBtn.style.cssText = "display:none;align-items:center;gap:5px;height:24px;padding:0 10px;background:#7a1e1e;color:#ffffff;border:none;border-radius:3px;font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:0.5px;transition:background 0.15s;";
        stopBtn.innerHTML = `<span style="font-size:9px;">■</span><span>${i18n.t('runner.stop')}</span>`;
        stopBtn.addEventListener('mouseenter', () => { stopBtn.style.background = '#a52828'; });
        stopBtn.addEventListener('mouseleave', () => { stopBtn.style.background = '#7a1e1e'; });
        stopBtn.addEventListener('click', () => this.stopRun());
        this._stopBtn = stopBtn;
        rightGroup.appendChild(stopBtn);

        const closeBtn = document.createElement('button');
        closeBtn.style.background = 'transparent';
        closeBtn.style.color = '#888';
        closeBtn.style.fontSize = '13px';
        closeBtn.style.border = 'none';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.padding = '4px 8px';
        closeBtn.textContent = 'ESC to close';
        closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#ffffff'; });
        closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#888'; });
        closeBtn.addEventListener('click', () => this.close());
        rightGroup.appendChild(closeBtn);

        topBar.appendChild(rightGroup);

        this.overlay.appendChild(topBar);

        this._setRunButtonVisibility(this.currentLang);

        const editorContainer = document.createElement('div');
        editorContainer.style.flex = '1';
        editorContainer.style.position = 'relative';
        this.overlay.appendChild(editorContainer);

        // output panel below editor (stdin / stdout tabs)
        this._outputPanel = this._buildOutputPanel();
        this.overlay.appendChild(this._outputPanel);

        // grabbed this from stackoverflow
        if (!this.monacoLoaded) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js';
            script.onload = () => {
                require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
                require(['vs/editor/editor.main'], (monaco) => {
                    this.monacoLoaded = true;
                    this._monaco = monaco;
                    this.createEditor(monaco, editorContainer);
                });
            };
            document.head.appendChild(script);
        } else {
            require(['vs/editor/editor.main'], (monaco) => {
                this._monaco = monaco;
                this.createEditor(monaco, editorContainer);
            });
        }

        this.isOpen = true;
    }

    createEditor(monaco, container) {
        const starter = STARTER_CODES[this.currentLang];
        this.editor = monaco.editor.create(container, {
            value: starter.code,
            language: starter.lang,
            theme: 'vs-dark',
            fontSize: 14,
            lineNumbers: 'on',
            minimap: { enabled: true },
            automaticLayout: true,
            wordWrap: 'on',
            padding: { top: 16 },
            scrollBeyondLastLine: false
        });

        this.editor.onDidChangeModelContent(() => {
            const position = this.editor.getPosition();
            this.socket.sendContentUpdate(this.appType, this.editor.getValue(), {
                language: this.currentLang,
                cursor_line: position ? position.lineNumber : 1
            });
        });

        this.editor.focus();
    }

    _switchLang(lang) {
        if (lang === this.currentLang) return;
        this.currentLang = lang;
        const starter = STARTER_CODES[lang];

        // update tab label
        if (this._tabEl) this._tabEl.textContent = starter.file;

        // update button styles
        for (const [k, btn] of Object.entries(this._langBtns)) {
            this._applyLangBtnStyle(btn, k === lang);
        }

        // swap monaco language and content
        if (this.editor && this._monaco) {
            const model = this.editor.getModel();
            if (model) this._monaco.editor.setModelLanguage(model, starter.lang);
            this.editor.setValue(starter.code);
            this.editor.focus();
        }

        this._setRunButtonVisibility(lang);
    }

    _applyLangBtnStyle(btn, active) {
        btn.style.background = active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)';
        btn.style.color = active ? '#ffffff' : '#888';
    }

    _buildOutputPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'height:180px;background:#252526;border-top:1px solid #3c3c3c;display:flex;flex-direction:column;flex-shrink:0;';

        const tabStrip = document.createElement('div');
        tabStrip.style.cssText = 'height:26px;background:#1e1e1e;display:flex;align-items:center;padding:0 8px;gap:2px;border-bottom:1px solid #3c3c3c;flex-shrink:0;';

        const mkTabBtn = (key, label) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = "background:transparent;border:none;color:#888;font-family:'Nunito',sans-serif;font-size:11px;padding:4px 12px;cursor:pointer;letter-spacing:0.5px;border-radius:3px;";
            b.addEventListener('click', () => this._switchOutputTab(key));
            return b;
        };

        const stdinTab = mkTabBtn('stdin', i18n.t('runner.stdin_tab'));
        const stdoutTab = mkTabBtn('stdout', i18n.t('runner.stdout_tab'));
        this._outputTabBtns = { stdin: stdinTab, stdout: stdoutTab };
        tabStrip.appendChild(stdinTab);
        tabStrip.appendChild(stdoutTab);

        const badges = document.createElement('div');
        badges.style.cssText = "margin-left:auto;display:flex;gap:8px;align-items:center;font-family:'Courier New',monospace;font-size:10px;color:#888;";
        this._badgeEl = badges;
        tabStrip.appendChild(badges);

        panel.appendChild(tabStrip);

        const stdin = document.createElement('textarea');
        stdin.spellcheck = false;
        stdin.style.cssText = "flex:1;background:#1e1e1e;color:#ccc;border:none;outline:none;padding:10px;font-family:'Courier New',monospace;font-size:13px;resize:none;display:none;";
        stdin.value = this._stdinValue || '';
        stdin.addEventListener('input', () => { this._stdinValue = stdin.value; });
        this._stdinEl = stdin;
        panel.appendChild(stdin);

        const stdout = document.createElement('pre');
        stdout.style.cssText = "flex:1;margin:0;padding:10px;overflow:auto;background:#1e1e1e;color:#ccc;font-family:'Courier New',monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;display:block;";
        stdout.textContent = '';
        this._stdoutEl = stdout;
        panel.appendChild(stdout);

        this._switchOutputTab('stdout');
        return panel;
    }

    _switchOutputTab(which) {
        this._currentOutputTab = which;
        if (this._stdinEl) this._stdinEl.style.display = which === 'stdin' ? 'block' : 'none';
        if (this._stdoutEl) this._stdoutEl.style.display = which === 'stdout' ? 'block' : 'none';
        if (this._outputTabBtns) {
            for (const [k, b] of Object.entries(this._outputTabBtns)) {
                b.style.color = (k === which) ? '#ffffff' : '#888';
                b.style.background = (k === which) ? 'rgba(255,255,255,0.08)' : 'transparent';
            }
        }
    }

    _canRunCurrentLang() {
        return this.currentLang === 'python' || this.currentLang === 'javascript';
    }

    _setRunButtonVisibility(lang) {
        const canRun = lang === 'python' || lang === 'javascript';
        if (this._runBtn) this._runBtn.style.display = (canRun && !this._isRunning) ? 'flex' : 'none';
        if (this._stopBtn) this._stopBtn.style.display = (canRun && this._isRunning) ? 'flex' : 'none';
        if (this._reviewOnlyEl) this._reviewOnlyEl.style.display = canRun ? 'none' : 'inline';
    }

    _renderRunningState(running) {
        this._isRunning = running;
        this._setRunButtonVisibility(this.currentLang);
    }

    async runCode() {
        if (this._isRunning) return;
        if (!this.editor) return;
        if (!this._canRunCurrentLang()) return;

        const code = this.editor.getValue();
        const stdin = this._stdinValue || '';
        this._lastRunCode = code;
        this._switchOutputTab('stdout');
        this._renderRunningState(true);
        this._writeRunningPlaceholder();

        let result;
        if (this.currentLang === 'javascript') {
            if (!this._jsRunner) this._jsRunner = new JsRunner();
            result = await this._jsRunner.run(code, stdin);
        } else if (this.currentLang === 'python') {
            result = await PythonRunner.get().run(code, stdin);
        } else {
            result = {
                stdout: '',
                stderr: `Unsupported language: ${this.currentLang}`,
                exit: 1,
                ms: 0,
            };
        }
        this.displayRunResult(result);
    }

    stopRun() {
        if (!this._isRunning) return;
        if (this.currentLang === 'javascript' && this._jsRunner) {
            this._jsRunner.stop();
        } else if (this.currentLang === 'python') {
            PythonRunner.get().stop();
        }
    }

    _writeRunningPlaceholder() {
        if (!this._stdoutEl) return;
        this._stdoutEl.innerHTML = '';
        const span = document.createElement('span');
        span.style.color = '#888';
        span.textContent = i18n.t('runner.running');
        this._stdoutEl.appendChild(span);
        if (this._badgeEl) this._badgeEl.innerHTML = '';
    }

    displayRunResult(result) {
        this._renderRunningState(false);
        this._switchOutputTab('stdout');
        if (!this._stdoutEl) return;

        this._stdoutEl.innerHTML = '';
        const out = result.stdout || '';
        const err = result.stderr || '';

        if (out) {
            const span = document.createElement('span');
            span.style.color = '#6AD89A';
            span.textContent = out;
            this._stdoutEl.appendChild(span);
        }
        if (err) {
            if (out) this._stdoutEl.appendChild(document.createTextNode('\n'));
            const span = document.createElement('span');
            span.style.color = '#FF7A6A';
            span.textContent = err;
            this._stdoutEl.appendChild(span);
        }
        if (!out && !err) {
            const span = document.createElement('span');
            span.style.color = '#666';
            span.textContent = i18n.t('runner.no_output');
            this._stdoutEl.appendChild(span);
        }

        this._stdoutEl.scrollTop = this._stdoutEl.scrollHeight;

        // notify Ghost about real runtime errors (skip user-stop / timeout fluctuation)
        // exit 130 = SIGINT (user pressed Stop); we don't want feedback for that
        if (err && result.exit !== 130 && this._lastRunCode && this.socket && this.socket.sendRunError) {
            const fingerprint = `${this.currentLang}|${err.slice(0, 200)}`;
            const now = Date.now();
            if (fingerprint !== this._lastRunErrorKey || now - this._lastRunErrorTime > 5000) {
                this._lastRunErrorKey = fingerprint;
                this._lastRunErrorTime = now;
                this.socket.sendRunError(this._lastRunCode, err, this.currentLang);
            }
        }

        if (this._badgeEl) {
            this._badgeEl.innerHTML = '';
            if (typeof result.exit === 'number') {
                const ex = document.createElement('span');
                ex.style.color = result.exit === 0 ? '#6AD89A' : '#FF7A6A';
                ex.textContent = i18n.t('runner.exit_code', { code: result.exit });
                this._badgeEl.appendChild(ex);
            }
            if (typeof result.ms === 'number') {
                if (this._badgeEl.children.length) {
                    const sep = document.createElement('span');
                    sep.style.color = '#444';
                    sep.textContent = '•';
                    this._badgeEl.appendChild(sep);
                }
                const t = document.createElement('span');
                t.textContent = i18n.t('runner.elapsed_ms', { ms: result.ms });
                this._badgeEl.appendChild(t);
            }
        }
    }

    replaceContent(newCode) {
        if (!this.editor) return;
        this.editor.setValue(newCode);
        this.editor.updateOptions({ readOnly: false });
        setTimeout(() => { if (this.editor) this.editor.focus(); }, 200);

        const flash = document.createElement('div');
        flash.style.cssText = 'position:absolute;inset:0;background:rgba(0,200,100,0.12);pointer-events:none;transition:opacity 0.6s ease-out;z-index:10';
        this.overlay.appendChild(flash);
        requestAnimationFrame(() => { flash.style.opacity = '0'; });
        setTimeout(() => flash.remove(), 650);
    }

    // shows a before/after diff preview and waits for user to confirm or cancel
    // returns a promise that resolves to true (confirmed) or false (cancelled)
    showPatchPreview(originalText, newText, rationale) {
        return new Promise((resolve) => {
            const panel = document.createElement('div');
            panel.style.cssText = `
                position:absolute;inset:0;z-index:100;background:rgba(20,16,12,0.97);
                display:flex;flex-direction:column;font-family:'Courier New',monospace;font-size:12px;
            `;

            // header
            const header = document.createElement('div');
            header.style.cssText = 'padding:12px 16px;border-bottom:1px solid #333;color:#B8A88C;';
            header.innerHTML = `<strong style="color:#6AD89A">${i18n.t('apply_fix.preview_title')}</strong>
                <span style="color:#666;margin-left:12px">${rationale || ''}</span>`;
            panel.appendChild(header);

            // diff area
            const diffWrap = document.createElement('div');
            diffWrap.style.cssText = 'display:flex;flex:1;overflow:hidden;';

            const makePane = (label, code, color) => {
                const wrap = document.createElement('div');
                wrap.style.cssText = `flex:1;display:flex;flex-direction:column;border-right:1px solid #222;overflow:hidden;`;
                const lbl = document.createElement('div');
                lbl.style.cssText = `padding:6px 12px;background:#1a1612;color:${color};font-size:11px;`;
                lbl.textContent = label;
                const pre = document.createElement('pre');
                pre.style.cssText = 'flex:1;margin:0;padding:12px;overflow:auto;color:#ccc;white-space:pre-wrap;word-break:break-all;';
                pre.textContent = code;
                wrap.appendChild(lbl);
                wrap.appendChild(pre);
                return wrap;
            };

            diffWrap.appendChild(makePane(i18n.t('apply_fix.before'), originalText, '#FF7A6A'));
            diffWrap.appendChild(makePane(i18n.t('apply_fix.after'), newText, '#6AD89A'));
            panel.appendChild(diffWrap);

            // buttons
            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'padding:12px 16px;display:flex;gap:10px;border-top:1px solid #333;';

            const makeBtn = (label, bg, fg) => {
                const b = document.createElement('button');
                b.textContent = label;
                b.style.cssText = `padding:8px 20px;background:${bg};color:${fg};border:none;border-radius:4px;font-family:'Nunito',sans-serif;font-size:13px;cursor:pointer;`;
                return b;
            };

            const confirmBtn = makeBtn(i18n.t('apply_fix.confirm'), '#6AD89A', '#1a1612');
            const cancelBtn  = makeBtn(i18n.t('apply_fix.cancel'), 'rgba(255,255,255,0.07)', '#ccc');

            confirmBtn.onclick = () => { panel.remove(); resolve(true); };
            cancelBtn.onclick  = () => { panel.remove(); resolve(false); };

            btnRow.appendChild(confirmBtn);
            btnRow.appendChild(cancelBtn);
            panel.appendChild(btnRow);

            this.overlay.appendChild(panel);
        });
    }

    close() {
        if (!this.isOpen) return;
        if (this._jsRunner) {
            this._jsRunner.stop();
            this._jsRunner = null;
        }
        if (this.editor) {
            this.editor.dispose();
            this.editor = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        this.isOpen = false;
        this._isRunning = false;
    }
}
