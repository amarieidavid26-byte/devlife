# rezumat teste — DevLife

## execuție curentă

| metric | valoare |
|--------|---------|
| total teste | 93 (92 pass + 1 skip condiționat) |
| pass | 92 |
| fail | 0 |
| skip | 1 (test dependent de mediu) |
| durata totală | ~2s |
| ultima rulare | 2026-07-10 |

## acoperire pe modul

| modul | coverage | note |
|-------|----------|------|
| `apply_fix/audit.py` | 100% | wrapper persistence pentru audit log |
| `apply_fix/contract.py` | 100% | Pydantic models, toate path-urile validate |
| `apply_fix/validator.py` | 94% | doar o linie missed (return success duplicat) |
| `fallback_responses.py` | 100% | toate fallback paths atinse (EN + RO) |
| `persistence/db.py` | 88% | sessions, interventions, audit, biometric samples + session replay timeline |
| `terminal_pty.py` | 77% | KeystrokeFirewall 100%; spawn/PTY real testat prin test_terminal_ws |
| `server.py` | 59% | endpoints HTTP + WS handler de bază; ghost_loop nu se testează în unit tests (async loop) |
| `biometric_engine.py` | 53% | `classify()` + RMSSD/HRV live 100%; OAuth/HTTP calls nu se testează fără credențiale reale |
| `content_analyzer.py` | 30% | regex risky detection 100%; restul depinde de Claude API |
| `ghost_brain.py` | 19% | `should_intervene()` testat indirect; `generate_response()` necesită Claude live |
| **total** | **55%** | acceptabil pentru un proiect cu integrări externe (WHOOP, Claude, BLE) |

## structura tehnică a testelor

| fișier | nr teste | acoperă |
|--------|----------|---------|
| `tests/test_apply_fix.py` | 8 | contract Pydantic, validator (shell metacharacters, max lines, empty rationale), lifecycle preview→confirm→rollback |
| `tests/test_biometric_classifier.py` | 10 | toate 5 stările cognitive, callback on_state_change, personality modifiers, default RELAXED când lipsesc date |
| `tests/test_live_hrv.py` | 6 | RMSSD cu valoare calculată de mână, filtrare artefacte (300–2000ms), fereastră glisantă 60s, minim de sample-uri, integrare cu classify() |
| `tests/test_keystroke_firewall.py` | 6 | firewall server-side în PTY: Enter înghițit + Ctrl-U pe comenzi riscante, editare cu backspace, Ctrl-C abandon, gate pe stare, paste multi-comandă |
| `tests/test_firewall_sync.py` | 3 | anti-drift: pattern-urile din Terminal.js trebuie să existe identic în content_analyzer; 10 comenzi periculoase declanșează AMBELE părți |
| `tests/test_session_replay.py` | 3 | timeline gol pe DB nou, samples + interventions per sesiune, endpoint /api/session/replay |
| `tests/test_fallback.py` | 8 | fallback responses pentru fiecare stare, mock biometrics seed determinist, endpoint /health, /api/biometric/mock, /api/history |
| `tests/test_server_smoke.py` | 7 | WHOOP callback happy path + error, port env var, AppState dataclass, get_analyzer factory |
| `tests/test_ws_flow.py` | 8 | WebSocket connect + first biometric_update, mock_state, invalid JSON ignored, content_update accepted, feedback accepted, heart_rate accepted/out-of-range/wrong-type |
| `tests/test_run_error_routing.py` | 3 | rutare run_error prin ghost loop, truncare payload oversize, integrare runtime-error → intervenție |
| `tests/test_security.py` | 6 | origin check, token per proces, workspace-root jail |
| `tests/test_file_api.py` | 8 | tree/read/write cu jail pe WORKSPACE_ROOT, path traversal respins |
| `tests/test_terminal_ws.py` + `test_terminal_pty.py` | 4 | sesiune PTY reală, gate pe feature flag + token |
| `tests/test_inline_ws.py` + `test_lsp_bridge.py` + `test_codeserver.py` | 9 | completări inline AI, LSP bridge, code-server gating |
| `tests/test_whoop_tokens.py` | 4 | persistență + refresh tokens OAuth WHOOP |

## cum se rulează

```bash
./scripts/run-tests.sh
```

generează automat:
- `evidence/tests/junit.xml` (raport JUnit XML)
- `evidence/tests/coverage/index.html` (raport HTML coverage)
- terminal output cu termeni missing (pentru debugging)

## de ce nu 100% coverage

Decizie deliberată: nu testăm cu credențiale Claude/WHOOP reale în CI. Aceste integrări sunt validate manual prin demo-ul live (vezi `docs/demo-playbook.md`). În schimb, testăm:
- contractele de input/output (Pydantic, JSON shape)
- logica pură (clasificare, RMSSD/HRV, validator, fallback, keystroke firewall)
- fluxul end-to-end WebSocket
- regex-urile risky (instant detection) + sincronizarea lor frontend/backend

Path-urile care apelează Claude/WHOOP sunt protejate prin try/except cu fallback (testat).
