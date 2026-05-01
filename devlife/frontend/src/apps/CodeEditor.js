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
        topBar.appendChild(closeBtn);

        this.overlay.appendChild(topBar);

        const editorContainer = document.createElement('div');
        editorContainer.style.flex = '1';
        editorContainer.style.position = 'relative';
        this.overlay.appendChild(editorContainer);

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
    }

    _applyLangBtnStyle(btn, active) {
        btn.style.background = active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)';
        btn.style.color = active ? '#ffffff' : '#888';
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
            header.innerHTML = `<strong style="color:#6AD89A">Previzualizare modificare</strong>
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

            diffWrap.appendChild(makePane('Înainte', originalText, '#FF7A6A'));
            diffWrap.appendChild(makePane('După', newText, '#6AD89A'));
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

            const confirmBtn = makeBtn('Confirmă', '#6AD89A', '#1a1612');
            const cancelBtn  = makeBtn('Anulează', 'rgba(255,255,255,0.07)', '#ccc');

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
        if (this.editor) {
            this.editor.dispose();
            this.editor = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        this.isOpen = false;
    }
}
