# security checklist (T04)

| item | status | unde |
|------|--------|------|
| CORS restrictat la origini cunoscute | ✅ | `server.py`: `ALLOWED_ORIGINS` din config/env, nu mai e `*` |
| Validare input Pydantic pe POST endpoints | ✅ | `MockStateBody` (state 1-5), `FeedbackBody` (action max 100 chars), `PatchContract`, `PatchHashBody` |
| Rate limiting pe endpoints sensibile | ✅ | `slowapi`, 30 req/min pe `/api/biometric/mock` |
| Logging prin `logging` module, nu `print()` | ✅ | `server.py`, `ghost_brain.py`, `biometric_engine.py`, `content_analyzer.py` |
| API keys nu apar in logs | ✅ | logurile nu includ `CLAUDE_API_KEY`, `WHOOP_CLIENT_SECRET`, OAuth `code` |
| `.env` in `.gitignore` | ✅ | `.gitignore`, confirmat |
| `.env.example` committed fara valori reale | ✅ | `devlife/.env.example` |
| Error handling pe Claude API call | ✅ | `ghost_brain.py`, `content_analyzer.py`: try/except, returneaza `None`/fallback |
| WS payload: tipuri verificate | ✅ | `isinstance(data, dict)` + validare `state_num in [1..5]` |
| Input sanitizare cod user (max length) | ✅ | `WS_MAX_CONTENT_CHARS=50000`, `WS_MAX_ACTION_CHARS=100`, `WS_MAX_KWARG_CHARS=500`, `app_type` validat impotriva `WS_VALID_APP_TYPES` |
| Timeout explicit pe Claude API | ✅ | `ghost_brain.py` si `content_analyzer.py`: clientul `Anthropic` instantiat cu `timeout=15.0` (secunde) |
| Atacuri injection in risky patterns | ✅ | `content_analyzer.py`: 11 regex patterns pentru comenzi periculoase |
| Apply Fix patch validator | ✅ | `apply_fix/validator.py`: max 500 linii, reject metacaractere shell (`os.system`, `subprocess.`, `;rm`, backticks, `$()`), rationale obligatoriu non-vid, range consistency |
| OAuth state parameter (CSRF) | ✅ | `security.py`: `new_state()` emite un state semnat HMAC (timestamp + nonce), single-use; `consume_state()` in callback-ul din `server.py` respinge state expirat, reutilizat sau falsificat |
| SQLite prepared statements (anti SQL injection) | ✅ | `persistence/db.py`: toate query-urile folosesc parameter binding (`?`), niciodata string concatenation |
| Healthcheck endpoints (anti-leak) | ✅ | `/health` returneaza minimal info; `/ready` returneaza 503 daca lipsesc dependinte critice |
| Audit log pentru Apply Fix | ✅ | `apply_fix/audit.py`: fiecare actiune (preview, confirm, rollback, reject) inregistrata in `apply_fix_audit` |
| Session token per-proces pe rutele privilegiate | ✅ | `security.py`: `SESSION_TOKEN` (`secrets.token_urlsafe(32)`, regenerat la fiecare pornire), `verify_token()` cu `compare_digest`; `server.py::require_token` citeste header-ul `X-DevLife-Token` pe `/api/settings`, `/api/whoop/disconnect`, `/api/files/*`, `/api/codeserver/start` |
| Origin check pe handshake-ul WebSocket | ✅ | `security.py::check_origin`, apelat in `server.py` la fiecare handshake WS: origin necunoscut e respins (blocheaza site-uri malitioase care ar vorbi cu localhost); lipsa header-ului Origin (client non-browser, ex. extensia VS Code) e permisa, privilegiile raman pe token |
| Workspace jail pe operatiile de fisiere | ✅ | `security.py::resolve_in_workspace`: orice cale primita de la client e rezolvata (inclusiv symlink-uri) si verificata ca ramane sub `WORKSPACE_ROOT`, altfel `PermissionError`; folosita pe toate operatiile din `file_api.py` |
| Firewall de comenzi server-side (defense in depth) | ✅ | `terminal_pty.py::KeystrokeFirewall`: oglindeste linia tastata in PTY si pe Enter blocheaza comenzile riscante in FATIGUED/STRESSED (fail closed cand linia nu e inspectabila); dubleaza interceptarea client-side din `Terminal.js` |

## acoperire OWASP API Top 10 (relevant)

| risc | mitigatie in DevLife |
|------|----------------------|
| API1: Broken Object Level Authorization | nu exista resurse per-user: single-user app cu sesiune locala |
| API3: Injection (SQL, shell, command) | Pydantic validation + SQLite prepared statements + patch validator + regex fatigue firewall |
| API4: Unrestricted Resource Consumption | rate limiting `slowapi` + WS payload bounds + Claude `timeout=15.0` + cooldown 8s pe interventii |
| API7: Server Side Request Forgery | WHOOP API URL hardcodat; redirect URI verificat impotriva `WHOOP_REDIRECT_URI` din env |
| API8: Security Misconfiguration | CORS strict (nu `*`), `.env` gitignored, `.env.example` fara valori reale, niciun secret in cod |
| API9: Improper Inventory Management | doar `/health` si `/ready` expun status; nu exista endpoint-uri ascunse |

## note de design

- Patch-urile Apply Fix sunt validate **inainte** de stocare in `pending_patches`. Un patch rejectat nu polueaza state-ul.
- Logica de cooldown din `ghost_brain.py` previne abuzul prin spam de `content_update` care ar forta apeluri Claude repetate.
- `DEMO_OFFLINE=true` taie complet apelurile externe, util pentru testing in CI fara secrete reale.
- Timeout-ul de 15s pe Claude e ales > p95 latenta observata (~2.5s) cu marja larga, dar < timeout-ul implicit (10 min) care ar putea bloca ghost_loop daca API-ul atarna.

## ce este in afara scope-ului

- Autentificare utilizator: aplicatia ruleaza local, single-user, deci nu exista login. Decizie asumata pentru un companion personal, nu un serviciu multi-user.
- HTTPS: gestionat de Railway in productie (TLS termination automata); local ramane pe HTTP pentru dezvoltare.
- WAF si rate limiting global: Railway furnizeaza protectie DDoS la nivel de platforma.
