# rubric matrix: InfoEducație Software Utilitar

total: 100 puncte. matricea de mai jos mapeaza fiecare sub-criteriu la artefactele concrete din repo.

| sectiune | puncte | ce trebuie demonstrat | artefacte |
|----------|--------|----------------------|-----------|
| **I.1 Analiza pieței** | 10 | comparatie cu solutii existente (RescueTime, Pomodoro, Oura, Copilot, WHOOP app); ce aduce DevLife in plus: biometrice reale + firewall activ + AI context-aware + Apply Fix cu audit | `docs/positioning.md` (detaliat), `README.md` (tabel rezumat) |
| **I.2 Planificarea dezvoltarii** | 5 | plan de dezvoltare cu task-uri T01-T14, dependinte, criterii succes, risc + mitigare | `docs/development-plan.md`, `docs/rubric-matrix.md` |
| **II.1 Proiectarea arhitecturala** | 20 | 5 layer-uri detaliate (frontend → WS → backend → Apply Fix → persistence), 2 thread-uri daemon, decizii arhitecturale, paradigme programare, extensibilitate; desk code runner reutilizeaza pipeline-ul existent prin runtime-error → ghost loop | `docs/architecture.md`, `docs/desk-code-runner.md`, `README.md` sectiunea arhitectura |
| **II.2 Tehnologiile folosite** | 5 | justificarea fiecarei tehnologii: Python+FastAPI, PixiJS, SQLite WAL, Anthropic SDK, WHOOP API + Web Bluetooth, slowapi, Pydantic, Pyodide (Python in browser), JSCPP (C++ in browser), Web Worker (sandbox JS) | `docs/architecture.md` sectiunea decizii, `docs/desk-code-runner.md`, `docs/assets-compliance.md` |
| **II.3 Stabilitatea aplicatiei** | 5 | fara memory leaks (RSS stabil 60min), degradare gratioasa (Claude timeout 15s, WHOOP fallback la mock), demo rulabil end-to-end | `evidence/perf/latency-table.md`, `evidence/tests/SUMMARY.md` |
| **II.4 Securitatea aplicatiei** | 5 | validare input Pydantic, CORS strict, logging fara secrete, rate limiting 30/min, timeout Claude, bounds WS, audit Apply Fix, OWASP API Top 10 mapping | `docs/security-checklist.md` |
| **II.5 Testarea produsului** | 5 | 234 teste pytest (233 passed + 1 skipped) in 33 fisiere: apply_fix, classifier, fallback, server_smoke, ws_flow, run_error_routing, live_hrv, session_replay, keystroke_firewall, firewall_sync si restul; automatizare prin scripts/run-tests.sh + coverage HTML | `evidence/tests/junit.xml`, `evidence/tests/coverage/`, `evidence/tests/SUMMARY.md` |
| **II.6 Maturitatea aplicatiei** | 5 | app functionala local, cu si fara internet; infrastructura de deploy Railway pregatita (Procfile, runbook, healthcheck), gazda publica momentan oprita; public tinta clar definit, `/ready` endpoint, mod DEMO_OFFLINE complet functional fara internet | `docs/deploy-runbook.md`, `docs/install-runbook.md`, `docs/positioning.md` sectiunea public tinta |
| **II.7 Sistem de versionare** | 5 | git history cu mesaje structurate t02-t13 si mesaje descriptive per feature, 9 tag-uri semantice (v0.1-mvp → v1.1-hardening), branch strategy documentat | `evidence/team-process/git-graph.txt`, `evidence/team-process/branch-strategy.md`, `evidence/team-process/commit-timeline.md` |
| **III.1 Interfata** | 5 | camera izometrica 2.5D, HUD biometric (CQI, ECG, autonomic balance), layout responsive, paleta Animal Crossing, ghost personality vizuala | `docs/ui-ux-decisions.md`, `evidence/screenshots/*.png` |
| **III.2 Experienta utilizatorului** | 10 | tranzitii fluente intre scene (Room, Town, Cafe, Cowork), raspuns rapid (< 10ms fallback), flow intuitiv (WASD + E + 1-5 + ESC), i18n RO/EN, accesibilitate keyboard-first; demo set-piece: buggy code → Run → eroare → Ghost suggest fix → Apply Fix → diff preview → swap → Run reusit (~60s) | `docs/ui-ux-decisions.md`, `docs/desk-code-runner.md`, `frontend/src/i18n/`, `evidence/screenshots/` |
| **IV.1 Prezentare** | 5 | sustinere de 8 minute cu scenariu cronometrat si predare intre cei doi autori, justificarea necesitatii produsului fata de alternativele existente, demo live rulabil si offline, set de capturi ca material de prezentare | `docs/positioning.md`, `evidence/screenshots/` |
| **IV.2 Documentatia proiectului** | 5 | problema, solutia, public tinta, functionalitati, arhitectura, ghid instalare, justificari tehnologii, testimoniale, roadmap | `documentatie.docx` + toate docs/*.md |
| **V.1 Distributia rolurilor** | 5 | David: frontend visual + cinematic + WHOOP BLE + scene + code runner; Matei: backend + persistence + security + tests + docs | `docs/authorship.md`, `evidence/team-process/contributor-stats.md` |
| **V.2 Modul de lucru in echipa** | 5 | git workflow cu branch-uri (`infoeducatie-hardening`, `feature/real-ide-whoop-terminal`), pair-programming pe zonele comune, merge-uri vizibile in graph | `evidence/team-process/branch-strategy.md`, `evidence/team-process/git-graph.txt` |
| **VI.1 Codul sursa** *(obligatoriu)* | - | cod structurat in module dedicate (apply_fix/, persistence/, frontend/src/{apps,apps/runners,room,town,hud,...}), docstrings unde necesar, type hints, Pydantic models | tot repo-ul, vezi `docs/architecture.md` pentru tour ghidat |
| **VI.2 Resurse externe** *(obligatoriu)* | - | toate dependintele declarate cu licenta: grafica procedurala proprie (fara asset pack-uri), Fredoka/Nunito/JetBrains Mono SIL OFL (self-hosted), FastAPI/PixiJS/Pydantic/Pyodide/etc MIT, Anthropic + WHOOP APIs | `docs/assets-compliance.md` |

---

## stadiu curent (dupa v1.1-hardening)

| arie | acoperire | restant |
|------|-----------|---------|
| backend + persistence | ✅ 100% | - |
| security + hardening | ✅ 100% | - |
| testing (241 pass + 1 skip din 242) | ✅ 100% | - |
| desk code runner (Pyodide + Web Worker + JSCPP) | ✅ 100% | - |
| documentatie (docs/ + `documentatie.docx`) | ✅ 100% | - |
| evidence pack (23 capturi in `evidence/screenshots/`) | ✅ 100% | - |
| git workflow + tags | ✅ 100% | - |
| deploy (Railway) | ⚠️ gazda publica oprita (`/health` intoarce 404) | re-deploy dupa `docs/deploy-runbook.md`; modul sustinut e cel local (`./scripts/dev.sh`) |

---

## competitor comparatie rezumat (pentru I.1)

vezi `docs/positioning.md` pentru analiza detaliata pe fiecare competitor.

| tool | biometrice | blocheaza activ | context cod | pret |
|------|-----------|-----------------|-------------|------|
| RescueTime | ❌ | ❌ | ❌ | $9-12/luna |
| Pomodoro apps | ❌ | partial | ❌ | gratis-$5 |
| Oura/Garmin/Fitbit | ✅ | ❌ | ❌ | $5-30/luna + hw |
| GitHub Copilot | ❌ | ❌ | ✅ | $10-20/luna |
| WHOOP app | ✅ | ❌ | ❌ | $25-30/luna + hw |
| **DevLife** | ✅ | ✅ | ✅ | open source |
