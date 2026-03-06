const STARTER_CODE = `# Ghost Demo — Bug Detection
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
        Object.assign(this.overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            background: '#1e1e1e',
            zIndex: '1000',
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'auto'
        });
        document.getElementById('app-overlay-root').appendChild(this.overlay);
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt =>
            this.overlay.addEventListener(evt, e => e.stopPropagation())
        );

        const topBar = document.createElement('div');
        Object.assign(topBar.style, {
            height: '40px',
            background: '#252526',
            borderBottom: '1px solid #3c3c3c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            flexShrink: '0'
        });

        const tab = document.createElement('span');
        Object.assign(tab.style, {
            background: '#1e1e1e',
            padding: '6px 16px',
            borderTop: '2px solid #007acc',
            color: '#ffffff',
            fontSize: '13px'
        });
        tab.textContent = 'demo.py';

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

        topBar.appendChild(tab);
        topBar.appendChild(closeBtn);
        this.overlay.appendChild(topBar);

        const editorContainer = document.createElement('div');
        Object.assign(editorContainer.style, {
            flex: '1',
            position: 'relative'
        });
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
        Object.assign(flash.style, {
            position: 'absolute',
            inset: '0',
            background: 'rgba(0,200,100,0.12)',
            pointerEvents: 'none',
            transition: 'opacity 0.6s ease-out',
            zIndex: '10'
        });
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
