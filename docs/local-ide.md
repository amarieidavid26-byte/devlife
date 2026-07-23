# IDE local, terminal real & LSP: arhitectura

DevLife transforma editorul si terminalul din joc in unelte **reale**: editezi fisiere
de pe disc (ca VS Code/Cursor) si rulezi un shell adevarat. Peste ele vin completarile AI
si inteligenta de limbaj (LSP). Cheia: backend-ul FastAPI ruleaza **local**, deci are acces la
filesystem si subprocese. Browser-ul ramane un client subtire peste WebSocket, exact
modelul code-server / VS Code Server. Nu e nevoie de Electron.

## Componente

| Strat | Frontend | Backend |
|------|----------|---------|
| Editor | Monaco (bundled ESM): `apps/monaco/monacoSetup.js`, `apps/CodeEditor.js` | - |
| Fisiere | file tree + taburi (`apps/ide/FileTree.js`), client `network/files.js` | `file_api.py`, rute `/api/files/*`, watch `/files/watch` (watchfiles) |
| Terminal | xterm.js (`apps/Terminal.js`) | `terminal_pty.py` (stdlib `pty`), WS `/terminal` |
| Inline AI | provider Monaco (`apps/ide/inlineCompletions.js`) | `inline_completer.py` (Claude Haiku cu streaming, **state-aware**), WS `/inline` |
| LSP | client JSON-RPC (`apps/ide/languageClient.js`) | `lsp_bridge.py` (pyright/tsserver), WS `/lsp/{language}` |
| Full VS Code | iframe overlay în `apps/CodeEditor.js` | `code_server.py` + `POST /api/codeserver/start` (code-server, local-only) |
| Demo offline | `network/offlineBiometrics.js` | - (client-side; oglindește presetele mock) |

**Biometric Cursor:** completările inline primesc starea cognitivă live (`bio.current_state` +
`estimated_stress`) și se calibrează: prudente, safety-first în FATIGUED/STRESSED; minimale în
DEEP_FOCUS. Asta e diferențiatorul față de Cursor: editorul îți cunoaște corpul.

**Open in full VS Code:** butonul lansează `code-server --auth none --bind-addr 127.0.0.1:<port>
<WORKSPACE_ROOT>` și îl afișează într-un iframe. E un escape-hatch „power". Ghost-ul NU vede ce
scrii acolo (e iframe opac); magia biometric-Cursor stă în editorul Monaco implicit. Necesită
`CODE_SERVER_ENABLED=true` + code-server instalat; degradează grațios (hint de instalare) altfel.

**Demo offline:** fara backend, biometricele sunt simulate client-side
(`network/offlineBiometrics.js`). Starile (1-5), HUD-ul, ghost-ul si ECG-ul functioneaza
complet; doar replicile AI ale ghost-ului au nevoie de backend.

## Setup local

Toate functiile de aici sunt OFF by default. Le pornesti din `.env` (vezi `.env.example`):
`TERMINAL_ENABLED`, `FILES_ENABLED`, `LSP_ENABLED`, `INLINE_AI_ENABLED`,
`CODE_SERVER_ENABLED`. Starea curenta a flag-urilor se vede in joc, in Settings, sectiunea
"functii locale" (doar afisare; activarea ramane exclusiv in `.env`).

Workspace-ul e implicit `./workspace`. Pointeaza-l catre un proiect real cu
`WORKSPACE_ROOT=/cale/catre/proiect` in `.env`; accesul la fisiere ramane limitat la acest
director.

LSP (optional): instaleaza serverele local cu `pip install pyright` (Python) si
`npm i -g typescript-language-server typescript` (JS/TS). Daca lipsesc, editorul merge
fara diagnostice si autocomplete LSP.

code-server (optional): instalare o singura data cu
`curl -fsSL https://code-server.dev/install.sh | sh`, apoi `CODE_SERVER_ENABLED=true` in
`.env`.

## Flux de date

```
Browser (Monaco / xterm)  <--WebSocket / HTTP-->  FastAPI local (127.0.0.1)
   editor model  ── /api/files/read|write ──>  file_api → disc (in WORKSPACE_ROOT)
   xterm onData  ── /terminal (binary) ─────>  PtySession → zsh real (PTY)
   ghost text    ── /inline (JSON stream) ──>  Claude Haiku (FIM)
   LSP JSON-RPC  ── /lsp/python ────────────>  pyright (stdio, framed)
```

## Model de securitate

Endpoint-urile privilegiate expun shell, scriere pe disc si subprocese LSP pe localhost.
Trei straturi le apara (vezi `security.py`):

1. **Bind pe `127.0.0.1`** (`config.HOST`): fara expunere in LAN.
2. **Verificare Origin** la handshake-ul WS: browserul trimite mereu Origin si JS nu-l
   poate falsifica, deci un site malitios e respins (CORS nu acopera WebSocket-urile).
3. **Token de sesiune** per-proces, citit din `/api/session` (pe care CORS il face
   necitibil cross-origin) si atasat la fiecare apel privilegiat: `?token=` pentru WS,
   header `X-DevLife-Token` pentru HTTP.

Peste cele trei straturi, `resolve_in_workspace()` rezolva orice cale si garanteaza ca ramane sub
`WORKSPACE_ROOT` (inclusiv impotriva symlink-urilor), iar OAuth-ul WHOOP foloseste un
`state` CSRF de unica folosinta.

**Pe deploy hostat** (Railway) toate aceste functii trebuie OPRITE. Sunt insa OFF
**by default** (fail-safe), deci e suficient sa NU setezi flag-urile in env:
`TERMINAL_ENABLED` / `FILES_ENABLED` / `LSP_ENABLED` / `INLINE_AI_ENABLED` / `CODE_SERVER_ENABLED`.
`ALLOWED_ORIGINS` pe Railway = exact originea frontend-ului, **fara slash final**
(`https://<domeniu-frontend>.railway.app`, nu `.../`), altfel CORS + verificarea Origin pe
WebSocket resping frontend-ul.

## Limitari oneste

- **Completarile inline** nu ating latenta Cursor (model propriu + infra dedicata). Cu
  debounce + Haiku + streaming obtii „foarte bun", nu „instant" (~1-2s pana la sugestie).
- **LSP**: oferim diagnostice, autocomplete si hover reale. Go-to-definition cross-file
  ar necesita un „editor opener" custom (Monaco simplu nu naviga intre fisiere), in afara
  scopului actual. Necesita `pyright` / `typescript-language-server` instalate local.
- **Terminal / fisiere** = putere locala completa; sigur pentru un singur utilizator local
  (token + Origin + 127.0.0.1 + WORKSPACE_ROOT), niciodata de expus pe un host public.
