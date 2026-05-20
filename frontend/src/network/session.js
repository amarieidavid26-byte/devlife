// Session token for the privileged local endpoints (terminal / files / lsp / inline AI).
// Fetched once on boot from /api/session — CORS keeps that response unreadable to any
// other origin, so only this app obtains the token. Attached to every privileged call:
// query param ?token= for WebSockets (browsers can't set WS headers) and the
// X-DevLife-Token header for HTTP.

import { CONFIG } from '../config.js';

let _token = null;
let _features = { terminal: false, files: false, lsp: false, inline_ai: false };
let _workspaceRoot = null;
let _ready = null;

export function initSession() {
    if (_ready) return _ready;
    _ready = fetch(CONFIG.BACKEND_URL + '/api/session', { credentials: 'omit' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('session ' + r.status))))
        .then((d) => {
            _token = d.token || null;
            if (d.features) _features = d.features;
            _workspaceRoot = d.workspace_root || null;
            return d;
        })
        .catch((e) => {
            // offline / backend down — privileged features simply stay disabled
            console.warn('[session] could not init:', e.message);
            return null;
        });
    return _ready;
}

export function getToken() {
    return _token;
}

export function getFeatures() {
    return _features;
}

export function getWorkspaceRoot() {
    return _workspaceRoot;
}

// ws://localhost:8000/ws  ->  ws://localhost:8000
function wsBase() {
    return CONFIG.WS_URL.replace(/\/ws$/, '');
}

// Build a token-authenticated WebSocket URL for a privileged endpoint, e.g.
// privilegedWsUrl('/terminal') -> ws://localhost:8000/terminal?token=...
export function privilegedWsUrl(path) {
    const base = wsBase() + path;
    if (!_token) return base;
    return base + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(_token);
}

export function authHeaders(extra = {}) {
    return _token ? { 'X-DevLife-Token': _token, ...extra } : { ...extra };
}
