# rubric matrix — InfoEducație Software Utilitar

total: 100 puncte

| sectiune | puncte | ce trebuie demonstrat | task | artifact |
|----------|--------|----------------------|------|----------|
| **I.1 Analiza pieței** | 10 | comparatie cu solutii existente (RescueTime, Pomodoro, Oura etc.) — ce aduce DevLife in plus: biometrice reale + firewall activ + AI context-aware | T01 | `docs/positioning.md` |
| **I.2 Planificarea dezvoltarii** | 5 | plan de dezvoltare cu task-uri, dependinte, prioritati | T01, T13 | `OLIMPIADA_PLAN_AGENT.md`, `evidence/team-process/` |
| **II.1 Proiectarea arhitecturala** | 20 | arhitectura FastAPI + PixiJS + WebSocket; pipeline biometric→clasificare stare→interventie→apply-fix; justificarea fiecarui layer | T03, T05 | `README.md` sectiunea arhitectura, `docs/install-runbook.md` |
| **II.2 Tehnologiile folosite** | 5 | justificarea fiecarei tehnologii: WHOOP API, BLE, Claude API, FastAPI, PixiJS, SQLite | T03, T11 | `README.md`, `docs/assets-compliance.md` |
| **II.3 Stabilitatea aplicatiei** | 5 | fara memory leaks, degradare gratiosa cand WHOOP/Claude sunt offline, demo rulabil end-to-end | T06, T08 | `evidence/tests/`, `evidence/perf/` |
| **II.4 Securitatea aplicatiei** | 5 | validare input Pydantic, CORS restrictionat, logging fara secrete, rate limiting, error handling Claude API | T04 | `docs/security-checklist.md` |
| **II.5 Testarea produsului** | 5 | pytest cu unit + integration tests pe critical path; GitHub issues pentru bug tracking | T08, T13 | `evidence/tests/junit.xml`, `evidence/tests/coverage.html` |
| **II.6 Maturitatea aplicatiei** | 5 | app functionala online si offline, deployed pe Railway, public tinta clar (developeri) | T06, T10 | `evidence/demo-proof/`, `/ready` endpoint |
| **II.7 Sistem de versionare** | 5 | git history cu mesaje clare, branch-uri, stari intermediare | T13 | `evidence/team-process/git-graph.txt` |
| **III.1 Interfata** | 5 | camera izometrica, HUD biometric, layout responsive, stare vizuala clara per cognitive state | T09 | `evidence/screenshots/` |
| **III.2 Experienta utilizatorului** | 10 | tranzitii fluente, raspuns rapid, flow intuitiv, mesaje de eroare clare, i18n RO/EN | T09 | `evidence/screenshots/`, `evidence/demo-proof/` |
| **IV.1 Prezentare** | 5 | walkthrough de 7-10 min, demo live online + offline, raspuns la intrebari | T12 | `docs/demo-playbook.md` |
| **IV.2 Documentatia proiectului** | 5 | problema, solutia, public tinta, functionalitati, arhitectura, ghid instalare, justificari tehnologii, testimoniale | T01, T10 | `README.md`, `docs/install-runbook.md` |
| **V.1 Distributia rolurilor** | 5 | David: backend + infra; Matei: frontend + PixiJS — demonstrat prin commit history per autor | T13 | `docs/authorship.md`, `evidence/team-process/` |
| **V.2 Modul de lucru in echipa** | 5 | GitHub issues/PRs, branch graph, comunicare documentata | T13 | `evidence/team-process/` |
| **VI.1 Codul sursa** *(obligatoriu)* | — | cod structurat, comentarii unde e necesar, design patterns clare | T02–T07 | tot repo-ul |
| **VI.2 Resurse externe** *(obligatoriu)* | — | lista completa: Kenney CC0, Claude API, WHOOP API, PixiJS, FastAPI, Pydantic, librarii Python | T11, T13 | `docs/assets-compliance.md`, `docs/authorship.md` |

---

## puncte slabe actuale (de rezolvat)

- **II.1 (20 pts)** — arhitectura e buna tehnic dar nedocumentata. prioritate maxima.
- **II.4 (5 pts)** — CORS e prea permisiv, input validation lipsa pe mai multe endpoint-uri. fix in T04.
- **II.5 (5 pts)** — `test_ghost.py` exista dar nu e un test suite real. de scris in T08.
- **IV.2 (5 pts)** — README-ul actual nu acopera toate cerintele sectiunii. fix in T01.
- **V.1/V.2 (10 pts)** — lipsa issues/PRs documentate pe GitHub. de adaugat retroactiv unde e posibil in T13.

---

## competitors comparatie (pentru I.1)

| tool | ce face | ce nu face |
|------|---------|-----------|
| RescueTime | tracking timp per app | nu citeste biometrice, nu blocheaza activ |
| Pomodoro apps | timer simplu | nu stie daca esti chiar obosit sau doar plictisit |
| Oura / Garmin apps | tracking sanatate | nu sunt integrate in fluxul de cod |
| GitHub Copilot | sugereaza cod | nu stie nimic despre starea ta fizica |
| **DevLife** | biometrice reale → clasificare stare → interventie AI + firewall activ | — |
