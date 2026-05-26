import { i18n } from '../i18n/index.js';
import { JsRunner } from './runners/JsRunner.js';
import { PythonRunner } from './runners/PythonRunner.js';
import { CppRunner } from './runners/CppRunner.js';
import { initMonaco } from './monaco/monacoSetup.js';
import { FileTree } from './ide/FileTree.js';
import { registerInlineCompletions } from './ide/inlineCompletions.js';
import { LspManager } from './ide/languageClient.js';
import { readFile, writeFile, createPath } from '../network/files.js';
import { getWorkspaceRoot, getFeatures, privilegedWsUrl, authHeaders } from '../network/session.js';
import { CONFIG } from '../config.js';

// Seeded into an empty workspace so the editor (and the ghost bug-detection demo) has
// something to open on first run.
const WELCOME_FILES = {
    'welcome.py': `# Welcome to the DevLife IDE — these are REAL files on your machine.
# Edit, save with Cmd/Ctrl+S, run with Cmd/Ctrl+Enter (or the Run button).
# The ghost watches as you code and can Apply Fixes to runtime errors.

def calculate_total(items):
    total = 0
    for item in items:
        total += item.price
    return total

# Try running: print(calculate_total(None))
# The ghost will detect the TypeError and offer a fix.
`,
    'welcome.cpp': `// C++ runs in-browser via JSCPP, a pure-JS C++ interpreter.
// Supported headers: <iostream>, <cmath>, <cstdio>, <cstdlib>, <cstring>, <ctime>, <iomanip>, <cctype>
// NOT supported: <vector>, <string>, <map>, <algorithm>, full STL — use C arrays + cstring instead.
//
// Cmd/Ctrl+Enter to run, Cmd/Ctrl+S to save. stdin goes in the bottom-left tab.
#include <iostream>
using namespace std;

int main() {
    int nums[] = {3, 1, 4, 1, 5, 9, 2, 6};
    int n = sizeof(nums) / sizeof(nums[0]);
    int sum = 0;
    for (int i = 0; i < n; i++) sum += nums[i];
    cout << "sum = " << sum << endl;

    // try a runtime error to see the ghost react:
    // int* p = 0;  *p = 1;
    return 0;
}
`,
    'welcome.js': `// JavaScript runs in a Web Worker. console.log -> stdout, console.error -> stderr.
// Cmd/Ctrl+Enter to run, Cmd/Ctrl+S to save. Top-level await is supported.

const nums = [3, 1, 4, 1, 5, 9, 2, 6];
const sum = nums.reduce((a, b) => a + b, 0);
console.log('sum =', sum);

// uncomment to see how the ghost reacts to a runtime error:
// null.foo;
`,
};

const RUNNABLE = new Set(['python', 'javascript', 'cpp', 'c']);

export class CodeEditorApp {
    constructor(socket) {
        this.socket = socket;
        this.appType = 'code';
        this.capturesKeyboard = true; // a focused editor needs all keys (Cmd+S, etc.)
        this.isOpen = false;
        this.overlay = null;
        this.editor = null;
        this._monaco = null;
        this.currentLang = 'python';
        // open files
        this.models = new Map();   // path -> { model, language }
        this.tabs = [];            // ordered open paths
        this.activePath = null;
        this.dirty = new Set();
        this.fileTree = null;
        this.lsp = null;
        this._tabBar = null;
        this._stateBadge = null;
        this._bioState = null;
        this._watchWs = null;
        this._watchTimer = null;
        this._contentListener = null;
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
        this.isOpen = true;

        this.overlay = document.createElement('div');
        this.overlay.id = 'code-editor-overlay';
        this.overlay.style.cssText = `position:fixed;inset:0;background:#1e1e1e;z-index:1000;
            display:flex;flex-direction:column;pointer-events:auto;`;
        document.getElementById('app-overlay-root').appendChild(this.overlay);
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt =>
            this.overlay.addEventListener(evt, e => e.stopPropagation())
        );

        // top bar: tab strip (left) + actions (right)
        const topBar = document.createElement('div');
        topBar.style.cssText = `height:40px;background:#252526;border-bottom:1px solid #3c3c3c;
            display:flex;align-items:center;justify-content:space-between;padding:0 12px;flex-shrink:0;`;

        this._tabBar = document.createElement('div');
        this._tabBar.style.cssText = 'display:flex;align-items:center;gap:2px;overflow:hidden;flex:1;';
        topBar.appendChild(this._tabBar);

        const rightGroup = document.createElement('div');
        rightGroup.style.cssText = 'display:flex;align-items:center;gap:10px;flex-shrink:0;';

        // biometric Cursor: shows the cognitive state that inline AI completions are tuned to
        const stateBadge = document.createElement('span');
        stateBadge.title = i18n.t('editor.state_badge_tooltip');
        stateBadge.style.cssText = "font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;color:#9a9a9a;letter-spacing:0.3px;";
        stateBadge.textContent = i18n.t('editor.state_badge_empty');
        this._stateBadge = stateBadge;
        rightGroup.appendChild(stateBadge);
        if (this._bioState) this.setBiometricState(this._bioState);

        const reviewOnly = document.createElement('span');
        reviewOnly.style.cssText = 'color:#777;font-family:"Nunito",sans-serif;font-size:11px;display:none;';
        reviewOnly.textContent = i18n.t('runner.review_only_hint');
        this._reviewOnlyEl = reviewOnly;
        rightGroup.appendChild(reviewOnly);

        const runBtn = document.createElement('button');
        runBtn.style.cssText = "display:flex;align-items:center;gap:5px;height:24px;padding:0 10px;background:#0e7a3c;color:#fff;border:none;border-radius:3px;font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:0.5px;";
        runBtn.innerHTML = `<span style="font-size:9px;">▶</span><span>${i18n.t('runner.run')}</span>`;
        runBtn.addEventListener('mouseenter', () => { runBtn.style.background = '#0fa551'; });
        runBtn.addEventListener('mouseleave', () => { runBtn.style.background = '#0e7a3c'; });
        runBtn.addEventListener('click', () => this.runCode());
        this._runBtn = runBtn;
        rightGroup.appendChild(runBtn);

        const stopBtn = document.createElement('button');
        stopBtn.style.cssText = "display:none;align-items:center;gap:5px;height:24px;padding:0 10px;background:#7a1e1e;color:#fff;border:none;border-radius:3px;font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:0.5px;";
        stopBtn.innerHTML = `<span style="font-size:9px;">■</span><span>${i18n.t('runner.stop')}</span>`;
        stopBtn.addEventListener('mouseenter', () => { stopBtn.style.background = '#a52828'; });
        stopBtn.addEventListener('mouseleave', () => { stopBtn.style.background = '#7a1e1e'; });
        stopBtn.addEventListener('click', () => this.stopRun());
        this._stopBtn = stopBtn;
        rightGroup.appendChild(stopBtn);

        const saveBtn = document.createElement('button');
        saveBtn.style.cssText = "height:24px;padding:0 10px;background:rgba(255,255,255,0.08);color:#ddd;border:none;border-radius:3px;font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;cursor:pointer;transition:background 0.18s ease, color 0.18s ease;";
        saveBtn.textContent = i18n.t('editor.save');
        saveBtn.addEventListener('click', () => this.saveActive());
        this._saveBtn = saveBtn;
        rightGroup.appendChild(saveBtn);

        // "Open in full VS Code" (code-server) — power editing; local-only, feature-flagged
        if (getFeatures().code_server) {
            const vscodeBtn = document.createElement('button');
            vscodeBtn.style.cssText = "height:24px;padding:0 10px;background:#0e639c;color:#fff;border:none;border-radius:3px;font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;cursor:pointer;";
            vscodeBtn.textContent = i18n.t('editor.open_vscode');
            vscodeBtn.title = i18n.t('editor.open_vscode_tooltip');
            vscodeBtn.addEventListener('click', () => this.openVsCode(vscodeBtn));
            rightGroup.appendChild(vscodeBtn);
        }

        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'background:transparent;color:#888;font-size:13px;border:none;cursor:pointer;padding:4px 8px;';
        closeBtn.textContent = i18n.t('editor.close');
        closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#fff'; });
        closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#888'; });
        // route through main.js so the game state (pointer-events, activeApp, HUD) is restored
        closeBtn.addEventListener('click', () => (this.onClose ? this.onClose() : this.close()));
        rightGroup.appendChild(closeBtn);

        topBar.appendChild(rightGroup);
        this.overlay.appendChild(topBar);

        // main row: file tree + editor
        const mainRow = document.createElement('div');
        mainRow.style.cssText = 'flex:1;display:flex;min-height:0;';
        this.overlay.appendChild(mainRow);

        const filesEnabled = getFeatures().files;

        this.fileTree = new FileTree((path) => this.openFile(path));
        if (filesEnabled) mainRow.appendChild(this.fileTree.el);

        const editorContainer = document.createElement('div');
        editorContainer.style.cssText = 'flex:1;position:relative;min-width:0;';
        mainRow.appendChild(editorContainer);

        this._outputPanel = this._buildOutputPanel();
        this.overlay.appendChild(this._outputPanel);

        this._setRunButtonVisibility(this.currentLang);

        // bundled Monaco — synchronous, no CDN
        const monaco = initMonaco();
        this._monaco = monaco;
        registerInlineCompletions(monaco); // Cursor-style ghost text (once)
        this.lsp = new LspManager(monaco);
        this.lsp.registerProviders(); // pyright/tsserver completion + hover + diagnostics
        this.createEditor(monaco, editorContainer);

        if (filesEnabled) {
            this._bootstrapWorkspace();
            this._connectWatch();
        } else {
            // deployed / no local file API: fall back to an in-memory demo buffer so the
            // editor still works (Run via Pyodide, ghost interventions, Apply Fix).
            this._openScratch();
        }
    }

    _openScratch() {
        const monaco = this._monaco;
        const path = 'demo.py';
        const model = monaco.editor.createModel(WELCOME_FILES['welcome.py'], 'python');
        this.models.set(path, { model, language: 'python', scratch: true });
        this.tabs.push(path);
        this._switchTo(path);
    }

    createEditor(monaco, container) {
        this.editor = monaco.editor.create(container, {
            value: '',
            language: 'python',
            theme: 'vs-dark',
            fontSize: 14,
            lineNumbers: 'on',
            minimap: { enabled: true },
            automaticLayout: true,
            wordWrap: 'on',
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            inlineSuggest: { enabled: true },
        });

        this._contentListener = this.editor.onDidChangeModelContent(() => {
            if (!this.isOpen || !this.activePath) return;
            this.dirty.add(this.activePath);
            this._renderTabs();
            const position = this.editor.getPosition();
            this.socket.sendContentUpdate(this.appType, this.editor.getValue(), {
                language: this.currentLang,
                cursor_line: position ? position.lineNumber : 1,
            });
            if (this.lsp) this.lsp.onModelChange(this.editor.getModel());
        });

        this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => this.saveActive());
        this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            if (this._canRunCurrentLang() && !this._isRunning) this.runCode();
        });
        this.editor.focus();
    }

    async _bootstrapWorkspace() {
        // seed an empty workspace, then open the first file
        try {
            const { listDir } = await import('../network/files.js');
            const root = await listDir('');
            // self-heal: seed any welcome file that's missing (not only when the workspace is
            // empty), so the JS/Python/C++ demo files are always present. Never clobbers edits.
            const existing = new Set(root.entries.map(e => e.path.split('/').pop()));
            for (const [name, content] of Object.entries(WELCOME_FILES)) {
                if (!existing.has(name)) await writeFile(name, content);
            }
            await this.fileTree.mount();
            const first = (await listDir('')).entries.find(e => e.type === 'file');
            if (first) this.openFile(first.path);
            else this._showPlaceholder(i18n.t('editor.placeholder_open_create'));
        } catch (e) {
            this._showPlaceholder(i18n.t('editor.workspace_unreachable'));
        }
    }

    _absUri(path) {
        const root = getWorkspaceRoot();
        const full = root ? `${root}/${path}` : path;
        return this._monaco.Uri.file(full);
    }

    async openFile(path) {
        if (this.models.has(path)) { this._switchTo(path); return; }
        let data;
        try { data = await readFile(path); }
        catch (e) { this._showToastLikeError(i18n.t('editor.cannot_open', { path, msg: e.message })); return; }

        const uri = this._absUri(path);
        let model = this._monaco.editor.getModel(uri);
        if (!model) model = this._monaco.editor.createModel(data.content, data.language, uri);
        this.models.set(path, { model, language: data.language });
        if (!this.tabs.includes(path)) this.tabs.push(path);
        this._switchTo(path);
        if (this.lsp) this.lsp.onModelOpen(model);
    }

    _switchTo(path) {
        const entry = this.models.get(path);
        if (!entry) return;
        this.activePath = path;
        this.currentLang = entry.language;
        this.editor.setModel(entry.model);
        if (this._placeholderEl) { this._placeholderEl.remove(); this._placeholderEl = null; }
        this._renderTabs();
        this._setRunButtonVisibility(this.currentLang);
        setTimeout(() => this.editor && this.editor.focus(), 0);
    }

    _renderTabs() {
        if (!this._tabBar) return;
        this._tabBar.innerHTML = '';
        for (const path of this.tabs) {
            const name = path.split('/').pop();
            const active = path === this.activePath;
            const tab = document.createElement('div');
            tab.style.cssText = `display:flex;align-items:center;gap:6px;padding:6px 10px;font-size:13px;cursor:pointer;
                border-top:2px solid ${active ? '#007acc' : 'transparent'};
                background:${active ? '#1e1e1e' : 'transparent'};color:${active ? '#fff' : '#9a9a9a'};`;
            const label = document.createElement('span');
            label.textContent = (this.dirty.has(path) ? '● ' : '') + name;
            tab.appendChild(label);
            const x = document.createElement('span');
            x.textContent = '✕';
            x.style.cssText = 'font-size:10px;color:#777;';
            x.addEventListener('click', (e) => { e.stopPropagation(); this._closeTab(path); });
            tab.appendChild(x);
            tab.addEventListener('click', () => this._switchTo(path));
            this._tabBar.appendChild(tab);
        }
    }

    _closeTab(path) {
        if (this.dirty.has(path)) {
            const name = path.split('/').pop();
            if (!window.confirm(i18n.t('runner.discard_changes', { name }))) return;
        }
        const entry = this.models.get(path);
        if (entry) { try { entry.model.dispose(); } catch (_) {} }
        this.models.delete(path);
        this.dirty.delete(path);
        this.tabs = this.tabs.filter(p => p !== path);
        if (this.activePath === path) {
            this.activePath = null;
            const next = this.tabs[this.tabs.length - 1];
            if (next) this._switchTo(next);
            else { this.editor.setModel(null); this._showPlaceholder(i18n.t('editor.placeholder_open_tree')); }
        }
        this._renderTabs();
    }

    async saveActive() {
        if (!this.activePath || !this.editor) return;
        const entry = this.models.get(this.activePath);
        if (entry && entry.scratch) return; // in-memory demo buffer, nothing to persist
        const btn = this._saveBtn;
        const originalText = btn ? btn.textContent : null;
        const originalBg = btn ? btn.style.background : null;
        if (btn) { btn.textContent = i18n.t('editor.saving'); btn.disabled = true; }
        try {
            await writeFile(this.activePath, this.editor.getValue());
            this.dirty.delete(this.activePath);
            this._renderTabs();
            if (btn) {
                btn.textContent = i18n.t('editor.saved');
                btn.style.background = 'rgba(106, 216, 154, 0.22)';
                btn.style.color = '#6AD89A';
                clearTimeout(this._saveFlashTimer);
                this._saveFlashTimer = setTimeout(() => {
                    if (!this._saveBtn) return;
                    this._saveBtn.textContent = originalText;
                    this._saveBtn.style.background = originalBg;
                    this._saveBtn.style.color = '#ddd';
                    this._saveBtn.disabled = false;
                }, 900);
            }
        } catch (e) {
            if (btn) {
                btn.textContent = originalText;
                btn.style.background = originalBg;
                btn.disabled = false;
            }
            this._showToastLikeError(i18n.t('editor.save_failed', { msg: e.message }));
        }
    }

    _showPlaceholder(text) {
        // shown when no file/model is active — a centred message over the empty editor
        if (this.editor) this.editor.setModel(null);
        if (!this.overlay) return;
        if (this._placeholderEl) this._placeholderEl.remove();
        // when files are disabled (deploy / no local file API) the tree isn't in the DOM,
        // so don't reserve 220px on the left
        const leftInset = (this.fileTree && this.fileTree.el && this.fileTree.el.parentElement) ? '220px' : '0';
        const el = document.createElement('div');
        el.style.cssText = `position:absolute;inset:40px 0 180px ${leftInset};display:flex;align-items:center;
            justify-content:center;color:#666;font-family:'Nunito',sans-serif;font-size:13px;
            pointer-events:none;z-index:5;text-align:center;padding:0 24px;`;
        el.textContent = text || '';
        this.overlay.appendChild(el);
        this._placeholderEl = el;
    }

    _showToastLikeError(msg) {
        console.warn('[ide]', msg);
    }

    async openVsCode(btn) {
        const label = btn ? btn.textContent : null;
        if (btn) { btn.textContent = i18n.t('editor.starting'); btn.disabled = true; }
        try {
            const r = await fetch(CONFIG.BACKEND_URL + '/api/codeserver/start', { method: 'POST', headers: authHeaders() });
            const data = await r.json().catch(() => ({}));
            if (!r.ok || !data.url) {
                window.alert(data.hint || data.error || i18n.t('editor.codeserver_unavailable'));
                return;
            }
            this._showVsCodeOverlay(data.url);
        } catch (_) {
            window.alert(i18n.t('editor.backend_unreachable_vscode'));
        } finally {
            if (btn) { btn.textContent = label; btn.disabled = false; }
        }
    }

    _showVsCodeOverlay(url) {
        const panel = document.createElement('div');
        panel.style.cssText = 'position:absolute;inset:0;z-index:200;background:#1e1e1e;display:flex;flex-direction:column;';
        const bar = document.createElement('div');
        bar.style.cssText = 'height:32px;background:#252526;border-bottom:1px solid #3c3c3c;display:flex;align-items:center;justify-content:space-between;padding:0 12px;flex-shrink:0;';
        const title = document.createElement('span');
        title.textContent = i18n.t('editor.vscode_overlay_title');
        title.style.cssText = 'color:#9a9a9a;font-size:12px;';
        const back = document.createElement('button');
        back.textContent = i18n.t('editor.back_to_editor');
        back.style.cssText = "background:transparent;border:none;color:#9a9a9a;cursor:pointer;font-size:12px;font-family:'Nunito',sans-serif;";
        back.addEventListener('mouseenter', () => { back.style.color = '#fff'; });
        back.addEventListener('mouseleave', () => { back.style.color = '#9a9a9a'; });
        back.addEventListener('click', () => panel.remove());
        bar.appendChild(title);
        bar.appendChild(back);
        const iframe = document.createElement('iframe');
        iframe.src = url; // trusted localhost code-server; plain iframe so its workers function
        iframe.style.cssText = 'flex:1;border:none;width:100%;';
        panel.appendChild(bar);
        panel.appendChild(iframe);
        this.overlay.appendChild(panel);
    }

    // fed from main.js biometric updates — surfaces the state inline AI is tuned to
    setBiometricState(state) {
        this._bioState = state;
        if (!this._stateBadge) return;
        const colors = { RELAXED: '#6AD89A', DEEP_FOCUS: '#7FB0FF', STRESSED: '#FF7A6A', FATIGUED: '#C9A227', WIRED: '#FFB84A' };
        this._stateBadge.textContent = '🧠 ' + (state ? i18n.t('state.' + state) : '—');
        this._stateBadge.style.color = colors[state] || '#9a9a9a';
    }

    _connectWatch() {
        try {
            this._watchWs = new WebSocket(privilegedWsUrl('/files/watch'));
            this._watchWs.onmessage = () => {
                clearTimeout(this._watchTimer);
                this._watchTimer = setTimeout(() => { if (this.fileTree) this.fileTree.refresh(); }, 300);
            };
        } catch (_) { /* watch is best-effort */ }
    }

    // ---- runner (unchanged behaviour; language comes from the active file) ----

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
        return RUNNABLE.has(this.currentLang);
    }

    _setRunButtonVisibility(lang) {
        const canRun = RUNNABLE.has(lang);
        if (this._runBtn) this._runBtn.style.display = (canRun && !this._isRunning) ? 'flex' : 'none';
        if (this._stopBtn) this._stopBtn.style.display = (canRun && this._isRunning) ? 'flex' : 'none';
        if (this._reviewOnlyEl) this._reviewOnlyEl.style.display = canRun ? 'none' : 'inline';
    }

    _renderRunningState(running) {
        this._isRunning = running;
        this._setRunButtonVisibility(this.currentLang);
    }

    async runCode() {
        if (this._isRunning || !this.editor || !this._canRunCurrentLang()) return;
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
        } else if (this.currentLang === 'cpp' || this.currentLang === 'c') {
            result = await CppRunner.get().run(code, stdin);
        } else {
            result = { stdout: '', stderr: i18n.t('editor.unsupported_language', { lang: this.currentLang }), exit: 1, ms: 0 };
        }
        this.displayRunResult(result);
    }

    stopRun() {
        if (!this._isRunning) return;
        if (this.currentLang === 'javascript' && this._jsRunner) this._jsRunner.stop();
        else if (this.currentLang === 'python') PythonRunner.get().stop();
        else if (this.currentLang === 'cpp' || this.currentLang === 'c') CppRunner.get().stop();
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

        // notify Ghost about real runtime errors (skip user-stop exit 130)
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

    // ---- Apply Fix integration (called from main.js) ----

    replaceContent(newCode) {
        if (!this.editor) return;
        this.editor.setValue(newCode);
        this.editor.updateOptions({ readOnly: false });
        if (this.activePath) { this.dirty.add(this.activePath); this._renderTabs(); }
        setTimeout(() => { if (this.editor) this.editor.focus(); }, 200);

        const flash = document.createElement('div');
        flash.style.cssText = 'position:absolute;inset:0;background:rgba(0,200,100,0.12);pointer-events:none;transition:opacity 0.6s ease-out;z-index:10';
        this.overlay.appendChild(flash);
        requestAnimationFrame(() => { flash.style.opacity = '0'; });
        setTimeout(() => flash.remove(), 650);
    }

    showPatchPreview(originalText, newText, rationale) {
        return new Promise((resolve) => {
            const panel = document.createElement('div');
            panel.style.cssText = `position:absolute;inset:0;z-index:100;background:rgba(20,16,12,0.97);
                display:flex;flex-direction:column;font-family:'Courier New',monospace;font-size:12px;`;

            const header = document.createElement('div');
            header.style.cssText = 'padding:12px 16px;border-bottom:1px solid #333;color:#B8A88C;';
            header.innerHTML = `<strong style="color:#6AD89A">${i18n.t('apply_fix.preview_title')}</strong>
                <span style="color:#666;margin-left:12px">${rationale || ''}</span>`;
            panel.appendChild(header);

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

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'padding:12px 16px;display:flex;gap:10px;border-top:1px solid #333;';
            const makeBtn = (label, bg, fg) => {
                const b = document.createElement('button');
                b.textContent = label;
                b.style.cssText = `padding:8px 20px;background:${bg};color:${fg};border:none;border-radius:4px;font-family:'Nunito',sans-serif;font-size:13px;cursor:pointer;`;
                return b;
            };
            const confirmBtn = makeBtn(i18n.t('apply_fix.confirm'), '#6AD89A', '#1a1612');
            const cancelBtn = makeBtn(i18n.t('apply_fix.cancel'), 'rgba(255,255,255,0.07)', '#ccc');
            confirmBtn.onclick = () => { panel.remove(); resolve(true); };
            cancelBtn.onclick = () => { panel.remove(); resolve(false); };
            btnRow.appendChild(confirmBtn);
            btnRow.appendChild(cancelBtn);
            panel.appendChild(btnRow);

            this.overlay.appendChild(panel);
        });
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false; // set first — prevents re-entrant work during disposal
        if (this._contentListener) { try { this._contentListener.dispose(); } catch (_) {} this._contentListener = null; }
        if (this._jsRunner) { try { this._jsRunner.stop(); } catch (_) {} this._jsRunner = null; }
        if (this._watchWs) { try { this._watchWs.close(); } catch (_) {} this._watchWs = null; }
        if (this.lsp) { try { this.lsp.dispose(); } catch (_) {} this.lsp = null; }
        clearTimeout(this._watchTimer);
        clearTimeout(this._saveFlashTimer);
        if (this._placeholderEl) { try { this._placeholderEl.remove(); } catch (_) {} this._placeholderEl = null; }
        if (this.editor) { try { this.editor.setModel(null); } catch (_) {} } // detach before disposing models
        for (const { model } of this.models.values()) { try { model.dispose(); } catch (_) {} }
        this.models.clear();
        this.tabs = [];
        this.dirty.clear();
        this.activePath = null;
        if (this.editor) { try { this.editor.dispose(); } catch (_) {} this.editor = null; }
        if (this.overlay) { try { this.overlay.remove(); } catch (_) {} this.overlay = null; }
        this._isRunning = false;
    }
}
