const STARTER_CODE = `# Ghost Demo -- Bug Detection
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
`;

export class CodeEditorApp {
    constructor(socket) {
        this.socket = socket;
        this.appType = 'code';
        this.isOpen = false;
        this.overlay = null;
        this.editor = null;
        this.monacoLoaded = false;
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

        const tab = document.createElement('span');
        tab.style.background = '#1e1e1e';
        tab.style.padding = '6px 16px';
        tab.style.borderTop = '2px solid #007acc';
        tab.style.color = '#ffffff';
        tab.style.fontSize = '13px';
        tab.textContent = 'demo.py';

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

        topBar.appendChild(tab);
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
                    this.createEditor(monaco, editorContainer);
                });
            };
            document.head.appendChild(script);
        } else {
            require(['vs/editor/editor.main'], (monaco) => {
                this.createEditor(monaco, editorContainer);
            });
        }

        this.isOpen = true;
    }

    createEditor(monaco, container) {
        this.editor = monaco.editor.create(container, {
            value: STARTER_CODE,
            language: 'python',
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
                language: 'python',
                cursor_line: position ? position.lineNumber : 1
            });
        });

        this.editor.focus();
    }

    replaceContent(newCode) {
        if (!this.editor) return;
        this.editor.setValue(newCode);
        this.editor.updateOptions({ readOnly: false });
        setTimeout(() => {
            if (this.editor) this.editor.focus();
        }, 200);

        const flash = document.createElement('div');
        flash.style.position = 'absolute';
        flash.style.inset = '0';
        flash.style.background = 'rgba(0,200,100,0.12)';
        flash.style.pointerEvents = 'none';
        flash.style.transition = 'opacity 0.6s ease-out';
        flash.style.zIndex = '10';
        this.overlay.appendChild(flash);
        requestAnimationFrame(() => { flash.style.opacity = '0'; });
        setTimeout(() => flash.remove(), 650);
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
