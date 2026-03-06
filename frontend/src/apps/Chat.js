const STARTER_MESSAGES = {
    Team: [
        { sender: 'David', text: 'Backend deployed, Ghost is alive \u{1F916}', time: '10:30 AM', isMe: false },
        { sender: 'Matei', text: 'Room rendering looks great! Testing furniture now', time: '10:32 AM', isMe: false },
        { sender: 'David', text: 'Nice! WebSocket is ready on port 8000', time: '10:33 AM', isMe: false }
    ],
    David: [
        { sender: 'David', text: 'Hey, server is running. WebSocket at ws://localhost:8000/ws', time: '9:00 AM', isMe: false },
        { sender: 'David', text: 'Mock states 1-5 work. Try pressing the number keys', time: '9:15 AM', isMe: false }
    ],
    Matei: [
        { sender: 'Matei', text: 'Working on the isometric room, looking sick \u{1F3A8}', time: '11:00 AM', isMe: false }
    ],
    Mentor: [
        { sender: 'Mentor', text: 'How is the WHOOP integration going? Remember the demo is everything.', time: '8:00 AM', isMe: false }
    ]
};

const AUTO_REPLIES = {
    Team: ['Got it, working on it now \u{1F44D}', 'Standup at 3pm don\'t forget', 'PR looks good, merging', 'Anyone else getting a 500 on the API?', 'Nice fix! Ship it \u{1F680}'],
    David: ['Backend is running, try reconnecting', 'Check the WebSocket \u2014 I pushed a fix', 'Ghost brain is working, test with mock state 2', 'Let me know when you\'re ready to integrate'],
    Matei: ['Room rendering is done \u{1F3A8}', 'Working on Ghost sprite now', 'The atmosphere transitions look sick', 'Can you test the furniture interactions?'],
    Mentor: ['How\'s the biometric integration going?', 'Remember to handle edge cases', 'The demo flow looks great, practice the timing', 'Ship it, don\'t gold-plate it']
};

function formatTime(date) {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
}

export class ChatApp {
    constructor(socket) {
        this.socket = socket;
        this.appType = 'chat';
        this.isOpen = false;
        this.overlay = null;
        this.messages = {};
        this.currentContact = 'Team';
        this.contacts = ['Team', 'David', 'Matei', 'Mentor'];
        this.inputEl = null;
        this.messagesEl = null;
        this.contactListEl = null;
        this.headerNameEl = null;
        this.replyTimer = null;

        this.contacts.forEach(c => {
            this.messages[c] = (STARTER_MESSAGES[c] || []).map(m => ({ ...m }));
        });
    }

    open() {
        if (this.isOpen) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'chat-overlay';
        Object.assign(this.overlay.style, {
            position: 'fixed',
            inset: '0',
            background: '#111',
            zIndex: '1000',
            display: 'flex',
            pointerEvents: 'auto'
        });
        document.getElementById('app-overlay-root').appendChild(this.overlay);
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt =>
            this.overlay.addEventListener(evt, e => e.stopPropagation())
        );

        const sidebar = document.createElement('div');
        Object.assign(sidebar.style, {
            width: '240px',
            background: '#0a0a0a',
            borderRight: '1px solid #2d2d2d',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: '0'
        });

        const sidebarHeader = document.createElement('div');
        Object.assign(sidebarHeader.style, {
            padding: '16px',
            fontSize: '16px',
            fontWeight: '600',
            color: '#fff',
            borderBottom: '1px solid #2d2d2d'
        });
        sidebarHeader.textContent = 'Messages';
        sidebar.appendChild(sidebarHeader);

        this.contactListEl = document.createElement('div');
        this.contactListEl.style.flex = '1';
        this.contactListEl.style.overflowY = 'auto';
        this.contacts.forEach(name => {
            const row = document.createElement('div');
            row.dataset.contact = name;
            Object.assign(row.style, {
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderLeft: '3px solid transparent'
            });
            row.addEventListener('mouseenter', () => {
                if (this.currentContact !== name) row.style.background = '#1a1a2e';
            });
            row.addEventListener('mouseleave', () => {
                if (this.currentContact !== name) row.style.background = 'transparent';
            });
            row.addEventListener('click', () => this.switchContact(name));

            const dot = document.createElement('span');
            Object.assign(dot.style, {
                width: '8px',
                height: '8px',
                background: '#00C864',
                borderRadius: '50%',
                flexShrink: '0'
            });

            const info = document.createElement('div');
            info.style.minWidth = '0';

            const nameEl = document.createElement('div');
            nameEl.style.color = '#fff';
            nameEl.style.fontSize = '14px';
            nameEl.style.fontWeight = '500';
            nameEl.textContent = name;

            const preview = document.createElement('div');
            Object.assign(preview.style, {
                color: '#888',
                fontSize: '12px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            });
            const msgs = this.messages[name];
            preview.textContent = msgs.length > 0 ? msgs[msgs.length - 1].text : '';

            info.appendChild(nameEl);
            info.appendChild(preview);
            row.appendChild(dot);
            row.appendChild(info);
            this.contactListEl.appendChild(row);
        });
        sidebar.appendChild(this.contactListEl);
        this.overlay.appendChild(sidebar);

        const panel = document.createElement('div');
        Object.assign(panel.style, {
            flex: '1',
            display: 'flex',
            flexDirection: 'column',
            minWidth: '0'
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            height: '52px',
            background: '#0a0a0a',
            borderBottom: '1px solid #2d2d2d',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: '0'
        });

        const headerLeft = document.createElement('div');
        this.headerNameEl = document.createElement('span');
        Object.assign(this.headerNameEl.style, { fontWeight: '600', color: '#fff', fontSize: '15px' });
        this.headerNameEl.textContent = this.currentContact;
        const onlineEl = document.createElement('span');
        Object.assign(onlineEl.style, { color: '#00C864', fontSize: '12px', marginLeft: '8px' });
        onlineEl.textContent = 'Online';
        headerLeft.appendChild(this.headerNameEl);
        headerLeft.appendChild(onlineEl);

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

        header.appendChild(headerLeft);
        header.appendChild(closeBtn);
        panel.appendChild(header);

        this.messagesEl = document.createElement('div');
        Object.assign(this.messagesEl.style, {
            flex: '1',
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        });
        panel.appendChild(this.messagesEl);

        const inputBar = document.createElement('div');
        Object.assign(inputBar.style, {
            background: '#0a0a0a',
            borderTop: '1px solid #2d2d2d',
            padding: '12px 16px',
            display: 'flex',
            gap: '8px',
            flexShrink: '0'
        });

        this.inputEl = document.createElement('input');
        this.inputEl.type = 'text';
        this.inputEl.placeholder = 'Type a message...';
        Object.assign(this.inputEl.style, {
            flex: '1',
            background: '#2d2d2d',
            border: 'none',
            borderRadius: '20px',
            padding: '8px 16px',
            color: '#fff',
            outline: 'none',
            fontSize: '14px'
        });

        const sendBtn = document.createElement('button');
        Object.assign(sendBtn.style, {
            background: '#0096FF',
            border: 'none',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            flexShrink: '0'
        });
        sendBtn.textContent = '\u2191';

        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage(this.inputEl.value);
                this.inputEl.value = '';
            }
        });
        sendBtn.addEventListener('click', () => {
            this.sendMessage(this.inputEl.value);
            this.inputEl.value = '';
        });

        inputBar.appendChild(this.inputEl);
        inputBar.appendChild(sendBtn);
        panel.appendChild(inputBar);
        this.overlay.appendChild(panel);

        this.renderMessages();
        this.updateContactStyles();
        this.inputEl.focus();
        this.isOpen = true;
    }

    switchContact(name) {
        this.currentContact = name;
        this.headerNameEl.textContent = name;
        this.renderMessages();
        this.updateContactStyles();
    }

    updateContactStyles() {
        if (!this.contactListEl) return;
        this.contactListEl.querySelectorAll('[data-contact]').forEach(row => {
            const isActive = row.dataset.contact === this.currentContact;
            row.style.background = isActive ? '#1a1a2e' : 'transparent';
            row.style.borderLeftColor = isActive ? '#0096FF' : 'transparent';
        });
    }

    sendMessage(text) {
        if (text.trim() === '') return;
        this.messages[this.currentContact].push({
            sender: 'You',
            text: text,
            time: formatTime(new Date()),
            isMe: true
        });
        this.renderMessages();
        this.socket.sendContentUpdate(this.appType, this.getAllMessagesText(), {});
        this.scrollToBottom();

        const delay = 2000 + Math.random() * 2000;
        this.replyTimer = setTimeout(() => this.addAutoReply(), delay);
    }

    addAutoReply() {
        const replies = AUTO_REPLIES[this.currentContact] || AUTO_REPLIES['Team'];
        const reply = replies[Math.floor(Math.random() * replies.length)];
        this.messages[this.currentContact].push({
            sender: this.currentContact,
            text: reply,
            time: formatTime(new Date()),
            isMe: false
        });
        this.renderMessages();
        this.scrollToBottom();
        this.updatePreview(this.currentContact);
    }

    updatePreview(contact) {
        if (!this.contactListEl) return;
        const row = this.contactListEl.querySelector(`[data-contact="${contact}"]`);
        if (row) {
            const preview = row.querySelector('div > div:last-child');
            const msgs = this.messages[contact];
            if (preview && msgs.length > 0) {
                preview.textContent = msgs[msgs.length - 1].text;
            }
        }
    }

    renderMessages() {
        if (!this.messagesEl) return;
        this.messagesEl.innerHTML = '';
        const msgs = this.messages[this.currentContact] || [];
        msgs.forEach(msg => {
            const wrapper = document.createElement('div');
            Object.assign(wrapper.style, {
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.isMe ? 'flex-end' : 'flex-start'
            });

            if (!msg.isMe) {
                const senderEl = document.createElement('div');
                Object.assign(senderEl.style, { color: '#888', fontSize: '11px', marginBottom: '2px', marginLeft: '4px' });
                senderEl.textContent = msg.sender;
                wrapper.appendChild(senderEl);
            }

            const bubble = document.createElement('div');
            Object.assign(bubble.style, {
                background: msg.isMe ? '#0096FF' : '#2d2d3d',
                color: msg.isMe ? '#fff' : '#e0e0e0',
                borderRadius: msg.isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                maxWidth: '70%',
                padding: '10px 14px',
                fontSize: '14px',
                lineHeight: '1.4',
                wordBreak: 'break-word'
            });
            bubble.textContent = msg.text;

            const timeEl = document.createElement('div');
            Object.assign(timeEl.style, { color: '#666', fontSize: '10px', marginTop: '2px', marginLeft: '4px', marginRight: '4px' });
            timeEl.textContent = msg.time;

            wrapper.appendChild(bubble);
            wrapper.appendChild(timeEl);
            this.messagesEl.appendChild(wrapper);
        });
        this.scrollToBottom();
    }

    scrollToBottom() {
        if (this.messagesEl) {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
    }

    getAllMessagesText() {
        let text = '';
        this.contacts.forEach(contact => {
            (this.messages[contact] || []).forEach(msg => {
                text += `[${contact}] ${msg.sender}: ${msg.text}\n`;
            });
        });
        return text;
    }

    close() {
        if (!this.isOpen) return;
        if (this.replyTimer) clearTimeout(this.replyTimer);
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        this.inputEl = null;
        this.messagesEl = null;
        this.contactListEl = null;
        this.headerNameEl = null;
        this.isOpen = false;
    }
}
