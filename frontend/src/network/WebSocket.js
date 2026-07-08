import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';

export class GhostSocket {
    constructor(url = CONFIG.WS_URL) {
        this.url = url;
        this.ws = null;
        this.listeners = new Map();
        this.contentTimer = null;
        this.reconnectTimer = null;
        this._connectTimeout = null;
        this.isConnected = false;
        this.lastSentContent = {};
        this._retryCount = 0;
        this._toastSystem = null;
        this.connect();
    }

    setToastSystem(ts) { this._toastSystem = ts; }

    connect() {
        this.ws = new WebSocket(this.url);

        // connection timeout -- if not open within 5s, close and retry in background
        this._connectTimeout = setTimeout(() => {
            if (!this.isConnected) {
                console.warn('[GhostSocket] Connection timeout -- retrying in background');
                this.ws.close();
            }
        }, 5000);

        this.ws.onopen = () => {
            clearTimeout(this._connectTimeout);
            this.isConnected = true;
            this._retryCount = 0;
            this.sendLang(i18n.getLang());
            this.emit('connected', {});
        };

        this.ws.onclose = () => {
            clearTimeout(this._connectTimeout);
            this.isConnected = false;
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
        let msg;
        try {
            msg = JSON.parse(rawData);
        } catch (e) {
            console.log('bad json lol');
            return;
        }
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
            case 'sleep_mode':
                this.emit('sleep_mode', msg);
                break;
            case 'plant_update':
                this.emit('plant_update', msg);
                break;
            case 'whoop_connected':
                this.emit('whoop_connected', msg);
                if (this._toastSystem) {
                    this._toastSystem.show('info', i18n.t('toast.whoop_connected'), i18n.t('toast.whoop_connected_body'), 6000);
                }
                break;
            case 'degraded_mode':
                this.emit('degraded_mode', msg);
                if (this._toastSystem) {
                    this._toastSystem.show('warning', i18n.t('toast.degraded'), i18n.t(`toast.${msg.cause === 'demo-offline' ? 'offline' : 'whoop_unavailable'}`), 8000);
                }
                break;
            default:
                console.warn('Unknown message type:', msg.type);
        }
    }

    reconnect() {
        clearTimeout(this.reconnectTimer);
        this._retryCount++;
        const delay = Math.min(1000 * Math.pow(2, this._retryCount - 1), 30000);
        // toast only the first attempts, then keep retrying silently
        if (this._toastSystem && this._retryCount <= 3) {
            const s = Math.round(delay / 1000);
            this._toastSystem.show('warning', i18n.t('toast.reconnecting'),
                i18n.t('toast.reconnecting_body', { s, n: this._retryCount }), delay);
        }
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
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
        if (this.lastSentContent[appType] === content) return;

        clearTimeout(this.contentTimer);
        this.contentTimer = setTimeout(() => {
            this.lastSentContent[appType] = content;
            this.send({
                type: 'content_update',
                app_type: appType,
                content: content,
                ...metadata,
                timestamp: new Date().toISOString()
            });
        }, 1500);
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

    sendLang(lang) {
        this.send({ type: 'set_lang', lang });
    }

    resumeLive() {
        this.send({ type: 'resume_live' });
    }

    sendAppFocus(appType) {
        this.send({
            type: 'app_focus',
            app_type: appType,
            timestamp: new Date().toISOString()
        });
    }

    sendRunError(code, error, language) {
        this.send({
            type: 'run_error',
            code,
            error,
            language,
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
