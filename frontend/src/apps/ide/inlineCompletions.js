// Cursor-style inline (ghost-text) completions for Monaco, streamed from the backend
// /inline endpoint (Claude Haiku). Debounced, with stale requests cancelled. Tab accepts.
import { privilegedWsUrl, getFeatures } from '../../network/session.js';

const DEBOUNCE_MS = 180;
const LANGS = ['python', 'javascript', 'typescript', 'go', 'cpp', 'c', 'rust', 'java', 'json', 'html', 'css', 'shell', 'ruby', 'php'];

let ws = null;
let nextId = 1;
let debounceTimer = null;
let registered = false;
const pending = new Map(); // id -> { resolve, buffer }

function ensureWs() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return ws;
    ws = new WebSocket(privilegedWsUrl('/inline'));
    ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch (_) { return; }
        const p = pending.get(msg.id);
        if (!p) return;
        if (msg.delta) p.buffer += msg.delta;
        if (msg.done) { p.resolve(p.buffer); pending.delete(msg.id); }
    };
    ws.onclose = () => { ws = null; for (const p of pending.values()) p.resolve(''); pending.clear(); };
    ws.onerror = () => {};
    return ws;
}

function requestCompletion(prefix, suffix, language, path, token) {
    return new Promise((resolve) => {
        const sock = ensureWs();
        const id = nextId++;
        pending.set(id, { resolve, buffer: '' });
        const payload = JSON.stringify({ id, prefix, suffix, language, path });
        const send = () => {
            if (sock.readyState === WebSocket.OPEN) sock.send(payload);
            else if (sock.readyState === WebSocket.CONNECTING) sock.addEventListener('open', () => sock.send(payload), { once: true });
            else { pending.delete(id); resolve(''); }
        };
        send();
        if (token) token.onCancellationRequested(() => {
            if (pending.has(id)) { pending.delete(id); resolve(''); }
        });
    });
}

export function registerInlineCompletions(monaco) {
    if (registered || !getFeatures().inline_ai) return;
    registered = true;

    const provider = {
        async provideInlineCompletions(model, position, context, token) {
            const lastLine = model.getLineCount();
            const prefix = model.getValueInRange(new monaco.Range(1, 1, position.lineNumber, position.column));
            const suffix = model.getValueInRange(new monaco.Range(position.lineNumber, position.column, lastLine, model.getLineMaxColumn(lastLine)));
            if (!prefix.trim()) return { items: [] };

            // debounce; bail if cancelled (superseded keystroke) while waiting
            await new Promise((resolve) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(resolve, DEBOUNCE_MS);
                token.onCancellationRequested(() => { clearTimeout(debounceTimer); resolve(); });
            });
            if (token.isCancellationRequested) return { items: [] };

            const text = await requestCompletion(
                prefix.slice(-6000), suffix.slice(0, 2000), model.getLanguageId(), model.uri.path, token
            );
            if (!text || token.isCancellationRequested) return { items: [] };

            return {
                items: [{
                    insertText: text,
                    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                }],
            };
        },
        freeInlineCompletions() {},
    };

    for (const lang of LANGS) monaco.languages.registerInlineCompletionsProvider(lang, provider);
}
