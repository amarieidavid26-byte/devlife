# rezumat teste — DevLife

## execuție curentă

| metric | valoare |
|--------|---------|
| total teste | 37 |
| pass | 37 |
| fail | 0 |
| skip | 0 |
| durata totală | ~2.5s |
| ultima rulare | 2026-05-19 |

## acoperire pe modul

| modul | coverage | note |
|-------|----------|------|
| `apply_fix/audit.py` | 100% | wrapper persistence pentru audit log |
| `apply_fix/contract.py` | 100% | Pydantic models, toate path-urile validate |
| `apply_fix/validator.py` | 94% | doar o linie missed (return success duplicat) |
| `fallback_responses.py` | 100% | toate fallback paths atinse |
| `persistence/db.py` | 72% | path-urile critice (sessions, interventions, audit) acoperite |
| `server.py` | 58% | endpoints HTTP + WS handler de bază; ghost_loop nu se testează în unit tests (async loop) |
| `biometric_engine.py` | 38% | logica `classify()` 100%; OAuth/HTTP calls nu se testează fără credențiale reale |
| `content_analyzer.py` | 25% | regex risky detection 100%; restul depinde de Claude API |
| `ghost_brain.py` | 19% | `should_intervene()` testat indirect; `generate_response()` necesită Claude live |
| **total** | **48%** | acceptabil pentru un proiect cu integrări externe (WHOOP, Claude, BLE) |

## structura tehnică a testelor

| fișier | nr teste | acoperă |
|--------|----------|---------|
| `tests/test_apply_fix.py` | 8 | contract Pydantic, validator (shell metacharacters, max lines, empty rationale), lifecycle preview→confirm→rollback |
| `tests/test_biometric_classifier.py` | 10 | toate 5 stările cognitive, callback on_state_change, personality modifiers, default RELAXED când lipsesc date |
| `tests/test_fallback.py` | 8 | fallback responses pentru fiecare stare, mock biometrics seed determinist, endpoint /health, /api/biometric/mock, /api/history |
| `tests/test_server_smoke.py` | 6 | WHOOP callback happy path + error, port env var, AppState dataclass, get_analyzer factory |
| `tests/test_ws_flow.py` | 5 | WebSocket connect + first biometric_update, mock_state, invalid JSON ignored, content_update accepted, feedback accepted |

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
- logica pură (clasificare, validator, fallback)
- fluxul end-to-end WebSocket
- regex-urile risky (instant detection)

Path-urile care apelează Claude/WHOOP sunt protejate prin try/except cu fallback (testat).
