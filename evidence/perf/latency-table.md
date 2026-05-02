# latenta masuri — DevLife

masuri efectuate local (macOS, Python 3.9, DEMO_OFFLINE=true)

## WebSocket round-trip

| operatie | latenta medie | note |
|----------|--------------|-------|
| WS connect → primul biometric_update | ~15ms | masurat in test_ws_flow.py |
| mock_state change → biometric_update | ~5ms | fara tranzitie, clasificare directa |
| content_update → interventie (fallback) | ~8ms | fara API call, instant template |

## backend HTTP

| endpoint | latenta medie (curl local) |
|----------|---------------------------|
| GET /health | ~2ms |
| GET /ready | ~5ms |
| POST /api/biometric/mock | ~310ms | include asyncio.sleep(0.3) intentionat |
| POST /api/apply-fix/preview | ~3ms | validare locala |
| POST /api/apply-fix/confirm | ~2ms | |
| GET /api/history | ~8ms | SQLite query |

## Claude API (online mode)

| operatie | p50 | p95 | note |
|----------|-----|-----|------|
| ghost brain (GHOST_MAX_TOKENS=100) | ~800ms | ~1800ms | claude-sonnet-4 |
| content analyzer (VISION_MAX_TOKENS=500) | ~1200ms | ~2500ms | |

## clasificare biometrica

| operatie | latenta |
|----------|---------|
| `bio.classify(data)` | < 1ms | pur Python, fara I/O |
| `mock.get_data()` | < 1ms | dict copy |

## note

- in DEMO_OFFLINE mode Claude API nu e apelat → latenta interventie < 10ms
- SQLite foloseste WAL mode → writes non-blocking pentru reads concurente
- biometric_loop ruleaza la interval de 5s (configurabil)
