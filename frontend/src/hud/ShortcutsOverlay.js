import { i18n } from '../i18n/index.js';

// same bindings the settings menu documents (settings.kb_* keys)
const BINDS = [
    ['WASD', 'settings.kb_move'],
    ['E', 'settings.kb_interact'],
    ['T', 'settings.kb_toggle_town'],
    ['1-5', 'settings.kb_switch_state'],
    ['TAB', 'settings.kb_ghost_vision'],
    ['ESC', 'settings.kb_close_app'],
    ['?', 'shortcuts.this_panel'],
];

export class ShortcutsOverlay {
    constructor() {
        this._el = null;
        this.visible = false;
    }

    toggle() { this.visible ? this.hide() : this.show(); }

    show() {
        if (this._el) this._el.remove();
        const rows = BINDS.map(([key, descKey]) => `
            <div style="display:flex;align-items:center;gap:14px;padding:5px 0">
                <kbd style="min-width:52px;text-align:center;padding:4px 8px;border-radius:5px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);font-family:'Courier New',monospace;font-size:12px;color:#F5F0E8">${key}</kbd>
                <span style="font-family:'Nunito',sans-serif;font-size:13px;color:#B8A88C">${i18n.t(descKey)}</span>
            </div>`).join('');

        this._el = document.createElement('div');
        this._el.style.cssText = `
            position:fixed; inset:0; z-index:9500; display:flex; align-items:center; justify-content:center;
            background:rgba(10,8,6,0.55); backdrop-filter:blur(4px);`;
        this._el.innerHTML = `
            <div style="background:rgba(42,36,28,0.96); border:1px solid rgba(255,228,181,0.15); border-radius:10px; padding:22px 28px; box-shadow:0 8px 40px rgba(0,0,0,0.5)">
                <div style="font-family:'Fredoka',sans-serif;font-size:15px;color:#F5F0E8;margin-bottom:10px">⌨️ ${i18n.t('shortcuts.title')}</div>
                ${rows}
                <div style="margin-top:10px;font-family:'Nunito',sans-serif;font-size:11px;color:#8a7a5c;font-style:italic">${i18n.t('shortcuts.dismiss')}</div>
            </div>`;
        this._el.addEventListener('click', () => this.hide());
        document.body.appendChild(this._el);
        this.visible = true;
    }

    hide() {
        if (this._el) { this._el.remove(); this._el = null; }
        this.visible = false;
    }
}
