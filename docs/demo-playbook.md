# demo playbook — DevLife
# InfoEducație 2026 — Software Utilitar

durata tinta: 7-10 minute

---

## 0. inainte de prezentare (setup, ~2 min inainte)

```bash
cd devlife
DEMO_OFFLINE=true ./scripts/dev.sh
```

verifica:
- `curl http://localhost:8000/ready` → `{"ready":true,"demo_offline":true}`
- frontend pornit la `http://localhost:5173`
- browser deschis, tab pregatit

daca ceva nu merge: `curl http://localhost:8000/health` → daca returneaza `alive`, backend-ul e ok, problema e frontend-ul.

---

## 1. introducere — problema (1 min)

> "Developerii iau decizii proaste cand sunt obositi. Nu un timer, nu un pomodoro. Ceva care iti citeste biometricele in timp real."

arata README-ul pe scurt — problema → solutie → stack.

puncte cheie de mentionat:
- WHOOP API + Chrome Bluetooth pentru date biometrice reale
- 5 stari cognitive clasificate din HRV, recovery, strain
- Claude API pentru ghost brain

---

## 2. demo live — fluxul principal (4 min)

### 2a. pornire si meniu (30s)
- deschide `http://localhost:5173`
- arata meniul principal — titlu, subtitlu in romana
- click Settings → arata toggle de limba RO/EN → pune pe RO
- START

### 2b. starea initiala — RELAXED (30s)
- arata HUD-ul cu biometrice simulate (recovery 85%, HRV 72, strain 4.5)
- "in mod normal acestea ar veni de pe WHOOP in timp real"
- arata banner-ul "Mod degradat — demo offline" in coltul ecranului

### 2c. fatigue firewall — cel mai important feature (1.5 min)
- apasa hotbar-ul → tasta `3` → schimba starea in FATIGUED
- deschide Terminal (tasta `T` sau click pe obiect)
- scrie `git push --force`
- ghost detecteaza instant comanda periculoasa (regex pattern, fara API call)
- **arata interventie**: "FATIGUE FIREWALL — HRV 28ms, stress 1.8/3.0. 'force push' este ireversibil."
- arata butoanele: "Save Draft", "Do It Anyway", "Remind Later"
- click "Save Draft" → plant scade

### 2d. apply fix — preview + confirm (1.5 min)
- apasa hotbar-ul → tasta `2` → STRESSED
- deschide Code Editor (click desk_computer)
- scrie cod cu bug evident (ex: `result = calculateTotal(None)`)
- asteapta interventie ghost (sau triggereaza manual prin content_update)
- arata propunerea de fix cu "Apply Fix" button
- click "Apply Fix" → **arata preview dialog**: Inainte / Dupa, diff vizual
- click "Confirma" → fix aplicat, flash verde in editor
- arata toast "Fix aplicat — Apasa Revert daca vrei sa anulezi"

### 2e. audit trail (30s)
- deschide un terminal nou: `sqlite3 devlife.db "SELECT action, file, ts FROM apply_fix_audit ORDER BY ts DESC LIMIT 5;"`
- arata: `preview | demo.py | ...`, `confirm | demo.py | ...`
- "fiecare actiune e auditata in baza de date"

---

## 3. arhitectura tehnica (1.5 min)

```
Browser (PixiJS)  ←ws://→  FastAPI  ←→  Claude API
                                │
                          SQLite (sessions,
                          interventions, audit)
                                │
                         WHOOP API / BLE mock
```

puncte de mentionat:
- FastAPI + WebSocket pentru latenta mica
- SQLite persistent — datele supravietuiesc restart-ului
- AppState centralizat — toate globalele intr-un dataclass
- Pydantic validation pe toate endpoint-urile POST
- Rate limiting cu slowapi
- CORS restrictionat la originile cunoscute

---

## 4. testare + calitate cod (1 min)

```bash
./scripts/run-tests.sh
```

sau arata rapid: `pytest tests/ -v`

puncte:
- 37 teste (unit + integration + WS flow)
- test_biometric_classifier: clasele de stare cognitive
- test_apply_fix: contract, validator, lifecycle complet
- test_ws_flow: conexiune WebSocket end-to-end

---

## 5. Q&A — raspunsuri pregatite

**"Este un joc sau o unealta utilitara?"**
> Camera izometrica e interfata de vizualizare. Core-ul e: biometrice reale → clasificare stare → interventie AI → firewall activ. Daca il rulezi pe desktop mode (GAME_MODE=False) captureaza screenshot-uri ale ecranului real.

**"Cum functioneaza clasificarea starii?"**
> Yerkes-Dodson — performanta optima la arousal moderat. FATIGUED: recovery < 40% sau sleep < 70%. STRESSED: HRV ratio < 0.75 sau strain > 16. DEEP_FOCUS: estimated_stress intre 0.9-1.5 cu strain moderat.

**"Apply Fix e sigur?"**
> Patch-ul trece prin validator inainte de aplicare: max 50 linii, fara metacaractere shell, rationale obligatoriu, range valid. Pre-imaginea e stocata pentru rollback. Totul e in audit log.

**"Ce date biometrice colectezi?"**
> HR, HRV, recovery, strain, sleep performance, SpO2, temperatura pielii — doar din WHOOP cu consimtamant explicit prin OAuth. Nimic fara acord.

**"Ai folosit AI pentru cod?"**
> Parti din cod au fost scrise cu asistenta AI (Claude), declarat in `docs/authorship.md`. Arhitectura, design-ul si logica de clasificare sunt originale.

---

## tabel failure recovery

| simptom | cauza probabila | actiune live |
|---------|----------------|--------------|
| backend nu porneste | `.env` lipsa sau `venv` neactivat | `source venv/bin/activate && python3 server.py` |
| `/ready` returneaza 503 | `CLAUDE_API_KEY` lipsa | adauga in `.env` sau `DEMO_OFFLINE=true` |
| ghost nu raspunde | cooldown activ (8s) | schimba starea cu hotbar-ul |
| apply fix nu apare | continut prea scurt (`< 10 chars`) | scrie mai mult cod in editor |
| WHOOP token expirat | token WHOOP dureaza 1h | apasa `DEMO MODE` pe hotbar |
| WebSocket deconectat | backend restart | toast "Reconectare..." apare automat cu backoff |
