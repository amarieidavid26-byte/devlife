// reconnect delays in ms: ~2min total over 8 attempts
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000];

export class WHOOPBluetooth {
    constructor() {
        this.device = null;
        this.server = null;
        this.heartRateChar = null;
        this.currentBPM = 0;
        this.connected = false;
        this._listeners = [];
        this._reconnecting = false;
        this._giveUp = false;
        this._onGiveUp = null;
        this._visibilityWired = false;
    }

    // web bluetooth API - only works in chrome/edge
    async connect() {
        try {
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['heart_rate'] },
                    { namePrefix: 'WHOOP' }
                ],
                optionalServices: ['heart_rate']
            });

            this.device.addEventListener('gattserverdisconnected', () => {
                console.log('[whoop-ble] disconnected');
                this.connected = false;
                this._notifyListeners(0, false);
                this._tryReconnect();
            });

            const server = await this.device.gatt.connect();
            await this._subscribeToHeartRate(server);

            this.connected = true;
            this._giveUp = false;
            console.log('[whoop-ble] connected, live HR streaming');
            this._notifyListeners(this.currentBPM, true);

            this._wireVisibilityHandler();
            return { ok: true };
        } catch (err) {
            console.error('[whoop-ble] connect failed', err);
            this.connected = false;
            return {
                ok: false,
                errorName: (err && err.name) ? err.name : 'Error',
                errorMessage: (err && err.message) ? err.message : String(err),
            };
        }
    }

    // shared GATT setup: service → characteristic → subscribe
    async _subscribeToHeartRate(server) {
        this.server = server;
        const service = await server.getPrimaryService('heart_rate');
        this.heartRateChar = await service.getCharacteristic('heart_rate_measurement');
        await this.heartRateChar.startNotifications();
        this.heartRateChar.addEventListener('characteristicvaluechanged', (event) => {
            this._onHeartRate(event);
        });
    }

    _onHeartRate(event) {
        const value = event.target.value;
        const flags = value.getUint8(0);
        if (flags & 0x01) {
            this.currentBPM = value.getUint16(1, true);
        } else {
            this.currentBPM = value.getUint8(1);
        }
        this._notifyListeners(this.currentBPM, true);
    }

    async _tryReconnect() {
        if (this._reconnecting || !this.device || this._giveUp) return;
        this._reconnecting = true;

        for (let i = 0; i < RECONNECT_DELAYS.length; i++) {
            await new Promise(r => setTimeout(r, RECONNECT_DELAYS[i]));
            // tab may have closed or disconnect() called during the wait
            if (this._giveUp) {
                this._reconnecting = false;
                return;
            }
            try {
                const server = await this.device.gatt.connect();
                await this._subscribeToHeartRate(server);
                this.connected = true;
                console.log(`[whoop-ble] reconnected on attempt ${i + 1}`);
                this._notifyListeners(this.currentBPM, true);
                this._reconnecting = false;
                return;
            } catch (e) {
                console.log(`[whoop-ble] reconnect attempt ${i + 1} failed:`, e && e.message);
            }
        }

        // exhausted all attempts -- user must click Pair again
        // listeners are already in (0, false) state from the original disconnect event;
        // we only fire the dedicated give-up callback so the UI shows one terminal toast
        this._reconnecting = false;
        this._giveUp = true;
        console.warn('[whoop-ble] gave up reconnecting after all attempts');
        if (typeof this._onGiveUp === 'function') {
            try { this._onGiveUp(); } catch (_) { /* swallow listener errors */ }
        }
    }

    // public manual retry — clears give-up state, re-enters reconnect loop
    async reconnect() {
        if (!this.device) return false;
        if (this.connected) return true;
        this._giveUp = false;
        this._reconnecting = false;
        await this._tryReconnect();
        return this.connected;
    }

    _wireVisibilityHandler() {
        if (this._visibilityWired) return;
        this._visibilityWired = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            if (this.connected || !this.device || this._giveUp) return;
            console.log('[whoop-ble] tab visible again, retrying connection');
            this._tryReconnect();
        });
    }

    onUpdate(callback) {
        this._listeners.push(callback);
    }

    onGiveUp(callback) {
        this._onGiveUp = callback;
    }

    _notifyListeners(bpm, connected) {
        this._listeners.forEach(cb => cb(bpm, connected));
    }

    disconnect() {
        // explicit disconnect — do NOT auto-reconnect
        this._giveUp = true;
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.connected = false;
    }
}
