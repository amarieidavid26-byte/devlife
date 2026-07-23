// Spotify Web Playback SDK + PKCE OAuth in a single client-side singleton.
// No backend required — the SDK runs in the browser, PKCE keeps the client secret out of the SPA.
// Requires: a Spotify dev app (developer.spotify.com) with `VITE_SPOTIFY_CLIENT_ID` set
// and the current origin (plus a trailing slash) registered as a Redirect URI.

const SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
].join(' ');

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const API_BASE = 'https://api.spotify.com/v1';
const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

const LS = {
    access: 'spotify_access_token',
    refresh: 'spotify_refresh_token',
    expiresAt: 'spotify_expires_at',
    verifier: 'spotify_pkce_verifier',
    state: 'spotify_oauth_state',
    displayName: 'spotify_display_name',
};

function _redirectUri() {
    // origin + trailing slash; must EXACTLY match the dev-dashboard registration
    return window.location.origin + '/';
}

function _b64url(bytes) {
    let s = btoa(String.fromCharCode(...bytes));
    return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function _sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return new Uint8Array(buf);
}

function _randomString(n = 64) {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    return _b64url(bytes).slice(0, n);
}

class SpotifyService {
    constructor() {
        this.clientId = (import.meta.env.VITE_SPOTIFY_CLIENT_ID || '').trim();
        this._player = null;
        this._playerPromise = null;   // in-flight Player init (deduped across rapid clicks)
        this._deviceId = null;
        this._sdkReady = null;        // promise: resolves when SDK script + onSpotifyWebPlaybackSDKReady fired
        this._displayName = localStorage.getItem(LS.displayName) || '';
        this._listeners = new Set();
        this._isPaused = true;
        this._volume = 0.5;   // tracked so Settings volume + mute can drive the SDK
        this._lastError = null;
    }

    isConfigured() { return !!this.clientId; }

    isConnected() {
        return !!(this.clientId && localStorage.getItem(LS.access));
    }

    getDisplayName() { return this._displayName; }

    getLastError() { return this._lastError; }

    onChange(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    _emit() {
        for (const fn of this._listeners) { try { fn(this); } catch (_) {} }
    }

    // ---- PKCE auth flow ----

    async beginAuth() {
        if (!this.clientId) throw new Error('VITE_SPOTIFY_CLIENT_ID not set');
        // Spotify respinge redirect URI-urile `localhost` si cere `127.0.0.1`. Daca jocul e
        // deschis pe localhost, redirect_uri-ul derivat (origin + '/') nu se potriveste cu
        // cel inregistrat si Spotify raspunde cu o pagina goala "redirect_uri Not matching".
        if (window.location.hostname === 'localhost') {
            throw new Error('deschide jocul pe http://127.0.0.1:' + (window.location.port || '5173') +
                ' (nu localhost) — Spotify respinge redirect URI-urile localhost');
        }
        const verifier = _randomString(64);
        const challengeBytes = await _sha256(verifier);
        const challenge = _b64url(challengeBytes);
        const state = _randomString(24);
        localStorage.setItem(LS.verifier, verifier);
        localStorage.setItem(LS.state, state);

        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: _redirectUri(),
            code_challenge_method: 'S256',
            code_challenge: challenge,
            scope: SCOPES,
            state,
        });
        window.location.assign(`${AUTH_URL}?${params.toString()}`);
    }

    // Called from main.js on boot if the URL carries ?code=. Cleans the URL on success.
    async completeAuthFromUrl() {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        const authError = url.searchParams.get('error');

        if (authError) {
            this._lastError = `Spotify auth: ${authError}`;
            _cleanUrl();
            return false;
        }
        if (!code) return false;

        const expectedState = localStorage.getItem(LS.state);
        const verifier = localStorage.getItem(LS.verifier);
        localStorage.removeItem(LS.state);
        localStorage.removeItem(LS.verifier);

        if (!expectedState || expectedState !== returnedState || !verifier) {
            this._lastError = 'Spotify auth: state mismatch';
            _cleanUrl();
            return false;
        }

        try {
            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: _redirectUri(),
                client_id: this.clientId,
                code_verifier: verifier,
            });
            const r = await fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });
            if (!r.ok) {
                const txt = await r.text().catch(() => '');
                this._lastError = `Spotify token exchange failed (${r.status}): ${txt}`;
                _cleanUrl();
                return false;
            }
            const data = await r.json();
            this._storeTokens(data);
            await this._fetchProfile();
            _cleanUrl();
            this._emit();
            return true;
        } catch (e) {
            this._lastError = `Spotify token exchange: ${e.message}`;
            _cleanUrl();
            return false;
        }
    }

    _storeTokens(data) {
        localStorage.setItem(LS.access, data.access_token);
        if (data.refresh_token) localStorage.setItem(LS.refresh, data.refresh_token);
        const expiresAt = Date.now() + (data.expires_in * 1000) - 5000; // 5s safety
        localStorage.setItem(LS.expiresAt, String(expiresAt));
    }

    async _refresh() {
        const refresh = localStorage.getItem(LS.refresh);
        if (!refresh) throw new Error('no refresh token');
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refresh,
            client_id: this.clientId,
        });
        const r = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (!r.ok) throw new Error(`refresh failed ${r.status}`);
        const data = await r.json();
        this._storeTokens(data);
        return data.access_token;
    }

    async _getValidToken() {
        const access = localStorage.getItem(LS.access);
        const expiresAt = parseInt(localStorage.getItem(LS.expiresAt) || '0', 10);
        if (access && Date.now() < expiresAt) return access;
        return await this._refresh();
    }

    async _fetchProfile() {
        try {
            const r = await this._api('/me', { method: 'GET' });
            if (r.ok) {
                const me = await r.json();
                this._displayName = me.display_name || me.id || '';
                localStorage.setItem(LS.displayName, this._displayName);
            }
        } catch (_) { /* non-fatal */ }
    }

    // Authenticated fetch with one transparent refresh on 401.
    async _api(path, opts = {}) {
        const doFetch = async (token) => fetch(API_BASE + path, {
            ...opts,
            headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token },
        });
        let token = await this._getValidToken();
        let r = await doFetch(token);
        if (r.status === 401) {
            try {
                token = await this._refresh();
                r = await doFetch(token);
            } catch (e) {
                this.disconnect();
                throw e;
            }
        }
        return r;
    }

    // ---- Web API: search ----

    // Search tracks. Returns a tidy array for the in-game player UI. Requires a connected
    // user token (the speaker overlay shows a Connect button when not connected).
    async search(query, { limit = 20 } = {}) {
        const q = (query || '').trim();
        if (!q) return [];
        const params = new URLSearchParams({ q, type: 'track', limit: String(limit) });
        const r = await this._api('/search?' + params.toString(), { method: 'GET' });
        if (!r.ok) {
            this._lastError = `Spotify search failed (${r.status})`;
            return [];
        }
        const data = await r.json();
        const items = (data.tracks && data.tracks.items) || [];
        return items.map((t) => ({
            uri: t.uri,
            id: t.id,
            name: t.name,
            artists: (t.artists || []).map((a) => a.name).join(', '),
            albumArt: (t.album && t.album.images && t.album.images.length)
                ? t.album.images[t.album.images.length - 1].url   // smallest image
                : null,
            durationMs: t.duration_ms || 0,
        }));
    }

    // ---- Web Playback SDK ----

    _loadSdk() {
        if (this._sdkReady) return this._sdkReady;
        this._sdkReady = new Promise((resolve, reject) => {
            // SDK calls window.onSpotifyWebPlaybackSDKReady once it has loaded
            window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
            if (window.Spotify) { resolve(window.Spotify); return; }
            const s = document.createElement('script');
            s.src = SDK_URL;
            s.async = true;
            s.onerror = () => reject(new Error('failed to load Spotify SDK'));
            document.head.appendChild(s);
        });
        return this._sdkReady;
    }

    async ensurePlayer() {
        if (!this.isConnected()) throw new Error('not connected');
        if (this._player) return this._player;
        // cache the in-flight promise so a second click while the SDK boots
        // doesn't spawn a second Player
        if (this._playerPromise) return this._playerPromise;
        this._playerPromise = this._buildPlayer().catch((e) => {
            this._playerPromise = null;
            throw e;
        });
        return this._playerPromise;
    }

    async _buildPlayer() {
        const Spotify = await this._loadSdk();
        return new Promise((resolve, reject) => {
            const player = new Spotify.Player({
                name: 'DevLife — room speaker',
                getOAuthToken: (cb) => this._getValidToken().then(cb).catch(() => cb('')),
                volume: this._volume,
            });
            player.addListener('ready', ({ device_id }) => {
                this._deviceId = device_id;
                this._player = player;
                this._emit();
                resolve(player);
            });
            player.addListener('not_ready', () => { this._deviceId = null; this._emit(); });
            player.addListener('player_state_changed', (state) => {
                if (!state) return;
                this._isPaused = !!state.paused;
                this._emit();
            });
            player.addListener('authentication_error', ({ message }) => {
                this._lastError = `auth: ${message}`;
                this.disconnect();
                reject(new Error(this._lastError));
            });
            player.addListener('account_error', ({ message }) => {
                this._lastError = `Premium required: ${message}`;
                this._emit();
                reject(new Error(this._lastError));
            });
            player.addListener('initialization_error', ({ message }) => {
                this._lastError = `init: ${message}`;
                this._emit();
                reject(new Error(this._lastError));
            });
            player.connect().catch(reject);
        });
    }

    isPaused() { return this._isPaused; }

    // 0..1 — propagated to the SDK player if it exists; cached otherwise so the next
    // ensurePlayer() can apply it.
    async setVolume(v) {
        this._volume = Math.max(0, Math.min(1, Number(v) || 0));
        if (this._player) {
            try { await this._player.setVolume(this._volume); } catch (_) {}
        }
    }

    // Resume / start playback. If nothing's queued anywhere, asks user to queue first.
    // Returns { ok, paused, hint? }.
    async togglePlay() {
        const player = await this.ensurePlayer();
        if (!this._deviceId) {
            return { ok: false, paused: true, hint: 'spotify_device_not_ready' };
        }
        const state = await player.getCurrentState();
        if (state) {
            // we have a context — flip
            if (state.paused) await player.resume(); else await player.pause();
            this._isPaused = !state.paused ? false : true;
            this._emit();
            return { ok: true, paused: this._isPaused };
        }
        // no active context on this device yet — transfer + play (resumes user's last context)
        const transfer = await this._api('/me/player', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_ids: [this._deviceId], play: true }),
        });
        if (transfer.status === 404) {
            // nothing to resume — Spotify has no recent context for this user
            return { ok: false, paused: true, hint: 'spotify_no_context' };
        }
        if (!transfer.ok && transfer.status !== 204) {
            return { ok: false, paused: true, hint: 'spotify_transfer_failed' };
        }
        this._isPaused = false;
        this._emit();
        return { ok: true, paused: false };
    }

    disconnect() {
        try { if (this._player) this._player.disconnect(); } catch (_) {}
        this._player = null;
        this._playerPromise = null;
        this._deviceId = null;
        this._displayName = '';
        this._isPaused = true;
        Object.values(LS).forEach(k => localStorage.removeItem(k));
        this._emit();
    }
}

function _cleanUrl() {
    try {
        const u = new URL(window.location.href);
        u.searchParams.delete('code');
        u.searchParams.delete('state');
        u.searchParams.delete('error');
        window.history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
    } catch (_) { /* ignore */ }
}

export const Spotify = new SpotifyService();
