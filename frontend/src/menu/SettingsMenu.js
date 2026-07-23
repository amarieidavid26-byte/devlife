import { i18n } from '../i18n/index.js';
import { Spotify } from '../network/Spotify.js';
import { openApiKeysModal } from '../hud/ApiKeysModal.js';
import { CONFIG } from '../config.js';
import { getFeatures, isWhoopConnected, setWhoopConnected, authHeaders } from '../network/session.js';

// doar afisate in UI: flag-urile pornesc exclusiv din .env, ca granita de securitate
const FEATURE_FLAGS = ['terminal', 'files', 'lsp', 'inline_ai', 'code_server'];

const KEYBINDS = [
  ['WASD', 'settings.kb_move'],
  ['E', 'settings.kb_interact'],
  ['T', 'settings.kb_toggle_town'],
  ['1-5', 'settings.kb_switch_state'],
  ['TAB', 'settings.kb_ghost_vision'],
  ['ESC', 'settings.kb_close_app'],
  ['Shift+ESC', 'settings.kb_close_editor'],
  ['O', 'settings.kb_settings'],
];

export class SettingsMenu {
  constructor() {
    this._volumeCb = null;
    this._muteCb = null;
    this._visible = false;

    // root overlay
    const root = document.createElement('div');
    root.style.cssText = `
        position:fixed; inset:0; z-index:10001;
        background:rgba(5,5,15,0.92);
        backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
        display:flex; align-items:center; justify-content:center;
        visibility:hidden; opacity:0; transition:opacity 0.2s ease;
    `;
    this._root = root;

    // panel
    const panel = document.createElement('div');
    panel.style.cssText = `
        max-width:520px; width:90%; max-height:88vh; overflow-y:auto;
        background:linear-gradient(180deg, rgba(20,20,38,0.97) 0%, rgba(12,12,24,0.97) 100%);
        border:1px solid rgba(255,255,255,0.08); border-radius:12px;
        padding:32px 36px; box-sizing:border-box;
        box-shadow:0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04);
    `;
    root.appendChild(panel);

    // title block with accent underline
    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'text-align:center; margin-bottom:28px;';
    const titleEl = this._heading(i18n.t('settings.title'), {
      fontSize: '26px',
      color: '#f0f0f0',
      letterSpacing: '6px',
      fontWeight: '600',
      textShadow: '0 0 24px rgba(0,200,100,0.18)',
    });
    titleWrap.appendChild(titleEl);
    const accent = document.createElement('div');
    accent.style.cssText = 'width:40px; height:2px; background:#00c864; margin:10px auto 0; border-radius:2px; box-shadow:0 0 12px rgba(0,200,100,0.6);';
    titleWrap.appendChild(accent);
    panel.appendChild(titleWrap);

    // audio section
    panel.appendChild(this._sectionLabel(i18n.t('settings.audio')));

    // volume + mute on one row
    const volRow = this._row();
    const volLabel = this._label(i18n.t('settings.volume'));
    const volValue = this._label('70%');
    volValue.style.color = '#e0e0e0';
    volValue.style.minWidth = '36px';
    volValue.style.textAlign = 'right';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = '70';
    Object.assign(slider.style, {
      flex: '1',
      height: '4px',
      margin: '0 12px',
      cursor: 'pointer',
      accentColor: '#00c864',
    });
    slider.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      volValue.textContent = v + '%';
      if (this._volumeCb) this._volumeCb(v / 100);
    });

    const muteLabel = this._label(i18n.t('settings.mute'));
    muteLabel.style.margin = '0 8px 0 18px';

    const muteBox = document.createElement('input');
    muteBox.type = 'checkbox';
    Object.assign(muteBox.style, {
      width: '16px',
      height: '16px',
      cursor: 'pointer',
      accentColor: '#00c864',
    });
    muteBox.addEventListener('change', () => {
      if (this._muteCb) this._muteCb(muteBox.checked);
    });

    volRow.appendChild(volLabel);
    volRow.appendChild(slider);
    volRow.appendChild(volValue);
    volRow.appendChild(muteLabel);
    volRow.appendChild(muteBox);
    panel.appendChild(volRow);

    // language section
    panel.appendChild(this._sectionLabel(i18n.t('settings.language')));
    const langRow = this._row();
    langRow.style.gap = '10px';
    for (const lang of ['ro', 'en']) {
      const btn = document.createElement('button');
      btn.textContent = i18n.t(`settings.lang.${lang}`);
      btn.dataset.lang = lang;
      const active = () => lang === i18n.getLang();
      const style = () => {
        btn.style.cssText = `padding:6px 16px;border-radius:4px;cursor:pointer;font-family:'Courier New',monospace;font-size:12px;border:1px solid;transition:all 0.15s;
          background:${active() ? 'rgba(0,200,100,0.15)' : 'rgba(255,255,255,0.05)'};
          color:${active() ? '#00c864' : '#666'};
          border-color:${active() ? '#00c864' : 'rgba(255,255,255,0.1)'};`;
      };
      style();
      btn.addEventListener('click', () => {
        if (lang === i18n.getLang()) return;
        i18n.setLang(lang); // persists to localStorage
        // reload so every surface (menus, world labels, app windows) re-renders in the new language
        location.reload();
      });
      langRow.appendChild(btn);
    }
    panel.appendChild(langRow);

    // ghost personality section
    panel.appendChild(this._sectionLabel(i18n.t('settings.personality')));
    const persRow = this._row();
    persRow.style.gap = '10px';
    const getPers = () => localStorage.getItem('devlife_personality') || 'friend';
    const persStyles = [];
    for (const p of ['coach', 'friend', 'sarcastic']) {
      const btn = document.createElement('button');
      btn.textContent = i18n.t(`settings.personality.${p}`);
      const style = () => {
        const active = p === getPers();
        btn.style.cssText = `padding:6px 16px;border-radius:4px;cursor:pointer;font-family:'Courier New',monospace;font-size:12px;border:1px solid;transition:all 0.15s;
          background:${active ? 'rgba(0,200,100,0.15)' : 'rgba(255,255,255,0.05)'};
          color:${active ? '#00c864' : '#666'};
          border-color:${active ? '#00c864' : 'rgba(255,255,255,0.1)'};`;
      };
      style();
      persStyles.push(style);
      btn.addEventListener('click', () => {
        localStorage.setItem('devlife_personality', p);
        persStyles.forEach(fn => fn());
        window.dispatchEvent(new CustomEvent('devlife:personality', { detail: p }));
      });
      persRow.appendChild(btn);
    }
    panel.appendChild(persRow);

    // cont WHOOP (OAuth), distinct de PAIR SENSOR (BLE, doar puls live); recovery/strain/sleep/HRV vin doar de aici
    // vizibilitatea se decide in show(): feature flags sosesc abia dupa constructor (initSession e async)
    this._whoopSection = document.createElement('div');
    this._whoopSection.appendChild(this._sectionLabel(i18n.t('whoop.section')));
    this._whoopHint = document.createElement('div');
    this._whoopHint.style.cssText = "font-family:'Nunito',sans-serif;font-size:11px;color:#8A7E6A;line-height:1.5;margin-bottom:10px;";
    this._whoopSection.appendChild(this._whoopHint);
    this._whoopBtn = document.createElement('button');
    this._whoopBtn.style.cssText = `padding:8px 16px;background:rgba(255,255,255,0.05);
      border-radius:4px;cursor:pointer;
      font-family:'Courier New',monospace;font-size:12px;letter-spacing:1px;
      transition:background 0.15s;`;
    this._whoopBtn.addEventListener('click', () => {
      if (isWhoopConnected()) {
        // la esec (ex: token invalid dupa un reload de dev -> 403) starea o corecteaza urmatorul biometric_update
        fetch(CONFIG.BACKEND_URL + '/api/whoop/disconnect', { method: 'POST', headers: authHeaders() })
          .then((r) => { if (r.ok) { setWhoopConnected(false); this.refreshWhoopRow(); } })
          .catch(() => {});
        return;
      }
      window.location.href = CONFIG.BACKEND_URL + '/api/whoop/auth';
    });
    this._whoopSection.appendChild(this._whoopBtn);
    this.refreshWhoopRow();
    this._whoopSection.style.display = getFeatures().whoop ? '' : 'none';
    panel.appendChild(this._whoopSection);

    // spotify section — only shown when client_id is configured at build time
    if (Spotify.isConfigured()) {
      panel.appendChild(this._sectionLabel(i18n.t('spotify.section')));
      this._spotifyRow = this._row();
      this._spotifyRow.style.flexDirection = 'column';
      this._spotifyRow.style.alignItems = 'stretch';
      this._spotifyRow.style.gap = '8px';
      panel.appendChild(this._spotifyRow);
      this._renderSpotifyRow();
      this._spotifyUnsub = Spotify.onChange(() => this._renderSpotifyRow());
    }

    // API keys (BYOK) section — opens the shared modal, same one as the dashboard topbar
    panel.appendChild(this._sectionLabel(i18n.t('apikeys.title')));
    const keysRow = this._row();
    keysRow.style.gap = '12px';
    const keysNote = document.createElement('div');
    keysNote.textContent = i18n.t('apikeys.privacy');
    keysNote.style.cssText = "flex:1; font-family:'Nunito',sans-serif; font-size:11px; color:#888; line-height:1.5;";
    const keysBtn = document.createElement('button');
    keysBtn.textContent = i18n.t('apikeys.manage');
    keysBtn.style.cssText = `padding:8px 16px;background:rgba(255,255,255,0.05);
      color:#00c864;border:1px solid #00c864;border-radius:4px;cursor:pointer;
      font-family:'Courier New',monospace;font-size:12px;letter-spacing:1px;flex-shrink:0;
      transition:background 0.15s;`;
    keysBtn.addEventListener('mouseenter', () => { keysBtn.style.background = 'rgba(0,200,100,0.13)'; });
    keysBtn.addEventListener('mouseleave', () => { keysBtn.style.background = 'rgba(255,255,255,0.05)'; });
    keysBtn.addEventListener('click', () => openApiKeysModal());
    keysRow.appendChild(keysNote);
    keysRow.appendChild(keysBtn);
    panel.appendChild(keysRow);

    // functii locale: doar stare, fara toggle-uri; randurile se reconstruiesc la fiecare show()
    panel.appendChild(this._sectionLabel(i18n.t('settings.features')));
    this._featuresRows = document.createElement('div');
    panel.appendChild(this._featuresRows);
    this._renderFeatureRows();
    const featuresHint = document.createElement('div');
    featuresHint.textContent = i18n.t('settings.features_hint');
    featuresHint.style.cssText = "font-family:'Nunito',sans-serif;font-size:11px;color:#8A7E6A;line-height:1.5;margin-top:8px;";
    panel.appendChild(featuresHint);

    // controls section
    panel.appendChild(this._sectionLabel(i18n.t('settings.controls')));

    const kbGrid = document.createElement('div');
    kbGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; column-gap:24px; row-gap:4px;';
    for (const [key, descKey] of KEYBINDS) {
      const cell = document.createElement('div');
      const k = this._label(key);
      k.style.fontSize = '12px';
      k.style.color = '#00c864';
      const sep = this._label('\u00b7');
      sep.style.fontSize = '12px';
      sep.style.margin = '0 6px';
      sep.style.color = '#555';
      const d = this._label(i18n.t(descKey));
      d.style.fontSize = '12px';
      d.style.color = '#888';
      cell.appendChild(k);
      cell.appendChild(sep);
      cell.appendChild(d);
      kbGrid.appendChild(cell);
    }
    panel.appendChild(kbGrid);

    const kbHint = document.createElement('div');
    kbHint.textContent = i18n.t('settings.kb_all_hint');
    kbHint.style.cssText = "font-family:'Nunito',sans-serif;font-size:11px;color:#8A7E6A;line-height:1.5;margin-top:8px;";
    panel.appendChild(kbHint);

    // about section: one version + credit line, then the author cards
    panel.appendChild(this._sectionLabel(i18n.t('settings.about')));

    const aboutLine = document.createElement('div');
    aboutLine.style.cssText = "font-family:'Courier New',monospace; font-size:12px; text-align:center; letter-spacing:2px; margin-bottom:12px;";
    const aboutVersion = document.createElement('span');
    aboutVersion.textContent = i18n.t('settings.about_version');
    aboutVersion.style.color = '#00c864';
    aboutLine.appendChild(aboutVersion);
    const aboutBuiltBy = document.createElement('span');
    aboutBuiltBy.textContent = ' · ' + i18n.t('settings.about_built_by');
    aboutBuiltBy.style.color = '#666';
    aboutLine.appendChild(aboutBuiltBy);
    panel.appendChild(aboutLine);

    const authorsRow = document.createElement('div');
    authorsRow.style.cssText = 'display:flex; gap:12px; justify-content:center;';
    authorsRow.appendChild(this._authorCard('David Amariei', 'amarieidavid26-byte', i18n.t('settings.about_role_david')));
    authorsRow.appendChild(this._authorCard('Matei Vultur',  'mateivul',            i18n.t('settings.about_role_matei')));
    panel.appendChild(authorsRow);

    // close btn
    const closeBtn = document.createElement('button');
    closeBtn.textContent = i18n.t('settings.close');
    closeBtn.style.cssText = `
        display:block; margin:28px auto 0; padding:10px 28px;
        font-family:'Courier New',monospace; font-size:14px; color:#aaa;
        background:rgba(255,255,255,0.05);
        border:1px solid rgba(255,255,255,0.12); border-radius:4px;
        cursor:pointer; letter-spacing:2px;
        transition:border-color 0.15s, color 0.15s, box-shadow 0.15s;
    `;
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = '#00c864';
      closeBtn.style.borderColor = '#00c864';
      closeBtn.style.boxShadow = '0 0 12px rgba(0,200,100,0.25)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = '#aaa';
      closeBtn.style.borderColor = 'rgba(255,255,255,0.12)';
      closeBtn.style.boxShadow = 'none';
    });
    closeBtn.addEventListener('click', () => this.hide());
    panel.appendChild(closeBtn);

    document.body.appendChild(root);
  }

  // public api

  // starea contului WHOOP vine din stream-ul biometric_update, nu doar din click-ul local
  refreshWhoopRow() {
    if (!this._whoopBtn) return;
    const connected = isWhoopConnected();
    this._whoopHint.textContent = connected ? i18n.t('whoop.connected_hint') : i18n.t('whoop.hint');
    this._whoopBtn.textContent = connected ? i18n.t('whoop.disconnect') : i18n.t('whoop.connect');
    const color = connected ? '#FF7A6A' : '#6AD89A';
    this._whoopBtn.style.color = color;
    this._whoopBtn.style.border = '1px solid ' + color;
    // onmouse* (assignable), not addEventListener: refreshWhoopRow re-runs and must not stack
    this._whoopBtn.onmouseenter = () => { this._whoopBtn.style.background = color + '22'; };
    this._whoopBtn.onmouseleave = () => { this._whoopBtn.style.background = 'rgba(255,255,255,0.05)'; };
  }

  show() {
    this._visible = true;
    if (this._whoopSection) {
      this._whoopSection.style.display = getFeatures().whoop ? '' : 'none';
      this.refreshWhoopRow();
    }
    this._renderFeatureRows();
    this._root.style.visibility = 'visible';
    void this._root.offsetWidth;
    this._root.style.opacity = '1';
  }

  hide() {
    this._visible = false;
    this._root.style.opacity = '0';
    setTimeout(() => {
      this._root.style.visibility = 'hidden';
    }, 200);
  }

  toggle() { this._visible ? this.hide() : this.show(); }

  onVolumeChange(callback) {
    this._volumeCb = callback;
  }

  onMuteToggle(callback) {
    this._muteCb = callback;
  }

  destroy() {
    if (this._spotifyUnsub) { try { this._spotifyUnsub(); } catch (_) {} this._spotifyUnsub = null; }
    this._root.remove();
  }

  _renderFeatureRows() {
    if (!this._featuresRows) return;
    this._featuresRows.innerHTML = '';
    const features = getFeatures();
    for (const flag of FEATURE_FLAGS) {
      const on = !!features[flag];
      const row = this._row();
      const dot = document.createElement('span');
      dot.style.cssText = `width:8px; height:8px; border-radius:50%; margin-right:10px; flex-shrink:0;
        background:${on ? '#6AD89A' : '#555'};
        box-shadow:${on ? '0 0 8px rgba(106,216,154,0.6)' : 'none'};`;
      row.appendChild(dot);
      const name = this._label(i18n.t(`settings.feature.${flag}`));
      name.style.flex = '1';
      row.appendChild(name);
      const state = this._label(on ? i18n.t('settings.feature_on') : i18n.t('settings.feature_off'));
      state.style.fontSize = '12px';
      state.style.color = on ? '#6AD89A' : '#666';
      row.appendChild(state);
      this._featuresRows.appendChild(row);
    }
  }

  _renderSpotifyRow() {
    if (!this._spotifyRow) return;
    this._spotifyRow.innerHTML = '';
    const connected = Spotify.isConnected();
    const name = Spotify.getDisplayName();

    const status = document.createElement('div');
    status.style.cssText = "font-family:'Courier New',monospace;font-size:12px;color:#aaa;";
    status.textContent = connected
      ? '🎵 ' + i18n.t('spotify.connected_as', { name: name || '—' })
      : i18n.t('spotify.not_connected');
    this._spotifyRow.appendChild(status);

    const btn = document.createElement('button');
    const accent = connected ? '#FF7A6A' : '#1DB954';
    btn.style.cssText = `padding:8px 16px;background:rgba(255,255,255,0.05);
      color:${accent};border:1px solid ${accent};border-radius:4px;cursor:pointer;
      font-family:'Courier New',monospace;font-size:12px;letter-spacing:1px;
      transition:background 0.15s, color 0.15s;`;
    btn.textContent = connected ? i18n.t('spotify.disconnect') : i18n.t('spotify.connect');
    btn.addEventListener('mouseenter', () => { btn.style.background = `${accent}22`; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.05)'; });
    btn.addEventListener('click', () => {
      if (connected) Spotify.disconnect();
      else Spotify.beginAuth().catch(e => alert('Spotify: ' + e.message));
    });
    this._spotifyRow.appendChild(btn);

    const err = Spotify.getLastError();
    if (err) {
      const errEl = document.createElement('div');
      errEl.style.cssText = "font-family:'Courier New',monospace;font-size:10px;color:#FF7A6A;";
      errEl.textContent = err;
      this._spotifyRow.appendChild(errEl);
    }
  }

  // internal helpers

  // helper for section headers, kinda overkill but whatever
  _heading(text, styles) {
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
      fontFamily: "'Courier New', monospace",
      ...styles,
    });
    return el;
  }

  _sectionLabel(text) {
    const el = document.createElement('div');
    el.style.cssText = `
        font-family:'Courier New',monospace; font-size:11px; color:#7a7a7a;
        letter-spacing:3px; border-bottom:1px solid rgba(255,255,255,0.06);
        padding-bottom:6px; margin-top:18px; margin-bottom:14px;
        display:flex; align-items:center; gap:8px;
    `;
    const dot = document.createElement('span');
    dot.style.cssText = 'width:5px; height:5px; border-radius:50%; background:#00c864; box-shadow:0 0 8px rgba(0,200,100,0.6); flex-shrink:0;';
    el.appendChild(dot);
    const label = document.createElement('span');
    label.textContent = text;
    el.appendChild(label);
    return el;
  }

  _row() {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex; align-items:center; margin-bottom:6px;';
    return el;
  }

  _label(text) {
    const el = document.createElement('span');
    el.textContent = text;
    Object.assign(el.style, {
      fontFamily: "'Courier New', monospace",
      fontSize: '14px',
      color: '#aaa',
    });
    return el;
  }

  // Mini author-credit card: name, @github handle (clickable), and a short role line.
  _authorCard(name, handle, role) {
    const card = document.createElement('a');
    card.href = `https://github.com/${handle}`;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.style.cssText = `flex:1; max-width:200px; padding:12px 14px;
      background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06);
      border-radius:6px; text-align:center; text-decoration:none;
      transition:border-color 0.18s, background 0.18s, transform 0.18s;`;
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'rgba(0,200,100,0.4)';
      card.style.background  = 'rgba(0,200,100,0.06)';
      card.style.transform   = 'translateY(-1px)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'rgba(255,255,255,0.06)';
      card.style.background  = 'rgba(255,255,255,0.03)';
      card.style.transform   = 'translateY(0)';
    });

    const nameEl = document.createElement('div');
    nameEl.textContent = name;
    nameEl.style.cssText = "font-family:'Nunito',sans-serif; font-size:13px; font-weight:700; color:#e0e0e0; margin-bottom:2px;";
    card.appendChild(nameEl);

    const handleEl = document.createElement('div');
    handleEl.textContent = '@' + handle;
    handleEl.style.cssText = "font-family:'Courier New',monospace; font-size:10px; color:#00c864; margin-bottom:4px;";
    card.appendChild(handleEl);

    const roleEl = document.createElement('div');
    roleEl.textContent = role;
    roleEl.style.cssText = "font-family:'Nunito',sans-serif; font-size:10px; color:#777; line-height:1.4;";
    card.appendChild(roleEl);

    return card;
  }
}
