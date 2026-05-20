# statistici contributori

generat: `git shortlog -sn HEAD` la momentul release-ului v1.1-hardening.

## distributia commits

| autor | nr commits | % din total |
|-------|-----------|-------------|
| David Amariei (`amarieidavid26-byte`) | 36 | ~58% |
| Matei Vultur (`mateivul`) | 26 | ~42% |
| **total** | **62** | **100%** |

distributie aproximativ echilibrata, fiecare cu specializare clara pe aria sa.

## arii de responsabilitate

### David Amariei (frontend, vizual, biometric live)

Commit-uri reprezentative:
```
865e93d cinematic demo mode intro, chapter transitions, outro credits
979cf27 cinematic main menu intro sequence
b8ef148 wired plant growth UI, ghost sleep mode, expanded terminal, 14 risky patterns
78c7e09 visual polish: cafe details, cowork NPCs animations, room textures
99912af dashboard with CQI, autonomic balance, ECG, sleep data — all live
b7ce5d1 WHOOP live mode priority, disable manual override during BLE
80288ef interactive cafe brewing, cowork NPC panels, park meditation
8f8af42 WHOOP BLE wired, park garden with pond/flowers/fence, ambient room glow
95f4122 animal crossing warm palette: room, furniture, player, ghost, HUD
908ba08 added town dialogue, camera follow, settings menu
f9e1385 visual polish: vignette, furniture details, character outline, ghost trail + aura
```

Fisiere atinse predominant:
- `frontend/src/character/` (Player.js, Ghost.js)
- `frontend/src/room/` (Atmosphere.js, Furniture.js, Plant.js, Room.js)
- `frontend/src/town/` (CafeScene.js, CoworkScene.js, Town.js, TownDialogue.js)
- `frontend/src/network/WHOOPBluetooth.js`
- `frontend/src/menu/` (MainMenu.js, SettingsMenu.js)
- `frontend/src/demo/DemoMode.js`
- `frontend/src/audio/SoundManager.js`
- `frontend/src/hud/HUD.js`, `DashboardOverlay.js`, `DemoHotbar.js`, `BeneathView.js`
- `public/assets/` (Kenney sprites integration)

### Matei Vultur (backend, securitate, persistenta, docs, teste)

Commit-uri reprezentative:
```
a4ffc7c move project from devlife/ subfolder to root
77b5994 t13 authorship declaration
f0c60a4 demo playbook, latency table, evidence structure
f507036 sters mp3 copyright, assets compliance doc
241806a healthcheck script si deploy runbook
c227ef7 t10 endpoint /ready si runtime.txt
dce9aae t09 i18n module ro/en toggle
028cd6a teste biometric, fallback, ws flow
4a509ff apply fix backend - contract, validator, audit, endpoints + test
a8c5daf demo-offline mode, seeded mock, degraded banner
15d81cf t05 wired db in server for sessions, interventions, history
e0f38d8 cors, pydantic validation, rate limit, logging
6b9d816 t02 fix whoop callback, port env, appstate, game mode imports + tests
```

Fisiere atinse predominant:
- `server.py` (AppState refactor, security, endpoints)
- `apply_fix/` (contract.py, validator.py, audit.py)
- `persistence/` (db.py, migrations/)
- `tests/` (toate cele 37 de teste)
- `frontend/src/i18n/` (module + ro.json, en.json)
- `docs/` (security-checklist.md, demo-playbook.md, deploy-runbook.md, install-runbook.md, rubric-matrix.md, assets-compliance.md, authorship.md)
- `scripts/` (setup.sh, dev.sh, run-tests.sh, healthcheck.sh)
- `evidence/` (structura initiala)

## complementaritate

Distributia rolurilor a evitat coliziuni:
- **David** a creat experienta vizuala si interactiva
- **Matei** a refactorizat si a adus standardele de calitate (teste, securitate, docs)

Cele doua arii s-au intalnit doar la integrare (de ex. WS message types in server.py care servesc frontend-ul). Conflictele de merge au fost minime, vizibile in `git-graph.txt`.

## evolutia in timp

| perioada | activitate predominanta | autor principal |
|----------|------------------------|-----------------|
| init → v0.3 | mecanica jocului, cinematic, vizual | David |
| v0.3 → v0.5 | refactor backend, AppState, fix bugs | Matei |
| v0.5 → v0.7 | persistence + Apply Fix + security | Matei |
| v0.7 → v0.8 | apply-fix UI + i18n + tests | Matei + David |
| v0.8 → v0.9 | demo polish + docs + healthcheck | Matei |
| v0.9 → v1.0 | cleanup, evidence pack, authorship | Matei |
| v1.0 → v1.1 | hardening pre-predare | echipa |
