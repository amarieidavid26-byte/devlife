
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
    Manager: [
        { sender: 'Manager', text: 'How is the WHOOP integration going? Remember the demo is everything.', time: '8:00 AM', isMe: false }
    ]
};

const AUTO_REPLIES = {
    Team: ['Got it, working on it now \u{1F44D}', 'Standup at 3pm don\'t forget', 'PR looks good, merging', 'Anyone else getting a 500 on the API?', 'Nice fix! Ship it \u{1F680}'],
    David: ['Backend is running, try reconnecting', 'Check the WebSocket \u2014 I pushed a fix', 'Ghost brain is working, test with mock state 2', 'Let me know when you\'re ready to integrate'],
    Matei: ['Room rendering is done \u{1F3A8}', 'Working on Ghost sprite now', 'The atmosphere transitions look sick', 'Can you test the furniture interactions?'],
    Manager: ['How\'s the biometric integration going?', 'Remember to handle edge cases', 'The demo flow looks great, practice the timing', 'Ship it, don\'t gold-plate it']
};

function formatTime(date) {
    // 12hr format cause military time is weird
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
        this.currentContact = 'Manager';
        this.contacts = ['Manager', 'Team', 'David', 'Matei'];
        this.inputEl = null;
        this.messagesEl = null;
        this.contactListEl = null;
        this.headerNameEl = null;
        this.replyTimer = null;
        this.unread = {};
        this.onNewMessage = null;

        this.contacts.forEach(c => {
            this.messages[c] = (STARTER_MESSAGES[c] || []).map(m => ({ ...m }));
            this.unread[c] = 0;
        });
    }

    open() {
        if (this.isOpen) return;

        if (!document.getElementById('chat-typing-styles')) {
            const style = document.createElement('style');
            style.id = 'chat-typing-styles';
            style.textContent = `
                @keyframes typing-bounce {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
                    30% { transform: translateY(-5px); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

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
        // stop clicks from hitting the game underneath
        this.overlay.addEventListener('click', e => e.stopPropagation());
        this.overlay.addEventListener('pointerdown', e => e.stopPropagation());

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
        sidebarHeader.style.padding = '16px';
        sidebarHeader.style.fontSize = '16px';
        sidebarHeader.style.fontWeight = '600';
        sidebarHeader.style.color = '#fff';
        sidebarHeader.style.borderBottom = '1px solid #2d2d2d';
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

            const badge = document.createElement('span');
            badge.dataset.badge = name;
            Object.assign(badge.style, {
                marginLeft: 'auto',
                background: '#ff3333',
                color: '#fff',
                fontSize: '11px',
                fontWeight: '700',
                borderRadius: '10px',
                padding: '1px 6px',
                minWidth: '18px',
                textAlign: 'center',
                display: this.unread[name] > 0 ? 'inline-block' : 'none',
                flexShrink: '0'
            });
            badge.textContent = this.unread[name] || '';

            info.appendChild(nameEl);
            info.appendChild(preview);
            row.appendChild(dot);
            row.appendChild(info);
            row.appendChild(badge);
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
        this.headerNameEl.style.fontWeight = '600';
        this.headerNameEl.style.color = '#fff';
        this.headerNameEl.style.fontSize = '15px';
        this.headerNameEl.textContent = this.currentContact;
        const onlineEl = document.createElement('span');
        onlineEl.style.color = '#00C864';
        onlineEl.style.fontSize = '12px';
        onlineEl.style.marginLeft = '8px';
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
        this.unread[name] = 0;
        this._updateBadge(name);
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
        this._showTyping();
        this.scrollToBottom();

        const contactSnapshot = this.currentContact;
        const delay = 2000 + Math.random() * 2000;
        this.replyTimer = setTimeout(() => this.addAutoReply(contactSnapshot), delay);
    }

    addAutoReply(contact) {
        this._hideTyping();
        const replies = AUTO_REPLIES[contact] || AUTO_REPLIES['Team'];
        const reply = replies[Math.floor(Math.random() * replies.length)];
        this.messages[contact].push({
            sender: contact,
            text: reply,
            time: formatTime(new Date()),
            isMe: false
        });
        if (contact === this.currentContact) {
            this.renderMessages();
            this.scrollToBottom();
        } else {
            this.unread[contact] = (this.unread[contact] || 0) + 1;
            this._updateBadge(contact);
        }
        if (!this.isOpen && this.onNewMessage) this.onNewMessage();
        this.updatePreview(contact);
    }

    receiveMessage(contact, text) {
        this.messages[contact].push({
            sender: contact,
            text,
            time: formatTime(new Date()),
            isMe: false
        });
        if (this.isOpen && contact === this.currentContact) {
            this.renderMessages();
            this.scrollToBottom();
        } else {
            this.unread[contact] = (this.unread[contact] || 0) + 1;
            if (this.isOpen) this._updateBadge(contact);
        }
        if (!this.isOpen && this.onNewMessage) this.onNewMessage();
        this.updatePreview(contact);
    }

    _updateBadge(contact) {
        if (!this.contactListEl) return;
        const badge = this.contactListEl.querySelector(`[data-badge="${contact}"]`);
        if (!badge) return;
        const count = this.unread[contact] || 0;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    _showTyping() {
        this._hideTyping();
        const wrapper = document.createElement('div');
        wrapper.id = 'chat-typing-indicator';
        Object.assign(wrapper.style, {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start'
        });

        const senderEl = document.createElement('div');
        Object.assign(senderEl.style, { color: '#888', fontSize: '11px', marginBottom: '2px', marginLeft: '4px' });
        senderEl.textContent = this.currentContact;

        const bubble = document.createElement('div');
        Object.assign(bubble.style, {
            background: '#2d2d3d',
            borderRadius: '16px 16px 16px 4px',
            padding: '10px 16px',
            display: 'flex',
            gap: '5px',
            alignItems: 'center'
        });

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            Object.assign(dot.style, {
                width: '7px',
                height: '7px',
                background: '#888',
                borderRadius: '50%',
                display: 'inline-block',
                animation: `typing-bounce 1.2s ease-in-out ${i * 0.2}s infinite`
            });
            bubble.appendChild(dot);
        }

        wrapper.appendChild(senderEl);
        wrapper.appendChild(bubble);
        if (this.messagesEl) {
            this.messagesEl.appendChild(wrapper);
            this.scrollToBottom();
        }
    }

    _hideTyping() {
        const el = document.getElementById('chat-typing-indicator');
        if (el) el.remove();
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
        this.messagesEl.innerHTML = ''; // prob should use removeChild but whatever
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
            timeEl.style.color = '#666';
            timeEl.style.fontSize = '10px';
            timeEl.style.marginTop = '2px';
            timeEl.style.marginLeft = '4px';
            timeEl.style.marginRight = '4px';
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

    // just dumps everything, formatting doesnt matter much
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
