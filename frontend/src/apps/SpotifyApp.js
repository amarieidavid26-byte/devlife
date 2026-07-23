import { i18n } from '../i18n/index.js';

// The in-game speaker. Plays music through the official Spotify *embed* iframe, controlled via
// Spotify's Embed iFrame API. No Web API / OAuth dependency — the embed needs only that the user
// is logged into Spotify (Premium) in this browser for full-length tracks (otherwise 30s previews).

const EMBED_API_SRC = 'https://open.spotify.com/embed/iframe-api/v1';

// Stable Spotify-owned editorial playlists (widely embeddable).
const QUICK_PICKS = [
    { label: 'Lo-fi',      uri: 'spotify:playlist:37i9dQZF1DWWQRwui0ExPn' },
    { label: 'Deep Focus', uri: 'spotify:playlist:37i9dQZF1DWZeKCadgRdKQ' },
    { label: 'Top Hits',   uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' },
    { label: 'RapCaviar',  uri: 'spotify:playlist:37i9dQZF1DX0XUsuxWHRQd' },
];
const DEFAULT_URI = QUICK_PICKS[0].uri;

// Load the Embed iFrame API once and cache it (window.onSpotifyIframeApiReady fires only once).
let _iframeApiPromise = null;
function loadIframeApi() {
    if (window.__spotifyIframeApi) return Promise.resolve(window.__spotifyIframeApi);
    if (_iframeApiPromise) return _iframeApiPromise;
    _iframeApiPromise = new Promise((resolve) => {
        window.onSpotifyIframeApiReady = (IFrameAPI) => {
            window.__spotifyIframeApi = IFrameAPI;
            resolve(IFrameAPI);
        };
        const s = document.createElement('script');
        s.src = EMBED_API_SRC;
        s.async = true;
        s.onerror = () => resolve(null);
        document.body.appendChild(s);
    });
    return _iframeApiPromise;
}

// Accept a full URL (https://open.spotify.com/track/ID?...) or a URI (spotify:track:ID).
// Returns a normalized spotify:type:id URI or null.
function parseSpotifyUri(input) {
    const s = (input || '').trim();
    if (!s) return null;
    let m = s.match(/^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]+)/);
    if (m) return `spotify:${m[1]}:${m[2]}`;
    m = s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
    if (m) return `spotify:${m[1]}:${m[2]}`;
    return null;
}

function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class SpotifyApp {
    constructor(socket) {
        this.socket = socket;
        this.appType = 'spotify';
        this.isOpen = false;
        // fara capturesKeyboard: inghitea ESC, iar 1-5/WASD/E au deja garzile lor
        this.overlay = null;
        this.onClose = null;            // set by main.js -> closeAllApps (restores game state)
        this._controller = null;
        this._pendingUri = null;
        this._onKeyDown = null;
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;

        this.overlay = document.createElement('div');
        this.overlay.id = 'spotify-overlay';
        Object.assign(this.overlay.style, {
            position: 'fixed', inset: '0',
            background: 'rgba(8,10,20,0.92)',
            backdropFilter: 'blur(8px)', webkitBackdropFilter: 'blur(8px)',
            zIndex: '1000', display: 'flex', flexDirection: 'column', alignItems: 'center',
            pointerEvents: 'auto',
            fontFamily: "'Segoe UI', system-ui, sans-serif", color: '#e8e8ee',
        });
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown'].forEach((evt) =>
            this.overlay.addEventListener(evt, (e) => e.stopPropagation()));
        document.getElementById('app-overlay-root').appendChild(this.overlay);

        const panel = document.createElement('div');
        Object.assign(panel.style, {
            width: 'min(560px, 94vw)', marginTop: '5vh', maxHeight: '90vh',
            background: 'rgba(18,20,32,0.97)', borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        });
        this.overlay.appendChild(panel);

        // header
        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: '0',
        });
        const title = document.createElement('div');
        title.innerHTML = `<span style="font-size:18px">🎧</span> <span style="font-weight:700;letter-spacing:0.04em">${_esc(i18n.t('spotify.app_title'))}</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', 'close');
        Object.assign(closeBtn.style, {
            background: 'transparent', color: '#bbb', border: 'none', fontSize: '20px',
            cursor: 'pointer', lineHeight: '1', padding: '4px 8px',
        });
        closeBtn.addEventListener('click', () => this._requestClose());
        header.appendChild(title);
        header.appendChild(closeBtn);
        panel.appendChild(header);

        const body = document.createElement('div');
        Object.assign(body.style, { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' });
        panel.appendChild(body);

        // quick-pick playlist buttons
        const picksLabel = document.createElement('div');
        picksLabel.textContent = i18n.t('spotify.quickpicks');
        Object.assign(picksLabel.style, { fontSize: '11px', color: '#8a8a9a', letterSpacing: '0.06em', textTransform: 'uppercase' });
        body.appendChild(picksLabel);

        const picksRow = document.createElement('div');
        Object.assign(picksRow.style, { display: 'flex', flexWrap: 'wrap', gap: '8px' });
        for (const p of QUICK_PICKS) {
            const b = document.createElement('button');
            b.textContent = p.label;
            Object.assign(b.style, {
                padding: '8px 14px', background: 'rgba(29,185,84,0.14)', color: '#1ed760',
                border: '1px solid rgba(29,185,84,0.35)', borderRadius: '20px', cursor: 'pointer',
                fontSize: '13px', fontWeight: '600',
            });
            b.addEventListener('mouseenter', () => { b.style.background = 'rgba(29,185,84,0.26)'; });
            b.addEventListener('mouseleave', () => { b.style.background = 'rgba(29,185,84,0.14)'; });
            b.addEventListener('click', () => this._play(p.uri));
            picksRow.appendChild(b);
        }
        body.appendChild(picksRow);

        // paste-any-link row
        const pasteRow = document.createElement('div');
        Object.assign(pasteRow.style, { display: 'flex', gap: '8px' });
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = i18n.t('spotify.paste_placeholder');
        Object.assign(input.style, {
            flex: '1 1 auto', height: '40px', background: '#2a2a3e', color: '#fff', border: 'none',
            borderRadius: '20px', padding: '0 16px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
        });
        const playBtn = document.createElement('button');
        playBtn.textContent = i18n.t('spotify.paste_play');
        Object.assign(playBtn.style, {
            padding: '0 18px', height: '40px', background: '#1DB954', color: '#fff', border: 'none',
            borderRadius: '20px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', flexShrink: '0',
        });
        const submit = () => {
            const uri = parseSpotifyUri(input.value);
            if (!uri) { input.style.boxShadow = '0 0 0 2px #e07a7a'; input.placeholder = i18n.t('spotify.invalid_link'); input.value = ''; return; }
            input.style.boxShadow = 'none';
            this._play(uri);
        };
        playBtn.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        pasteRow.appendChild(input);
        pasteRow.appendChild(playBtn);
        body.appendChild(pasteRow);

        // the embed player (centerpiece)
        const embedTarget = document.createElement('div');
        body.appendChild(embedTarget);

        const note = document.createElement('div');
        note.textContent = i18n.t('spotify.login_for_full_tracks');
        Object.assign(note.style, { fontSize: '11px', color: '#8a8a9a', textAlign: 'center' });
        body.appendChild(note);

        this._initEmbed(embedTarget);

        // doar pentru cazul in care focusul e in campul de link: opreste propagarea ca sa
        // nu se inchida de doua ori. Cand focusul e in alta parte, ESC vine din cascada
        this._onKeyDown = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); this._requestClose(); }
        };
        this.overlay.addEventListener('keydown', this._onKeyDown);
    }

    _requestClose() {
        if (this.onClose) this.onClose(); else this.close();
    }

    _play(uri) {
        if (this._controller) {
            try { this._controller.loadUri(uri); this._controller.play(); } catch (_) {}
        } else {
            this._pendingUri = uri;
        }
    }

    async _initEmbed(target) {
        const IFrameAPI = await loadIframeApi();
        if (!IFrameAPI || !this.isOpen) return;
        IFrameAPI.createController(
            target,
            { uri: this._pendingUri || DEFAULT_URI, width: '100%', height: 380 },
            (controller) => {
                this._controller = controller;
                if (this._pendingUri) {
                    try { controller.loadUri(this._pendingUri); controller.play(); } catch (_) {}
                    this._pendingUri = null;
                }
            },
        );
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        if (this._controller) { try { this._controller.destroy(); } catch (_) {} this._controller = null; }
        if (this.overlay) {
            if (this._onKeyDown) this.overlay.removeEventListener('keydown', this._onKeyDown);
            this.overlay.remove();
            this.overlay = null;
        }
        this._onKeyDown = null;
        this._pendingUri = null;
    }
}
