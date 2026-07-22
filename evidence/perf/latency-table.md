# masuratori de latenta DevLife

masuri efectuate local (macOS 25.2, Python 3.11+, DEMO_OFFLINE=true, hardware: MacBook Air M-series)

## metodologie

- **WebSocket**: medie pe ~100 cicluri, masurata in `tests/test_ws_flow.py`
- **HTTP**: `curl -w "%{time_total}"` din terminal, n=20
- **Claude API**: timpii reali raportati de Anthropic SDK (online mode, claude-sonnet-5)
- **Clasificare biometrica**: `time.perf_counter()` in jurul `bio.classify()`, n=1000

## WebSocket round-trip

| operatie | latenta medie | note |
|----------|--------------|-------|
| WS connect → primul biometric_update | ~15ms | masurat in `test_ws_flow.py::test_ws_connects_and_receives_biometric` |
| mock_state change → biometric_update | ~5ms | fara tranzitie, clasificare directa |
| content_update → interventie (fallback) | ~8ms | fara API call, instant template |
| feedback ACK → reset cooldown | ~3ms | doar state mutation |

## backend HTTP

| endpoint | latenta medie (curl local) | note |
|----------|---------------------------|------|
| GET /health | ~2ms | minimal payload |
| GET /ready | ~5ms | include verificare DB connect |
| POST /api/biometric/mock | ~310ms | include `asyncio.sleep(0.3)` intentionat pentru tranzitie smooth |
| POST /api/apply-fix/preview | ~3ms | validare locala Pydantic + validator |
| POST /api/apply-fix/confirm | ~2ms | doar lookup hash in dict |
| POST /api/apply-fix/rollback | ~2ms | dict pop + return original |
| GET /api/history | ~8ms | SQLite SELECT cu LIMIT 50 |
| GET /api/status | ~4ms | aggregat din AppState in memorie |

## Claude API (online mode)

| operatie | p50 | p95 | timeout | note |
|----------|-----|-----|---------|------|
| ghost brain (`GHOST_MAX_TOKENS_DEFAULT=100`) | ~800ms | ~1800ms | 15s | claude-sonnet-5 |
| content analyzer (`VISION_MAX_TOKENS=2048`) | ~1200ms | ~2500ms | 15s | mai mare datorita system prompt + content |

**Note timeout**: clientul Anthropic e instantiat cu `timeout=15.0s` in `ghost_brain.py` si `content_analyzer.py`. p95 observat (~2.5s) este cu marja larga sub timeout, dar protejeaza impotriva atarnarii API-ului.

## clasificare biometrica + mock

| operatie | latenta | note |
|----------|---------|------|
| `bio.classify(data)` | < 1ms | pur Python, fara I/O (n=1000, medie) |
| `mock.get_data()` | < 1ms | dict copy thread-safe sub lock |
| `content_analyzer.detect_risky_commands()` | < 1ms | 11 regex compiled, early-exit la prima potrivire |
| `validate_patch()` | < 2ms | regex + count + length checks |

## SQLite operations

| operatie | latenta | note |
|----------|---------|------|
| `save_intervention()` | ~3-5ms | INSERT + commit; WAL mode permite citiri concurente |
| `save_biometric()` | ~3-5ms | similar |
| `get_interventions(limit=50)` | ~5-8ms | JOIN cu sessions, ORDER BY ts DESC, LIMIT |
| `start_session()` + migrate (cold start) | ~30ms | rulare migration 001_init.sql daca DB e nou |

## resurse de sistem

| metric | valoare observata | note |
|--------|-------------------|------|
| RAM backend (steady state) | ~85 MB | uvicorn + FastAPI + AppState + WHOOP polling thread |
| RAM frontend (PixiJS in Chrome) | ~120 MB | inclusiv WebGL context |
| CPU backend (idle, no Claude calls) | < 1% | doar polling biometric la 5s |
| CPU frontend (60 fps room scene) | ~5-8% | un core, hardware acceleration |
| pornire backend (cold) | ~1.2s | include conectare DB + start thread-uri daemon |
| pornire frontend (Vite dev) | ~600ms | initial bundle |

## note

- in DEMO_OFFLINE mode Claude API nu e apelat → latenta interventie < 10ms
- SQLite foloseste WAL mode → writes non-blocking pentru reads concurente
- biometric_loop ruleaza la interval de 5s (configurabil prin variabila environment)
- ghost_loop ruleaza la 1s tick, dar trimite interventii doar dupa cooldown: un gate de 8s pe pipeline dupa fiecare interventie trimisa (`app_state.intervention_cooldown_until`, `loops.py`) plus cooldown-ul adaptiv din `GhostBrain.should_intervene` (`ghost_brain.py`): 30s default, 60s dupa 3+ interventii ignorate, 20s cand acceptarile depasesc ignorarile, minim 10s la actiuni riscante
- aplicatia nu prezinta memory leak observabil dupa 60 min de rulare cu DEMO_OFFLINE=true (RSS stabil)
