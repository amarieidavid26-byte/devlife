# planul de dezvoltare — DevLife

documentul oficial pentru criteriul I.2 (Planificarea dezvoltarii, 5 puncte). Pastrat actualizat pe parcursul lucrarii ca single-source-of-truth.

## faza 0: analiza si decizii

### problema identificata

Dezvoltatorii software iau decizii proaste cand sunt obositi cognitiv:
- HRV scazut + recovery sub 40% → erori de evaluare a riscului
- la 2 AM, dupa multe cafele, comenzile distructive (`git push --force`, `rm -rf`, `DROP TABLE`) se executa fara verificare
- *Yerkes-Dodson law (1908)*: performanta cognitiva e curba in U inversat
- *Peifer et al. 2014*: starea de flow coreleaza cu HRV crescut si activare simpatica usoara
- *Cai et al. 2018*: privarea de somn reduce decizia adversa de risc cu pana la 30%

### solutii existente analizate (criteriul I.1)

| solutie | ce face | ce nu face |
|---------|---------|-----------|
| RescueTime | tracking timp per aplicatie | nu citeste biometrice, nu blocheaza |
| Pomodoro timers | timer simplu | nu stie daca utilizatorul e chiar obosit |
| Oura / Garmin Connect | tracking sanatate | nu integrat in fluxul de cod |
| GitHub Copilot | sugereaza cod | nu stie nimic despre starea fizica |
| WHOOP app | dashboard biometric | nu intervine pe context cognitiv |

### concluzie analiza

Niciun produs nu combina:
1. Biometrice in timp real (WHOOP + BLE)
2. Intelegere AI a contextului de cod (Claude API)
3. Interventie ACTIVA (nu pasiva) — Fatigue Firewall blocheaza comenzile

→ exista loc pe piata pentru DevLife.

## faza 1: design tehnic

### stack tehnologic ales

| layer | tehnologie | rationale |
|-------|-----------|-----------|
| backend | Python 3.11 + FastAPI | ecosistem AI dominant Python; FastAPI = Pydantic + WebSocket native |
| frontend | Vanilla JS + PixiJS 7 | canvas WebGL hardware-accelerated, control complet pe render izometric |
| persistenta | SQLite + WAL | zero deployment overhead; ACID; reads concurente non-blocking |
| AI | Claude API (Sonnet 4) | top tier reasoning + JSON structurat stabil |
| biometrice | WHOOP API + Chrome Web Bluetooth | WHOOP pentru date "lente"; BLE pentru BPM live |
| testing | pytest + pytest-asyncio | standard, async-friendly |
| deploy | Railway | Procfile + auto-deploy from main |

### arhitectura layered

```
Browser (PixiJS)  <──ws://──>  FastAPI (Python)  <──>  Claude API
                                     │
                              SQLite (WAL mode)
                                     │
                              WHOOP API / BLE
```

Decizii de design fundamentale:
- **AppState dataclass** centralizat: toate globalele in `AppState` ca sa evitam state-ul imprastiat
- **2 thread-uri daemon**: `biometric_loop` (5s) si `ghost_loop` (1s), comunica prin AppState + asyncio.run_coroutine_threadsafe pentru WS broadcast
- **Two operational modes**: `GAME_MODE=True` (in-app surfaces, content_update prin WS) si `GAME_MODE=False` (screenshot desktop real prin Claude Vision)
- **Patch contract**: orice fix propus de AI trebuie sa treaca prin Pydantic + validator + preview UI + audit log — niciodata aplicat automat

## faza 2: task breakdown (T01-T13)

| task | scop | autor principal | tag livrare |
|------|------|-----------------|-------------|
| **T01** | Analiza pietei + rubric matrix + positioning | Matei | (docs) |
| **T02** | Refactor backend: AppState, fix WHOOP OAuth, PORT env, GAME_MODE routing | Matei | `v0.5-architecture` |
| **T03** | Arhitectura documentata: README, install runbook, deploy runbook | echipa | (docs) |
| **T04** | Security baseline: Pydantic validation, CORS strict, rate limiting, logging, security-checklist | Matei | (parte din v0.5) |
| **T05** | Persistence SQLite: sessions, interventions, biometric_samples, feedback, apply_fix_audit, consent | Matei | `v0.6-persistence` |
| **T06** | Mod offline: DEMO_OFFLINE, seeded mock, degraded banner | Matei | (parte din v0.7) |
| **T07** | Apply Fix: PatchContract Pydantic, validator (max 50 linii + shell metachar), audit, endpoints, preview UI cu rollback | Matei | `v0.7-apply-fix` |
| **T08** | Suita de teste: 37 teste pytest (apply_fix, biometric_classifier, fallback, server_smoke, ws_flow) | Matei | `v0.9-tests` |
| **T09** | i18n RO/EN module + toggle in Settings + toasts traduse | Matei | `v0.8-i18n` |
| **T10** | Deploy readiness: endpoint `/ready` cu 503 daca lipsesc dependinte, `runtime.txt`, healthcheck script | Matei | (parte din v1.0-rc) |
| **T11** | Conformitate resurse: assets-compliance.md, sters MP3 cu copyright neclar, declaratii licente | Matei | (parte din v1.0-rc) |
| **T12** | Demo playbook: scenariu prezentare 7-10 min cu failure recovery + Q&A pregatite | Matei | (parte din v1.0-rc) |
| **T13** | Authorship declaration + structura evidence/ | Matei | `v1.0-rc` |
| **T14** | Hardening pre-predare: timeout Claude (15s), bounds WS payload, OWASP API Top 10 mapping | echipa | `v1.1-hardening` |

In paralel, contributiile lui David (frontend, vizual, scene, BLE):
- Cinematice (intro main menu + chapter transitions + outro credits) — `v0.3-cinematics`
- Camera izometrica procedurala, palette Animal Crossing
- Town scenes: Cafe (sistem brewing), Cowork (NPCs animate), Park (meditatie)
- WHOOP BLE live: hartbeat real-time via Chrome Web Bluetooth
- Dashboard CQI (Cognitive Quality Index), autonomic balance, ECG live, sleep data
- 14 risky command patterns expanded
- Visual polish: ghost trail + aura, vignette, theme branding

## faza 3: dependinte intre task-uri

```
T01 (analiza) ──> T03 (docs arhitectura) ──┐
                                            ├──> T13 (authorship final)
T02 (AppState) ──> T04 (security) ─────────┤
                ├──> T05 (persistence) ──> T07 (apply fix)
                └──> T06 (offline mode) ──> T12 (demo playbook)

T05 + T07 ──> T08 (teste) ──> T09 (i18n) ──> T10 (deploy ready) ──> T11 (compliance)

T08 + T10 + T11 ──> v1.0-rc

v1.0-rc ──> T14 (hardening) ──> v1.1-hardening (submission)
```

## faza 4: criterii de succes

| criteriu | masura |
|----------|--------|
| toate 37 testele verzi | `./scripts/run-tests.sh` → `37 passed` |
| `/ready` returneaza 200 in DEMO_OFFLINE | `curl localhost:8000/ready` → `{"ready":true}` |
| Apply Fix functional end-to-end | preview validat → confirm → audit row in SQLite |
| Fatigue Firewall trigger-it instant | scrie `git push --force` cu stare FATIGUED → ghost intervine fara apel Claude (regex local) |
| demo offline rulabil | `DEMO_OFFLINE=true ./scripts/dev.sh` → 0 apeluri externe, 0 erori |
| docs completa | toate rubric-matrix-line cu artefact concretizat |

## faza 5: risc + mitigare

| risc | probabilitate | impact | mitigare |
|------|---------------|--------|----------|
| Claude API atarna in demo | medie | mare | timeout 15s + fallback responses pre-cached |
| WHOOP token expira mid-demo | medie | mediu | hotbar 1-5 mock states + `DEMO_OFFLINE` |
| WiFi pica la prezentare | medie | critic | `DEMO_OFFLINE=true` ruleaza identic |
| memory leak in ghost_loop | scazuta | mare | profiling local: RSS stabil dupa 60 min |
| copyright pe assets | scazuta | critic | toate assets Kenney CC0 declarate + audio synthesized procedural |
| force push pe main pierde munca | scazuta | mare | patches backup-uite local + tags semantice pe stari intermediare |

## faza 6: stadiul curent

| arie | stadiu | restant |
|------|--------|---------|
| backend | 100% | — |
| frontend | 95% | screenshot-uri finale pentru DOCX |
| testing | 100% (37/37) | — |
| security | 100% | — |
| docs | 95% | DOCX final |
| evidence | 95% | screenshot-uri PNG efective |
| deploy | 100% | — |
