# IDE local, terminal real & LSP — arhitectura

DevLife transforma editorul si terminalul din joc in unelte **reale**: editezi fisiere
de pe disc (ca VS Code/Cursor), rulezi un shell adevarat si primesti completari AI +
inteligenta de limbaj. Cheia: backend-ul FastAPI ruleaza **local**, deci are acces la
filesystem si subprocese. Browser-ul ramane un client subtire peste WebSocket — exact
modelul code-server / VS Code Server. Nu e nevoie de Electron.

## Componente

| Strat | Frontend | Backend |
|------|----------|---------|
| Editor | Monaco (bundled ESM) — `apps/monaco/monacoSetup.js`, `apps/CodeEditor.js` | — |
| Fisiere | file tree + taburi (`apps/ide/FileTree.js`), client `network/files.js` | `file_api.py`, rute `/api/files/*`, watch `/files/watch` (watchfiles) |
| Terminal | xterm.js (`apps/Terminal.js`) | `terminal_pty.py` (stdlib `pty`), WS `/terminal` |
| Inline AI | provider Monaco (`apps/ide/inlineCompletions.js`) | `inline_completer.py` (Claude Haiku, streaming), WS `/inline` |
| LSP | client JSON-RPC (`apps/ide/languageClient.js`) | `lsp_bridge.py` (pyright/tsserver), WS `/lsp/{language}` |

## Flux de date

```
Browser (Monaco / xterm)  <—WebSocket / HTTP—>  FastAPI local (127.0.0.1)
   editor model  ── /api/files/read|write ──>  file_api → disc (in WORKSPACE_ROOT)
   xterm onData  ── /terminal (binary) ─────>  PtySession → zsh real (PTY)
   ghost text    ── /inline (JSON stream) ──>  Claude Haiku (FIM)
   LSP JSON-RPC  ── /lsp/python ────────────>  pyright (stdio, framed)
```

## Model de securitate

Endpoint-urile privilegiate expun shell, scriere pe disc si subprocese LSP pe localhost.
Trei straturi le apara (vezi `security.py`):

1. **Bind pe `127.0.0.1`** (`config.HOST`) — fara expunere in LAN.
2. **Verificare Origin** la handshake-ul WS — browserul trimite mereu Origin si JS nu-l
   poate falsifica, deci un site malitios e respins (CORS nu acopera WebSocket-urile).
3. **Token de sesiune** per-proces, citit din `/api/session` (pe care CORS il face
   necitibil cross-origin) si atasat la fiecare apel privilegiat: `?token=` pentru WS,
   header `X-DevLife-Token` pentru HTTP.

In plus, `resolve_in_workspace()` rezolva orice cale si garanteaza ca ramane sub
`WORKSPACE_ROOT` (inclusiv impotriva symlink-urilor), iar OAuth-ul WHOOP foloseste un
`state` CSRF de unica folosinta.

**Pe deploy hostat** (Railway) toate aceste functii trebuie OPRITE prin flag-uri:
`TERMINAL_ENABLED` / `FILES_ENABLED` / `LSP_ENABLED` / `INLINE_AI_ENABLED = false`.

## Limitari oneste

- **Completarile inline** nu ating latenta Cursor (model propriu + infra dedicata). Cu
  debounce + Haiku + streaming obtii „foarte bun", nu „instant" (~1-2s pana la sugestie).
- **LSP**: oferim diagnostice, autocomplete si hover reale. Go-to-definition cross-file
  ar necesita un „editor opener" custom (Monaco simplu nu naviga intre fisiere) — in afara
  scopului actual. Necesita `pyright` / `typescript-language-server` instalate local.
- **Terminal / fisiere** = putere locala completa; sigur pentru un singur utilizator local
  (token + Origin + 127.0.0.1 + WORKSPACE_ROOT), niciodata de expus pe un host public.
