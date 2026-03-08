
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
- WebSocket: ws:

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
        this._snapshotTasks = new Set();
        this.onTaskAdded = null;
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
        // stop clicks from hitting the game underneath
        this.overlay.addEventListener('click', e => e.stopPropagation());
        this.overlay.addEventListener('pointerdown', e => e.stopPropagation());

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
        title.style.color = '#e6edf3';
        title.style.fontSize = '14px';
        title.style.fontWeight = '600';
        title.textContent = 'Notes — Planning Board';

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

        const h1Btn = document.createElement('button');
        Object.assign(h1Btn.style, toolbarBtnStyle);
        h1Btn.textContent = 'H1';
        h1Btn.addEventListener('click', () => this.insertAtLineStart('# '));
        h1Btn.addEventListener('mouseenter', () => { h1Btn.style.background = '#30363d'; });
        h1Btn.addEventListener('mouseleave', () => { h1Btn.style.background = '#21262d'; });
        toolbar.appendChild(h1Btn);

        const h2Btn = document.createElement('button');
        Object.assign(h2Btn.style, toolbarBtnStyle);
        h2Btn.textContent = 'H2';
        h2Btn.addEventListener('click', () => this.insertAtLineStart('## '));
        h2Btn.addEventListener('mouseenter', () => { h2Btn.style.background = '#30363d'; });
        h2Btn.addEventListener('mouseleave', () => { h2Btn.style.background = '#21262d'; });
        toolbar.appendChild(h2Btn);

        const boldBtn = document.createElement('button');
        Object.assign(boldBtn.style, toolbarBtnStyle);
        boldBtn.textContent = 'B';
        boldBtn.addEventListener('click', () => this.wrapSelection('**'));
        boldBtn.addEventListener('mouseenter', () => { boldBtn.style.background = '#30363d'; });
        boldBtn.addEventListener('mouseleave', () => { boldBtn.style.background = '#21262d'; });
        toolbar.appendChild(boldBtn);

        // dont really need all these but looks nice
        const italicBtn = document.createElement('button');
        Object.assign(italicBtn.style, toolbarBtnStyle);
        italicBtn.textContent = 'I';
        italicBtn.addEventListener('click', () => this.wrapSelection('*'));
        italicBtn.addEventListener('mouseenter', () => { italicBtn.style.background = '#30363d'; });
        italicBtn.addEventListener('mouseleave', () => { italicBtn.style.background = '#21262d'; });
        toolbar.appendChild(italicBtn);

        const listBtn = document.createElement('button');
        Object.assign(listBtn.style, toolbarBtnStyle);
        listBtn.textContent = '\u2022 List';
        listBtn.addEventListener('click', () => this.insertAtLineStart('- '));
        listBtn.addEventListener('mouseenter', () => { listBtn.style.background = '#30363d'; });
        listBtn.addEventListener('mouseleave', () => { listBtn.style.background = '#21262d'; });
        toolbar.appendChild(listBtn);

        const olBtn = document.createElement('button');
        Object.assign(olBtn.style, toolbarBtnStyle);
        olBtn.textContent = '1. List';
        olBtn.addEventListener('click', () => this.insertAtLineStart('1. '));
        olBtn.addEventListener('mouseenter', () => { olBtn.style.background = '#30363d'; });
        olBtn.addEventListener('mouseleave', () => { olBtn.style.background = '#21262d'; });
        toolbar.appendChild(olBtn);

        const hrBtn = document.createElement('button');
        Object.assign(hrBtn.style, toolbarBtnStyle);
        hrBtn.textContent = '---';
        hrBtn.addEventListener('click', () => this.insertAtCursor('\n---\n'));
        hrBtn.addEventListener('mouseenter', () => { hrBtn.style.background = '#30363d'; });
        hrBtn.addEventListener('mouseleave', () => { hrBtn.style.background = '#21262d'; });
        toolbar.appendChild(hrBtn);

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
        closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#e6edf3'; });
        closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#888'; });
        closeBtn.addEventListener('click', () => this.close());

        topBar.appendChild(title);
        topBar.appendChild(toolbar);
        topBar.appendChild(closeBtn);
        this.overlay.appendChild(topBar);

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
        this._snapshotTasks = new Set(this._extractTasks(this.textarea.value));

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
            const placeholder = wrapper === '**' ? 'bold' : 'italic'; // only 2 options so this works
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

    _extractTasks(text) {
        return text.split('\n')
            .filter(line => /^- \[ \] .+/.test(line.trim()))
            .map(line => line.trim().replace(/^- \[ \] /, ''));
    }

    close() {
        if (!this.isOpen) return;
        if (this.textarea) {
            const newTasks = this._extractTasks(this.textarea.value)
                .filter(t => !this._snapshotTasks.has(t));
            if (newTasks.length > 0 && this.onTaskAdded) this.onTaskAdded(newTasks);
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

