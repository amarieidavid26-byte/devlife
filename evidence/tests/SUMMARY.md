# rezumat teste — DevLife

## execuție curentă

| metric | valoare |
|--------|---------|
| total teste | 146 (145 pass + 1 skip condiționat) |
| pass | 145 |
| fail | 0 |
| skip | 1 (test dependent de mediu) |
| durata totală | ~2s |
| ultima rulare | 2026-07-13 |

## acoperire pe modul

| modul | coverage | note |
|-------|----------|------|
| `apply_fix/audit.py` | 100% | wrapper persistence pentru audit log |
| `apply_fix/contract.py` | 100% | Pydantic models, toate path-urile validate |
| `apply_fix/validator.py` | 94% | doar o linie missed (return success duplicat) |
| `fallback_responses.py` | 100% | toate fallback paths atinse (EN + RO) |
| `keystroke_dynamics.py` | 99% | features, scoring stres/oboseală, flow, baseline EMA |
| `content_analyzer.py` | 93% | analyze() cu client Claude stub-uit: JSON valid/fenced/invalid, erori API, stuck detection, RO |
| `ghost_brain.py` | 91% | should_intervene complet, firewall templates (EN+RO), personality/lang în prompt, fallback la eroare API — cu client stub-uit |
| `persistence/db.py` | 89% | sessions, interventions, biometric samples, session replay, calibration |
| `runtime.py` | 81% | AppState, build_biometric_msg, load/save_calibration |
| `terminal_pty.py` | 77% | KeystrokeFirewall 100%; spawn/PTY real testat prin test_terminal_ws |
| `ws_game.py` | 69% | handler-ele WS exercitate prin test_ws_flow + test_run_error_routing |
| `server.py` | 67% | endpoints HTTP + WS handler de bază |
| `biometric_engine.py` | 55% | `classify()` (incl. fuziune tastare) + RMSSD 100%; OAuth/HTTP WHOOP nu se testează fără credențiale reale |
| `loops.py` | 30% | bucle daemon infinite — corpul lor e exercitat indirect prin testele de integrare WS |
| **total** | **69%** | integrările externe rămase (OAuth WHOOP, PTY spawn) se validează prin demo live |

## structura tehnică a testelor

| fișier | nr teste | acoperă |
|--------|----------|---------|
| `tests/test_apply_fix.py` | 8 | contract Pydantic, validator (shell metacharacters, max lines, empty rationale), lifecycle preview→confirm→rollback |
| `tests/test_biometric_classifier.py` | 10 | toate 5 stările cognitive, callback on_state_change, personality modifiers, default RELAXED când lipsesc date |
| `tests/test_live_hrv.py` | 6 | RMSSD cu valoare calculată de mână, filtrare artefacte (300–2000ms), fereastră glisantă 60s, minim de sample-uri, integrare cu classify() |
| `tests/test_keystroke_dynamics.py` | 11 | features din ritmul tastării, scoring stres (rapid+corecturi) / oboseală (lent+erratic+pauze), flow, baseline EMA, fuziune în classify() (typing-only / demo_locked / puls real câștigă) |
| `tests/test_ghost_brain.py` | 18 | should_intervene (firewalls, cooldown adaptiv, protecting_flow), template-uri instant EN+RO fără apel API, prompt shaping (personalitate+limbă), fallback la eroare API, feedback counters |
| `tests/test_content_analyzer.py` | 10 | analyze() cu client stub-uit: detecție riscantă instant (doar terminal), JSON valid/fenced/invalid, erori API cu/fără istoric, stuck detection în prompt, RO, metadata kwargs |
| `tests/test_calibration.py` | 3 | roundtrip calibration în SQLite, save→load restaurează baseline-urile, load fără valori păstrează defaults |
| `tests/test_keystroke_firewall.py` | 6 | firewall server-side în PTY: Enter înghițit + Ctrl-U pe comenzi riscante, editare cu backspace, Ctrl-C abandon, gate pe stare, paste multi-comandă |
| `tests/test_firewall_sync.py` | 3 | anti-drift: pattern-urile din Terminal.js trebuie să existe identic în content_analyzer; 10 comenzi periculoase declanșează AMBELE părți |
| `tests/test_session_replay.py` | 3 | timeline gol pe DB nou, samples + interventions per sesiune, endpoint /api/session/replay |
| `tests/test_session_report.py` | 9 | agregare (state shares, min/max/avg, fallback la ultima sesiune), HTML RO/EN + escaping XSS, endpoints JSON/HTML + 404, anti-drift culori vs theme.js |
| `tests/test_fallback.py` | 8 | fallback responses pentru fiecare stare, mock biometrics seed determinist, endpoint /health, /api/biometric/mock, /api/history |
| `tests/test_server_smoke.py` | 8 | WHOOP callback happy path + error, /ready, port env var, AppState dataclass, get_analyzer factory |
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

rulează și în CI (GitHub Actions, `.github/workflows/ci.yml`) la fiecare push.

## cum testăm path-urile dependente de Claude fără API live

Client-ul Anthropic e înlocuit în teste cu un stub care înregistrează apelurile și
răspunde cu text controlat (sau aruncă excepții controlate). Asta ne lasă să verificăm:
- prompt shaping (personalitatea și limba ajung în system prompt)
- parsarea răspunsurilor (JSON valid, fenced ```json, invalid)
- TOATE path-urile de eroare (API down → fallback la suggested_intervention / ultima analiză)
- că template-urile instant de firewall NU consumă apeluri API

Nu testăm cu credențiale Claude/WHOOP reale în CI — calitatea răspunsurilor live se
validează manual prin demo (vezi `docs/demo-playbook.md`).
