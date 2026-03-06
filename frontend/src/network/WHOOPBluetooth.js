export class WHOOPBluetooth {
    constructor() {
        this.device = null;
        this.server = null;
        this.heartRateChar = null;
        this.currentBPM = 0;
        this.connected = false;
        this._listeners = [];
        this._reconnecting = false; 
    }

    // web bluetooth API - only works in chrome lol
    // tried navigator.bluetooth.getDevices() first but it didnt work
    async connect() {
        try {
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['heart_rate'] },
                    { namePrefix: 'WHOOP' }

                ],
                optionalServices: ['heart_rate']
            });

            this.device.addEventListener('gattservedisconnected', () => {
                console.log('[whoop-ble] - disconnected');
                this.connected = false;
                this._notifyListeners(0, false);
                this._tryReconnect();
            });

            this.server = await this.device.gatt.connect();
            const service = await
                this.server.getPrimaryService('heart_rate');
            this.heartRateChar = await
                service.getCharacteristic('heart_rate_measurement');
            
            await this.heartRateChar.startNotifications();
            this.heartRateChar
                .addEventListener('characteristicvaluechanged', (event) => {
                    this._onHeartRate(event);
                });
            
            this.connected = true;
            console.log('[whoop-ble] connected. live hr streaming into the app');
            this._notifyListeners(this.currentBPM, true);
            return true;
        } catch (err) {
            console.error('[whoop ble] connection failed', err);
            this.connected = false;
            return false;
        }
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

    // HACK: duped from connect()
    async _tryReconnect() {
        if (this._reconnecting || !this.device) return;
        this._reconnecting = true;
        for (let i = 0; i < 3; i++){
            try { 
                await new Promise(r => setTimeout(r, 2000));
                this.server = await this.device.gatt.connect();
                const service = await
                    this.server.getPrimaryService('heart_rate');
                this.heartRateChar = await
                    service.getCharacteristic('heart_rate_measurement');
                await this.heartRateChar.startNotifications();
                this.heartRateChar
                    .addEventListener('characteristicvaluechanged', (event) => {
                        this._onHeartRate(event);
                    });
                    this.connected = true;
                    console.log('[whoop ble] reconnected, hooray');
                    this._notifyListeners(this.currentBPM, true);
                    this._reconnecting = false;
                    return;
            } catch (e) {
                console.log('[whoop ble] reconnect attempt ${i + 1} failed');
            }
        }
        this._reconnecting = false;
    }

    onUpdate(callback) {
        this._listeners.push(callback);
    }

    _notifyListeners(bpm, connected) {
        this._listeners.forEach(cb => cb(bpm, connected));
    }

    disconnect(){
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.connected = false;
    }
}