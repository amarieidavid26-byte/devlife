// global keyboard shortcuts: 1-5 mock states, ESC close, ? shortcuts, TAB dashboard,
// T room<->town, E interact. mutable game state comes in via getters

import { i18n } from '../i18n/index.js';

export function wireKeyboard(deps) {
    const { getActiveApp, getSceneManager, demoHotbar, toastSystem, applyMockState,
            shortcutsOverlay, ghost, dashboard, closeAllApps, furniture, player } = deps;

    document.addEventListener('keydown', (e) => {
        const activeApp = getActiveApp();
        // a focused real terminal/editor needs every key (digits, Escape for vim, Tab…) —
        // don't let game shortcuts steal them. The app provides its own close button.
        if (activeApp && activeApp.capturesKeyboard) return;

        // 1-5: change mock biometric state (disabled when WHOOP BLE is streaming live data)
        if (e.key >= '1' && e.key <= '5') {
            e.preventDefault();
            if (!demoHotbar.manualEnabled) {
                toastSystem.show('warning', '🔒 ' + i18n.t('toast.live_mode_locked_title'), i18n.t('toast.live_mode_locked'), 3000);
                return;
            }
            applyMockState(parseInt(e.key));
            return;
        }

        // Escape always works (closes apps/bubbles even while typing)
        if (e.key === 'Escape') {
            if (shortcutsOverlay.visible) { shortcutsOverlay.hide(); return; }
            if (ghost._bubble) { ghost.dismissBubble(true); return; }
            closeAllApps();
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
            const name = furniture.getNearbyInteractable(player.gridX, player.gridY);
            if (name) furniture.emit('interact', name);
        }
    });
}
