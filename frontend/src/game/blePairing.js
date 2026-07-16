// WHOOP BLE pairing: the PAIR WHOOP button -> Web Bluetooth; live bpm + RR intervals
// stream to the backend (RR feeds the live RMSSD-HRV)

import { i18n } from '../i18n/index.js';
import { WHOOPBluetooth } from '../network/WHOOPBluetooth.js';

export function wireBLEPairing({ socket, hud, demoHotbar, toastSystem }) {
    const whoop = new WHOOPBluetooth();
    window.connectWHOOP = async () => {
        const res = await whoop.connect();
        if (res.ok) {
            demoHotbar.setBLEConnected(true);
            toastSystem.show('info', '❤️ ' + i18n.t('ble.connected'), i18n.t('ble.connected_body'), 2500);
            return;
        }
        // user cancelled the browser picker -- silent, expected
        if (res.errorName === 'NotFoundError') return;
        if (res.errorName === 'SecurityError') {
            toastSystem.show('warning', '🔒 ' + i18n.t('ble.pair_failed_https'), '', 6000);
        } else if (res.errorName === 'NotSupportedError') {
            toastSystem.show('warning', '⚠️ ' + i18n.t('ble.pair_failed_not_supported'), '', 6000);
        } else {
            toastSystem.show('warning', '📡 ' + i18n.t('ble.pair_failed_generic', { err: res.errorMessage }), '', 5000);
        }
    };
    whoop.onUpdate((bpm, connected, rr) => {
        demoHotbar.setBLEConnected(connected);
        if (connected && bpm > 0) {
            // rr = inter-beat intervals (ms) when the strap broadcasts them (flag bit 4);
            // the backend computes live RMSSD-HRV from these
            socket.send(rr && rr.length ? { type: 'heart_rate', bpm, rr } : { type: 'heart_rate', bpm });
            hud.update({ heartRate: bpm });
        }
        if (!connected) {
            toastSystem.show('warning', '📴 ' + i18n.t('ble.disconnected'), i18n.t('ble.disconnected_body'), 4000);
        }
    });
    whoop.onGiveUp(() => {
        toastSystem.show('warning', '📴 ' + i18n.t('ble.reconnect_giveup'), i18n.t('ble.reconnect_giveup_body'), 8000);
    });
    return whoop;
}
