// DevLife — Ghost WebSocket Client
// The ONLY networking code in the entire frontend.

export class GhostSocket {
    constructor(url = 'ws://localhost:8000/ws') {
        this.url = url;
        this.ws = null;
        this.listeners = new Map();
        this.contentTimer = null;
        this.reconnectTimer = null;
        this.isConnected = false;
        this.connect();
    }

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            this.isConnected = true;
            console.log('🔌 Connected to Ghost backend');
            this.emit('connected', {});
        };

        this.ws.onclose = () => {
            this.isConnected = false;
            console.log('🔌 Disconnected');
            this.emit('disconnected', {});
            this.reconnect();
        };

        this.ws.onerror = (err) => {
            console.error('WebSocket error:', err);
        };

        this.ws.onmessage = (event) => {
            this.handleMessage(event.data);
        };
    }

    handleMessage(rawData) {
        const msg = JSON.parse(rawData);
        switch (msg.type) {
            case 'intervention':
                this.emit('intervention', msg);
                break;
            case 'biometric_update':
                this.emit('biometric_update', msg);
                break;
            case 'state_change':
                this.emit('state_change', msg);
                break;
            case 'connection_established':
                this.emit('connected', msg);
                break;
            default:
                console.warn('Unknown message type:', msg.type);
        }
    }

    reconnect() {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            console.log('🔄 Reconnecting...');
            this.connect();
        }, 3000);
    }

    on(event, callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) this.listeners.get(event).delete(callback);
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(data));
        }
    }

    sendContentUpdate(appType, content, metadata = {}) {
        clearTimeout(this.contentTimer);
        this.contentTimer = setTimeout(() => {
            this.send({
                type: 'content_update',
                app_type: appType,
                content: content,
                ...metadata,
                timestamp: new Date().toISOString()
            });
        }, 3000);
    }

    sendFeedback(action) {
        this.send({
            type: 'feedback',
            action: action,
            timestamp: new Date().toISOString()
        });
    }

    sendMockState(stateNumber) {
        this.send({ type: 'mock_state', state: stateNumber });
    }

    sendAppFocus(appType) {
        this.send({
            type: 'app_focus',
            app_type: appType,
            timestamp: new Date().toISOString()
        });
    }

    send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        } else {
            console.warn('WebSocket not connected, message dropped:', obj.type);
        }
    }
}

export const socket = new GhostSocket();
