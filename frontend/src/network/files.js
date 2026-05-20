// Thin client for the local backend file API. All calls carry the session token.
import { CONFIG } from '../config.js';
import { authHeaders } from './session.js';

const base = () => CONFIG.BACKEND_URL;

async function _json(r) {
    if (!r.ok) {
        let detail = r.status;
        try { detail = (await r.json()).error || detail; } catch (_) {}
        throw new Error(String(detail));
    }
    return r.json();
}

export function listDir(path = '') {
    return fetch(`${base()}/api/files/tree?path=${encodeURIComponent(path)}`, { headers: authHeaders() }).then(_json);
}

export function readFile(path) {
    return fetch(`${base()}/api/files/read?path=${encodeURIComponent(path)}`, { headers: authHeaders() }).then(_json);
}

export function writeFile(path, content) {
    return fetch(`${base()}/api/files/write`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ path, content }),
    }).then(_json);
}

export function createPath(path, kind = 'file') {
    return fetch(`${base()}/api/files/create`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ path, kind }),
    }).then(_json);
}

export function renamePath(src, dst) {
    return fetch(`${base()}/api/files/rename`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ src, dst }),
    }).then(_json);
}

export function deletePath(path) {
    return fetch(`${base()}/api/files/delete`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ path }),
    }).then(_json);
}
