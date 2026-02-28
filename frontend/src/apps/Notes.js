// DevLife — Notes App (planning board overlay)
// Player walks to whiteboard → this opens.

const DEFAULT_NOTES = `# DevLife — Sprint Planning

## Current Tasks
- [ ] Fix TypeError in calculate_total()
- [ ] Add input validation for user data
- [ ] Write unit tests for API endpoints
- [ ] Optimize database queries

## Architecture Notes
- Backend: FastAPI on port 8000
- Frontend: Vite + PixiJS on port 5173
- Ghost AI: Claude API + WHOOP biometrics
- WebSocket: ws://localhost:8000/ws

## Ideas
- Particle effects when Ghost speaks
- Sound effects for state transitions
- Plant growth animation on intervention accept

## Demo Checklist
- [ ] Pre-load Python code with intentional bug
- [ ] Test all 5 mock states (keys 1-5)
- [ ] Dashboard on projector
- [ ] Practice the 3-minute script
`;

export class NotesApp {
    constructor(socket) {
        this.socket = socket;
        this.appType = 'notes';
        this.isOpen = false;
        this.overlay = null;
        this.textarea = null;
    }

    open() {
        if (this.isOpen) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'notes-overlay';
        Object.assign(this.overlay.style, {
            position: 'fixed',
            inset: '0',
            background: '#0d1117',
            zIndex: '1000',
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'auto'
        });
        document.getElementById('app-overlay-root').appendChild(this.overlay);
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt =>
            this.overlay.addEventListener(evt, e => e.stopPropagation())
        );

        // Top bar
        const topBar = document.createElement('div');
        Object.assign(topBar.style, {
            height: '44px',
            background: '#161b22',
            borderBottom: '1px solid #30363d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            flexShrink: '0'
        });

        const title = document.createElement('span');
        Object.assign(title.style, { color: '#e6edf3', fontSize: '14px', fontWeight: '600' });
        title.textContent = 'Notes — Planning Board';

        // Toolbar
        const toolbar = document.createElement('div');
        Object.assign(toolbar.style, { display: 'flex', gap: '4px' });

        const toolbarBtnStyle = {
            background: '#21262d',
            color: '#e6edf3',
            border: '1px solid #30363d',
            borderRadius: '6px',
            padding: '4px 12px',
            fontSize: '12px',
            cursor: 'pointer'
        };

        const buttons = [
            { label: 'H1', action: () => this.insertAtLineStart('# ') },
            { label: 'H2', action: () => this.insertAtLineStart('## ') },
            { label: 'B', action: () => this.wrapSelection('**') },
            { label: 'I', action: () => this.wrapSelection('*') },
            { label: '\u2022 List', action: () => this.insertAtLineStart('- ') },
            { label: '1. List', action: () => this.insertAtLineStart('1. ') },
            { label: '---', action: () => this.insertAtCursor('\n---\n') }
        ];

        buttons.forEach(({ label, action }) => {
            const btn = document.createElement('button');
            Object.assign(btn.style, toolbarBtnStyle);
            btn.textContent = label;
            btn.addEventListener('mouseenter', () => { btn.style.background = '#30363d'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = '#21262d'; });
            btn.addEventListener('click', action);
            toolbar.appendChild(btn);
        });

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
        topBar.appendChild(toolbar);
        topBar.appendChild(closeBtn);
        this.overlay.appendChild(topBar);

        // Textarea
        this.textarea = document.createElement('textarea');
        Object.assign(this.textarea.style, {
            flex: '1',
            width: '100%',
            background: '#0d1117',
            color: '#e6edf3',
            border: 'none',
            outline: 'none',
            resize: 'none',
            padding: '24px 32px',
            fontSize: '15px',
            lineHeight: '1.7',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace"
        });

        const saved = localStorage.getItem('devlife-notes');
        this.textarea.value = saved || DEFAULT_NOTES;

        this.textarea.addEventListener('input', () => {
            this.socket.sendContentUpdate(this.appType, this.textarea.value, {});
        });

        this.overlay.appendChild(this.textarea);
        this.textarea.focus();
        this.isOpen = true;
    }

    insertAtLineStart(prefix) {
        if (!this.textarea) return;
        const start = this.textarea.selectionStart;
        const val = this.textarea.value;
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        this.textarea.value = val.slice(0, lineStart) + prefix + val.slice(lineStart);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + prefix.length;
        this.textarea.focus();
    }

    wrapSelection(wrapper) {
        if (!this.textarea) return;
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const val = this.textarea.value;
        if (start === end) {
            const placeholder = wrapper === '**' ? 'bold' : 'italic';
            const insert = wrapper + placeholder + wrapper;
            this.textarea.value = val.slice(0, start) + insert + val.slice(end);
            this.textarea.selectionStart = start + wrapper.length;
            this.textarea.selectionEnd = start + wrapper.length + placeholder.length;
        } else {
            const selected = val.slice(start, end);
            this.textarea.value = val.slice(0, start) + wrapper + selected + wrapper + val.slice(end);
            this.textarea.selectionStart = start + wrapper.length;
            this.textarea.selectionEnd = end + wrapper.length;
        }
        this.textarea.focus();
    }

    insertAtCursor(text) {
        if (!this.textarea) return;
        const start = this.textarea.selectionStart;
        const val = this.textarea.value;
        this.textarea.value = val.slice(0, start) + text + val.slice(start);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + text.length;
        this.textarea.focus();
    }

    close() {
        if (!this.isOpen) return;
        if (this.textarea) {
            localStorage.setItem('devlife-notes', this.textarea.value);
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        this.textarea = null;
        this.isOpen = false;
    }
}
