// Drives the REAL WHOOPBluetooth class against a stubbed Web Bluetooth stack.
// Goal: prove autoReconnect() can never be worse than today (user clicks Pair).
import { WHOOPBluetooth } from '../src/network/WHOOPBluetooth.js';

// --- minimal browser stubs -------------------------------------------------
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
};
globalThis.document = { addEventListener() {} };

class Char extends EventTarget {
    async startNotifications() {}
}
function makeDevice(id, { hangs = false, rejects = false } = {}) {
    const char = new Char();
    const dev = new EventTarget();
    dev.id = id;
    dev.name = 'WHOOP ' + id;
    let disconnectCalled = false;
    dev.gatt = {
        connected: false,
        async connect() {
            if (rejects) throw new Error('NetworkError: Bluetooth Device is no longer in range.');
            if (hangs) {
                // mirrors the spec: "These procedures can wait forever".
                // disconnect() must abort it (kWebBluetoothCancelConnect, enabled by default)
                await new Promise((_, reject) => {
                    dev.__abort = () => reject(new Error('AbortError'));
                });
            }
            return {
                async getPrimaryService() { return { async getCharacteristic() { return char; } }; },
            };
        },
        disconnect() { disconnectCalled = true; if (dev.__abort) dev.__abort(); },
    };
    dev.__char = char;
    dev.__disconnectCalled = () => disconnectCalled;
    return dev;
}
function setNavigator(v) {
    // node ships a read-only `navigator` global; replace it outright
    Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true, writable: true });
}
function stubBluetooth(devices, { noGetDevices = false, throws = false } = {}) {
    setNavigator({ bluetooth: {} });
    if (!noGetDevices) {
        navigator.bluetooth.getDevices = async () => {
            if (throws) throw new Error('SecurityError');
            return devices;
        };
    }
}

// --- test runner -----------------------------------------------------------
let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); console.log(`  PASS  ${name}`); pass++; }
    catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

console.log('\nautoReconnect — fail-safe behaviour\n');

await t('navigator.bluetooth missing (Firefox/Safari) -> silent, no throw', async () => {
    setNavigator({});
    const r = await new WHOOPBluetooth().autoReconnect();
    eq(r.ok, false, 'ok'); eq(r.reason, 'unsupported', 'reason');
});

await t('getDevices missing (flag off / old Chrome) -> silent', async () => {
    stubBluetooth([], { noGetDevices: true });
    const r = await new WHOOPBluetooth().autoReconnect();
    eq(r.ok, false, 'ok'); eq(r.reason, 'unsupported', 'reason');
});

await t('getDevices throws SecurityError -> caught, silent', async () => {
    stubBluetooth([], { throws: true });
    const r = await new WHOOPBluetooth().autoReconnect();
    eq(r.ok, false, 'ok'); eq(r.reason, 'error', 'reason');
});

await t('no granted devices (never paired) -> silent', async () => {
    stubBluetooth([]);
    const r = await new WHOOPBluetooth().autoReconnect();
    eq(r.reason, 'none-granted', 'reason');
});

await t('single granted device, no saved id -> connects', async () => {
    store.clear();
    stubBluetooth([makeDevice('aaa')]);
    const b = new WHOOPBluetooth();
    const r = await b.autoReconnect();
    eq(r.ok, true, 'ok'); eq(b.connected, true, 'connected');
});

await t('two straps, no saved id -> refuses to guess', async () => {
    store.clear();
    stubBluetooth([makeDevice('aaa'), makeDevice('bbb')]);
    const b = new WHOOPBluetooth();
    const r = await b.autoReconnect();
    eq(r.reason, 'ambiguous', 'reason'); eq(b.connected, false, 'connected');
});

await t('two straps, saved id -> picks the right one', async () => {
    store.clear(); store.set('devlife_ble_device_id', 'bbb');
    const wanted = makeDevice('bbb');
    stubBluetooth([makeDevice('aaa'), wanted]);
    const b = new WHOOPBluetooth();
    const r = await b.autoReconnect();
    eq(r.ok, true, 'ok'); eq(b.device.id, 'bbb', 'picked device');
});

await t('connect() hangs forever -> timeout aborts it, does NOT hang boot', async () => {
    store.clear();
    const dev = makeDevice('aaa', { hangs: true });
    stubBluetooth([dev]);
    const b = new WHOOPBluetooth();
    b._autoConnectTimeoutMs = 50;   // testable seam: don't depend on the real 6s wall-clock
    const r = await Promise.race([
        b.autoReconnect(),
        new Promise(res => setTimeout(() => res({ ok: false, reason: 'HUNG' }), 3000)),
    ]);
    eq(r.reason, 'timeout', 'reason');           // not 'HUNG' -> the timeout fired, boot did not stall
    eq(dev.__disconnectCalled(), true, 'disconnect() must abort the in-flight connect');
    eq(b.connected, false, 'connected');
});

await t('connect() rejects (out of range) -> silent', async () => {
    store.clear();
    stubBluetooth([makeDevice('aaa', { rejects: true })]);
    const b = new WHOOPBluetooth();
    const r = await b.autoReconnect();
    eq(r.reason, 'connect-failed', 'reason'); eq(b.connected, false, 'connected');
});

await t('already connected -> no-op', async () => {
    stubBluetooth([makeDevice('aaa')]);
    const b = new WHOOPBluetooth();
    b.connected = true;
    const r = await b.autoReconnect();
    eq(r.reason, 'already-connected', 'reason');
});

await t('manual Pair mid-flight -> auto attempt stands down', async () => {
    store.clear();
    stubBluetooth([makeDevice('aaa')]);
    const b = new WHOOPBluetooth();
    const p = b.autoReconnect();
    b._cancelAuto = true;                 // what connect() sets on a manual Pair
    const r = await p;
    eq(r.ok, false, 'must not claim success'); eq(r.reason, 'superseded', 'reason');
});

await t('one BLE frame is handled once after autoReconnect (no listener stacking)', async () => {
    store.clear();
    const dev = makeDevice('aaa');
    stubBluetooth([dev]);
    const b = new WHOOPBluetooth();
    let hits = 0;
    b._onHeartRate = () => { hits++; };
    await b.autoReconnect();
    await b._subscribeToHeartRate(await dev.gatt.connect());  // simulate a later reconnect
    dev.__char.dispatchEvent(new Event('characteristicvaluechanged'));
    eq(hits, 1, 'frame handled once');
});

console.log('\nreconnect loop — regresii\n');

await t('reconnect() nu porneste o a doua bucla peste una in zbor', async () => {
    stubBluetooth([]);
    const b = new WHOOPBluetooth();
    b.device = makeDevice('aaa');
    b._reconnecting = true;              // o bucla ruleaza deja
    let entered = 0;
    b._tryReconnect = async () => { entered++; };
    const r = await b.reconnect();
    eq(r, false, 'returns false');
    eq(entered, 0, 'nu are voie sa intre a doua oara in bucla');
    eq(b._reconnecting, true, 'garda buclei in zbor trebuie pastrata');
});

await t('reconnect() intra normal cand nu e nicio bucla in zbor', async () => {
    stubBluetooth([]);
    const b = new WHOOPBluetooth();
    b.device = makeDevice('aaa');
    let entered = 0;
    b._tryReconnect = async () => { entered++; };
    await b.reconnect();
    eq(entered, 1, 'trebuie sa incerce');
});

await t('Pair reusit in timpul asteptarii: bucla se retrage fara sa strice nimic', async () => {
    stubBluetooth([]);
    const b = new WHOOPBluetooth();
    b.device = makeDevice('aaa', { rejects: true });
    b._reconnectDelays = [5, 5, 5];
    let gaveUp = false;
    b.onGiveUp(() => { gaveUp = true; });

    const loop = b._tryReconnect();
    b.connected = true;                                // Pair manual reusit intre timp
    await loop;

    eq(b._giveUp, false, '_giveUp ar stinge reconectarea automata pentru tot restul sesiunii');
    eq(gaveUp, false, 'niciun toast de esec peste o banda care transmite');
});

await t('Pair reusit exact la ultima incercare: garda de la coada buclei tine', async () => {
    stubBluetooth([]);
    const b = new WHOOPBluetooth();
    // conexiunea manuala aterizeaza DUPA ultima verificare din bucla, chiar in timpul
    // ultimei incercari -- singurul caz pe care garda din interiorul buclei nu-l prinde
    const dev = makeDevice('aaa');
    dev.gatt.connect = async () => { b.connected = true; throw new Error('NetworkError'); };
    b.device = dev;
    b._reconnectDelays = [1];
    let gaveUp = false;
    b.onGiveUp(() => { gaveUp = true; });

    await b._tryReconnect();

    eq(b._giveUp, false, 'coada buclei nu are voie sa marcheze _giveUp peste o banda conectata');
    eq(gaveUp, false, 'niciun toast de esec peste o banda care transmite');
});

await t('o bucla epuizata fara reconectare CHIAR anunta esecul', async () => {
    stubBluetooth([]);
    const b = new WHOOPBluetooth();
    b.device = makeDevice('aaa', { rejects: true });
    b._reconnectDelays = [1, 1];
    let gaveUp = false;
    b.onGiveUp(() => { gaveUp = true; });

    await b._tryReconnect();

    eq(b._giveUp, true, 'dupa epuizare fara conexiune, _giveUp trebuie setat');
    eq(gaveUp, true, 'utilizatorul trebuie anuntat o singura data');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
