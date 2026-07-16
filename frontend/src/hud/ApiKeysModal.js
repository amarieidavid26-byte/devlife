// standalone "API keys" (BYOK) modal, opened from the settings menu and the dashboard
// topbar. Talks to GET/POST /api/settings: session token required, responses masked
// (source + last 4 chars) — the full key never reaches the frontend.

import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';
import { authHeaders, initSession } from '../network/session.js';

const FIELDS = [
    { key: 'claude_api_key',      labelKey: 'apikeys.claude_key',   placeholder: 'sk-ant-...' },
    { key: 'whoop_client_id',     labelKey: 'apikeys.whoop_id',     placeholder: '' },
    { key: 'whoop_client_secret', labelKey: 'apikeys.whoop_secret', placeholder: '' },
];

let _el = null;
let _refs = null;

function injectStyles() {
    if (document.getElementById('devlife-apikeys-css')) return;
    const s = document.createElement('style');
    s.id = 'devlife-apikeys-css';
    s.textContent = `
#devlife-apikeys {
    position:fixed;inset:0;z-index:10005;
    display:flex;align-items:center;justify-content:center;
    background:rgba(12,9,5,0.72);backdrop-filter:blur(3px);
}
#devlife-apikeys .ak-card {
    width:min(460px,90vw);padding:22px 24px;
    background:#1E1810;border:1px solid rgba(255,228,181,0.18);border-radius:10px;
    box-shadow:0 18px 60px rgba(0,0,0,0.5);color:#F5F0E8;
}
#devlife-apikeys .ak-title { font-family:'Fredoka',sans-serif;font-size:16px;margin-bottom:6px; }
#devlife-apikeys .ak-privacy { font-family:'Nunito',sans-serif;font-size:11px;color:#8A7E6A;line-height:1.5;margin-bottom:14px; }
#devlife-apikeys .ak-field { margin-bottom:12px; }
#devlife-apikeys .ak-field label {
    display:flex;align-items:center;gap:8px;
    font-family:'Nunito',sans-serif;font-size:11px;color:#B8A88C;
    text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;
}
#devlife-apikeys .ak-status { font-family:'JetBrains Mono',monospace;font-size:10px;color:#8A7E6A;text-transform:none;letter-spacing:0; }
#devlife-apikeys .ak-clear { color:#FF7A6A;text-decoration:none;font-size:10px;margin-left:auto; }
#devlife-apikeys .ak-field input {
    width:100%;box-sizing:border-box;padding:7px 10px;
    background:rgba(255,228,181,0.05);border:1px solid rgba(255,228,181,0.15);border-radius:5px;
    color:#F5F0E8;font-family:'JetBrains Mono',monospace;font-size:12px;outline:none;
}
#devlife-apikeys .ak-field input:focus { border-color:rgba(255,228,181,0.4); }
#devlife-apikeys .ak-hint { font-family:'Nunito',sans-serif;font-size:10px;color:#6A5E4C;margin:2px 0 12px; }
#devlife-apikeys .ak-actions { display:flex;align-items:center;gap:10px; }
#devlife-apikeys .ak-actions button {
    padding:6px 16px;border-radius:5px;cursor:pointer;
    font-family:'Fredoka',sans-serif;font-size:12px;
    background:#B8A88C;border:1px solid #B8A88C;color:#1E1810;
}
#devlife-apikeys .ak-actions button.ghost { background:transparent;color:#B8A88C; }
#devlife-apikeys .ak-msg { font-family:'Nunito',sans-serif;font-size:11px;color:#6AD89A; }
#devlife-apikeys .ak-msg.err { color:#FF7A6A; }
`;
    document.head.appendChild(s);
}

function build() {
    injectStyles();
    _el = document.createElement('div');
    _el.id = 'devlife-apikeys';
    _el.style.display = 'none';

    const fieldsHtml = FIELDS.map((f, i) => `
        <div class="ak-field">
            <label><span data-ak-label="${f.labelKey}"></span>
                <span class="ak-status" data-ak-status="${f.key}"></span>
                <a href="#" class="ak-clear" data-ak-clear="${f.key}" style="display:none">&#10005;</a></label>
            <input type="password" data-ak-input="${f.key}" autocomplete="off" spellcheck="false"
                   placeholder="${f.placeholder}">
        </div>`).join('');

    _el.innerHTML = `
    <div class="ak-card">
        <div class="ak-title">&#9881; <span data-ak-label="apikeys.title"></span></div>
        <div class="ak-privacy" data-ak-label="apikeys.privacy"></div>
        ${fieldsHtml}
        <div class="ak-hint" data-ak-label="apikeys.keep_hint"></div>
        <div class="ak-actions">
            <button data-ak-save data-ak-label="apikeys.save"></button>
            <button class="ghost" data-ak-close data-ak-label="apikeys.close"></button>
            <span class="ak-msg" data-ak-msg></span>
        </div>
    </div>`;
    document.body.appendChild(_el);

    _refs = {
        msg: _el.querySelector('[data-ak-msg]'),
        fields: FIELDS.map(f => ({
            key: f.key,
            input:  _el.querySelector(`[data-ak-input="${f.key}"]`),
            status: _el.querySelector(`[data-ak-status="${f.key}"]`),
            clear:  _el.querySelector(`[data-ak-clear="${f.key}"]`),
        })),
    };

    _el.querySelector('[data-ak-close]').addEventListener('click', close);
    _el.addEventListener('click', (e) => { if (e.target === _el) close(); });

    _refs.fields.forEach(f => {
        f.clear.addEventListener('click', (e) => {
            e.preventDefault();
            save({ [f.key]: '' });
        });
    });

    _el.querySelector('[data-ak-save]').addEventListener('click', () => {
        const body = {};
        _refs.fields.forEach(f => {
            const v = f.input.value.trim();
            if (v) body[f.key] = v;
        });
        save(body);
    });
}

function localize() {
    _el.querySelectorAll('[data-ak-label]').forEach(el => {
        el.textContent = i18n.t(el.dataset.akLabel);
    });
    _refs.fields.forEach(f => { f.clear.title = i18n.t('apikeys.clear'); });
}

function renderStatus(data) {
    _refs.fields.forEach(f => {
        const s = data[f.key] || {};
        let label = i18n.t('apikeys.not_set');
        if (s.configured) {
            label = (s.source === 'app' ? i18n.t('apikeys.source_app') : i18n.t('apikeys.source_env'))
                  + (s.hint ? ' ' + s.hint : '');
        }
        f.status.textContent = '· ' + label;
        f.status.style.color = s.configured ? '#6AD89A' : '#8A7E6A';
        f.clear.style.display = s.source === 'app' ? '' : 'none';
    });
}

function fail() {
    _refs.msg.textContent = i18n.t('apikeys.error');
    _refs.msg.className = 'ak-msg err';
}

async function load() {
    try {
        await initSession(); // idempotent — guarantees the token exists even from the main menu
        const res = await fetch(`${CONFIG.BACKEND_URL}/api/settings`, { headers: authHeaders() });
        if (!res.ok) throw new Error('' + res.status);
        renderStatus(await res.json());
    } catch (e) {
        fail();
    }
}

async function save(body) {
    try {
        await initSession();
        const res = await fetch(`${CONFIG.BACKEND_URL}/api/settings`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('' + res.status);
        renderStatus(await res.json());
        _refs.fields.forEach(f => { f.input.value = ''; });
        _refs.msg.textContent = i18n.t('apikeys.saved');
        _refs.msg.className = 'ak-msg';
    } catch (e) {
        fail();
    }
}

function close() {
    _el.style.display = 'none';
}

// modalul sta peste meniul de setari (z-index 10005 vs 10001), deci ESC trebuie sa il
// inchida primul -- altfel se inchide setarile de dedesubt si modalul ramane orfan
export function isApiKeysModalOpen() {
    return !!_el && _el.style.display !== 'none';
}

export function closeApiKeysModal() {
    if (_el) close();
}

export function openApiKeysModal() {
    if (!_el) build();
    localize();
    _refs.msg.textContent = '';
    _refs.msg.className = 'ak-msg';
    _el.style.display = 'flex';
    load();
}
