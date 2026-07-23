// global keyboard shortcuts: 1-5 mock states, ESC close, ? shortcuts, TAB dashboard,
// T room<->town, E interact. mutable game state comes in via getters

import { i18n } from '../i18n/index.js';
import { isApiKeysModalOpen, closeApiKeysModal } from '../hud/ApiKeysModal.js';

export function wireKeyboard(deps) {
    const { getActiveApp, getSceneManager, demoHotbar, toastSystem, applyMockState,
            shortcutsOverlay, ghost, dashboard, closeAllApps, furniture, player,
            settingsMenu } = deps;

    // orasul/cafeneaua/coworkingul isi inregistreaza propriile handlere de E si Escape,
    // insa abia la tranzitie -- deci ale noastre ruleaza primele si stopPropagation-ul
    // lor nu ne-ar opri. Garda trebuie sa fie aici.
    const inRoom = () => {
        const sm = getSceneManager();
        return !sm || sm.getCurrentScene() === 'room';
    };

    document.addEventListener('keydown', (e) => {
        const activeApp = getActiveApp();
        // a focused real terminal/editor needs every key (digits, Escape for vim, Tab…) —
        // don't let game shortcuts steal them. The app provides its own close button.
        if (activeApp && activeApp.capturesKeyboard) {
            // Shift+Esc trebuie sa mearga indiferent de focus: handler-ele din xterm/monaco
            // se declanseaza doar cand widgetul lor are focus, iar un click pe bara de titlu
            // sau pe un tab il pierde -- si atunci aplicatia nu se mai putea inchide din taste
            if (e.key === 'Escape' && e.shiftKey) { e.preventDefault(); closeAllApps(); return; }
            return;
        }

        // 1-5: change mock biometric state (disabled when BLE is streaming live data)
        if (e.key >= '1' && e.key <= '5') {
            const tg = e.target.tagName;
            if (tg === 'INPUT' || tg === 'TEXTAREA' || e.target.isContentEditable) return;
            e.preventDefault();
            if (!demoHotbar.manualEnabled) {
                toastSystem.show('warning', '🔒 ' + i18n.t('toast.live_mode_locked_title'), i18n.t('toast.live_mode_locked'), 3000);
                return;
            }
            applyMockState(parseInt(e.key));
            return;
        }

        // !e.shiftKey: Shift+Esc e chordul de inchidere al aplicatiilor. Handler-ul din
        // xterm/monaco inchide aplicatia si abia apoi evenimentul ajunge aici, cu activeApp
        // deja null -- fara garda, Shift+Esc inchidea terminalul si deschidea setarile
        if (e.key === 'Escape' && !e.shiftKey) {
            if (isApiKeysModalOpen()) { closeApiKeysModal(); return; }
            if (settingsMenu && settingsMenu._visible) { settingsMenu.hide(); return; }
            if (shortcutsOverlay.visible) { shortcutsOverlay.hide(); return; }
            if (ghost._bubble) { ghost.dismissBubble(true); return; }
            if (activeApp) { closeAllApps(); return; }
            if (dashboard._visible) { dashboard.hide(); return; }
            // closeAllApps si cand nu e nimic deschis: reseteaza player/HUD daca au
            // ramas agatate (plasa de siguranta care exista dinainte)
            closeAllApps();
            // meniul de pauza doar in camera: in oras/cafenea/coworking Escape apartine
            // scenei (iesire din meditatie, inchidere panou) si s-ar fi intamplat ambele
            if (settingsMenu && inRoom()) settingsMenu.show();
            return;
        }

        // ?: keyboard shortcuts overlay
        if (e.key === '?') {
            const t = e.target.tagName;
            if (t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable) return;
            e.preventDefault();
            shortcutsOverlay.toggle();
            return;
        }

        // O: settings (API keys, language, personality, audio) — the main menu is gone once
        // the game starts, so this is the only in-game way in
        if (e.key.toLowerCase() === 'o' && settingsMenu) {
            const t = e.target.tagName;
            if (t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable) return;
            e.preventDefault();
            settingsMenu.toggle();
            return;
        }

        // TAB: toggle the dashboard overlay (only when no app is open)
        if (e.key === 'Tab') {
            e.preventDefault();
            if (!activeApp) dashboard.toggle();
            return;
        }

        // Don't capture WASD/E when an app overlay is open - let the app handle them
        if (activeApp) return;

        // Skip game shortcuts while typing in an input field (e.g. HUD search)
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

        if (e.key.toLowerCase() === 't') {
            const sceneManager = getSceneManager();
            if (sceneManager) {
                sceneManager.transitionTo(
                    sceneManager.getCurrentScene() === 'room' ? 'town' : 'room',
                    { duration: 800 }
                );
            }
            return;
        }

        if (e.key.toLowerCase() === 'e') {
            // in alte scene player.update() nu ruleaza, deci gridX/gridY raman inghetate in camera;
            // fara garda, E deschidea aplicatiile camerei peste oras/cafenea
            if (!inRoom()) return;
            const name = furniture.getNearbyInteractable(player.gridX, player.gridY);
            // preventDefault: aplicatia isi pune focusul pe un camp de text (textarea din
            // whiteboard, monaco), iar actiunea implicita a aceleiasi taste scria 'e' in el
            if (name) { e.preventDefault(); furniture.emit('interact', name); }
        }
    });
}
