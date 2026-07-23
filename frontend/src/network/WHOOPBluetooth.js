// reconnect delays in ms: ~2min total over 8 attempts
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000];

// id-ul ultimei benzi imperecheate, ca sa o recunoastem intre mai multe permise
const LS_DEVICE_ID = 'devlife_ble_device_id';

// gatt.connect() nu are timeout: specificatia spune explicit ca poate astepta la nesfarsit
// daca banda e cunoscuta de adaptor dar nu emite (ex: bonded la nivel de sistem, dar pe
// masa). Taiem noi asteptarea cu disconnect(), care anuleaza connect()-ul in zbor.
const AUTO_CONNECT_TIMEOUT_MS = 6000;

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
        this._cancelAuto = false;
        // instanta, ca testele sa poata scurta asteptarile fara sa astepte timpi reali
        this._reconnectDelays = RECONNECT_DELAYS;
        this._autoConnectTimeoutMs = AUTO_CONNECT_TIMEOUT_MS;
        // referinte stabile: un arrow nou la fiecare resubscriere stivuia listeneri pe caracteristica,
        // iar cadrele BLE duplicate (diferenta 0) scadeau artificial RMSSD/HRV
        this._onHeartRateBound = (event) => this._onHeartRate(event);
        this._onGattDisconnectedBound = () => {
            console.log('[whoop-ble] disconnected');
            this.connected = false;
            this._notifyListeners(0, false);
            this._tryReconnect();
        };
    }

    /** Reconectare tacuta, fara selectorul din browser. Se cheama la pornire.
     *
     * O conexiune Web Bluetooth traieste cat pagina, deci un refresh o rupe intotdeauna --
     * asta nu se poate evita. Ce se poate evita e selectorul: getDevices() intoarce benzile
     * pentru care originea are deja permisiune, fara sa ceara nimic utilizatorului, deci
     * cele ~20s de cautat si apasat devin o reconectare automata.
     *
     * Reguli: orice esec e tacut si lasa exact starea de dinainte -- utilizatorul apasa Pair
     * ca pana acum. Nu arunca niciodata si nu blocheaza pornirea.
     */
    async autoReconnect() {
        if (this.connected) return { ok: false, reason: 'already-connected' };
        this._cancelAuto = false;
        try {
            // getDevices() e expus doar cu chrome://flags/#enable-web-bluetooth-new-permissions-backend
            // activat; fara el metoda nici nu exista, deci reconectarea tacuta e imposibila
            // (orice banda, nu doar una anume) si se cade inapoi pe butonul Pair
            if (!navigator.bluetooth || typeof navigator.bluetooth.getDevices !== 'function') {
                console.info('[whoop-ble] reconectarea automata cere flag-ul Chrome ' +
                    '"enable-web-bluetooth-new-permissions-backend"; fara el, foloseste butonul Pair');
                return { ok: false, reason: 'unsupported' };
            }
            const devices = await navigator.bluetooth.getDevices();
            if (this._cancelAuto) return { ok: false, reason: 'superseded' };
            if (!devices || devices.length === 0) return { ok: false, reason: 'none-granted' };

            // cu mai multe benzi permise, ghicitul ar conecta-o pe cea gresita: mergem doar
            // pe cea salvata la ultima imperechere, sau cand nu e nicio ambiguitate
            let saved = null;
            try { saved = localStorage.getItem(LS_DEVICE_ID); } catch (_) { /* storage blocat */ }
            const device = devices.find(d => d.id === saved) || (devices.length === 1 ? devices[0] : null);
            if (!device) return { ok: false, reason: 'ambiguous' };

            this.device = device;
            device.addEventListener('gattserverdisconnected', this._onGattDisconnectedBound);

            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                try { device.gatt.disconnect(); } catch (_) { /* deja cazut */ }
            }, this._autoConnectTimeoutMs);

            try {
                const server = await device.gatt.connect();
                clearTimeout(timer);
                if (timedOut || this._cancelAuto) return { ok: false, reason: timedOut ? 'timeout' : 'superseded' };
                await this._subscribeToHeartRate(server);
                if (this._cancelAuto) return { ok: false, reason: 'superseded' };
                this.connected = true;
                this._giveUp = false;
                console.log('[whoop-ble] reconectat tacut, fara selector');
                this._notifyListeners(this.currentBPM, true);
                this._wireVisibilityHandler();
                return { ok: true };
            } catch (e) {
                clearTimeout(timer);
                console.log('[whoop-ble] reconectarea tacuta a esuat:', e && e.message);
                return { ok: false, reason: timedOut ? 'timeout' : 'connect-failed' };
            }
        } catch (e) {
            // getDevices() poate arunca SecurityError sub o permissions policy restrictiva
            console.log('[whoop-ble] reconectarea tacuta indisponibila:', e && e.message);
            return { ok: false, reason: 'error' };
        }
    }

    // web bluetooth API - only works in chrome/edge
    async connect() {
        // un Pair manual are prioritate peste o reconectare tacuta inca in zbor
        this._cancelAuto = true;
        try {
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['heart_rate'] },
                    { namePrefix: 'WHOOP' }
                ],
                optionalServices: ['heart_rate']
            });

            this.device.addEventListener('gattserverdisconnected', this._onGattDisconnectedBound);

            const server = await this.device.gatt.connect();
            await this._subscribeToHeartRate(server);

            this.connected = true;
            this._giveUp = false;
            // retinem banda ca sa o putem recunoaste dupa un refresh, fara selector.
            // id-ul e per-origine si per-profil; nu identifica banda in afara acestui browser
            try { localStorage.setItem(LS_DEVICE_ID, this.device.id); } catch (_) { /* storage blocat */ }
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
        this.heartRateChar.addEventListener('characteristicvaluechanged', this._onHeartRateBound);
    }

    _onHeartRate(event) {
        // BLE Heart Rate Measurement (0x2A37): flags byte, HR (8/16-bit by flag bit 0),
        // optional energy expended (bit 3), then RR-intervals (bit 4) as uint16 LE in 1/1024s
        const value = event.target.value;
        const flags = value.getUint8(0);
        let offset = 1;
        if (flags & 0x01) {
            this.currentBPM = value.getUint16(offset, true);
            offset += 2;
        } else {
            this.currentBPM = value.getUint8(offset);
            offset += 1;
        }
        if (flags & 0x08) offset += 2; // skip energy expended
        const rr = [];
        if (flags & 0x10) {
            for (; offset + 1 < value.byteLength; offset += 2) {
                rr.push(Math.round(value.getUint16(offset, true) * 1000 / 1024)); // -> ms
            }
        }
        this._notifyListeners(this.currentBPM, true, rr);
    }

    async _tryReconnect() {
        if (this._reconnecting || !this.device || this._giveUp) return;
        this._reconnecting = true;

        for (let i = 0; i < this._reconnectDelays.length; i++) {
            await new Promise(r => setTimeout(r, this._reconnectDelays[i]));
            // tab may have closed, disconnect() called, sau utilizatorul a apasat Pair si
            // s-a conectat manual in timpul asteptarii -- bucla asta nu mai are ce cauta
            if (this._giveUp || this.connected) {
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

        // incercari epuizate; doar callback-ul de give-up, listener-ii sunt deja pe (0, false)
        this._reconnecting = false;
        // daca intre timp s-a conectat (Pair manual in timpul buclei), nu avem voie sa
        // marcam _giveUp: ar stinge reconectarea automata pentru tot restul sesiunii si ar
        // arata un toast de esec peste o banda care transmite
        if (this.connected) return;
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
        // NU reseta _reconnecting daca o bucla e deja in zbor: garda din _tryReconnect pe
        // ea se sprijina, iar stergerea ei pornea o a doua bucla in paralel cu prima
        if (this._reconnecting) return false;
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

    _notifyListeners(bpm, connected, rr = []) {
        this._listeners.forEach(cb => cb(bpm, connected, rr));
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
