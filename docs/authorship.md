# declaratie de autorship — DevLife

## autori

| autor | GitHub | rol |
|-------|--------|-----|
| David Amariei | amarieidavid26-byte | backend Python, WHOOP integration, WebSocket, deployment, DemoMode |
| Matei Vultur | mateivul | frontend PixiJS, arhitectura, securitate, persistenta, teste, CI |

## distributia muncii

**David Amariei:**
- arhitectura initiala a proiectului (March 2026)
- camera izometrica PixiJS, Player, Ghost, town scenes (Cafe, Cowork)
- WHOOP BLE integration, dashboard overlay, ECG live
- DemoMode cinematic intro/outro, sound system
- deployment Railway, Procfile initial

**Matei Vultur:**
- refactorizare backend: AppState, fix WHOOP OAuth, PORT env, GAME_MODE runtime routing (T02)
- security baseline: Pydantic validation, CORS restrictionat, rate limiting, logging (T04)
- SQLite persistence layer: sessions, interventions, apply_fix_audit (T05)
- offline fallback: DEMO_OFFLINE mode, seeded mock, degraded banner (T06)
- Apply Fix safety: contract Pydantic, validator, preview UI, rollback, audit (T07)
- suite de teste: 37 teste (biometric classifier, WS flow, apply fix, fallback) (T08)
- i18n RO/EN cu toggle in Settings (T09)
- deploy readiness: /ready endpoint, runtime.txt, healthcheck (T10)
- docs: rubric matrix, demo playbook, install runbook, deploy runbook, assets compliance (T01, T11, T12)

## utilizarea AI

Parti din cod au fost scrise cu asistenta Claude AI (Anthropic) in sesiuni de pair-programming, in special pentru:
- refactorizarea backend-ului (T02-T06): structura AppState, persistence layer, security
- suite de teste (T08): structura fixtures, mock-uri
- documentatie (T01, T11, T12, T13): rubric matrix, playbook, runbook-uri

**Ce este original:**
- arhitectura biometrics → state classification → intervention pipeline
- algoritmul de clasificare Yerkes-Dodson (biometric_engine.py `classify()`)
- logica ghost brain si system prompts per stare cognitiva
- camera izometrica PixiJS procedurala (fara sprite sheets)
- WHOOP BLE integration + Chrome Web Bluetooth
- design-ul UX al camerei izometrice si town scene-urilor

**Cum s-a lucrat cu AI:**
- AI a sugerat structuri, noi am decis ce pastra
- tot codul a trecut prin review uman inainte de commit
- deciziile arhitecturale (ce sa persistam, cum sa validam patch-urile, cum sa structuram AppState) au fost ale noastre
- AI nu a avut acces la repo — toate sugestiile au fost integrate manual

## resurse externe declarate

vezi `docs/assets-compliance.md` pentru lista completa de librarii, fonturi si assets.

---

David Amariei & Matei Vultur 
