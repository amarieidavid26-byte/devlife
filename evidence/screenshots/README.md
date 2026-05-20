# screenshots — checklist pentru predare

22 capturi necesare pentru documentatia DOCX + sustinerea rubricii (Cap III + IV.2).

## conventii

- Format: **PNG** la rezolutie minima 1920x1080
- Numire: numarul + slug descriptiv (`01-main-menu.png`, `02-fatigue-firewall.png`, etc.)
- Salvare in: `evidence/screenshots/`
- Browser: Chrome cu zoom 100%

## prerequisite

```bash
# terminal 1: pornire backend in mod demo (rapid + fara dependinte externe)
cd /Users/david/devlife
DEMO_OFFLINE=true ./scripts/dev.sh

# verificare
curl http://localhost:8000/health  # → {"status":"alive","ghost":"watching"}
curl http://localhost:8000/ready   # → {"ready":true,"demo_offline":true}
```

deschide http://localhost:5173 in Chrome.

---

## capturile

### 01 — main menu (pentru §1.1)
- **ce arata**: meniul principal cu intro cinematic animat, butoane START / DEMO / SETTINGS
- **cum**: la pornirea aplicatiei, primul ecran. Asteapta 1-2s pentru animatia de intro.
- **focus**: brand, paleta calda, font Fredoka

### 02 — camera izometrica RELAXED (pentru §1.1, §3.10)
- **ce arata**: camera 2.5D cu Ghost vizibil, HUD biometric in colt, paleta Animal Crossing warm
- **cum**: START → asteapta sa intri in scena Room → starea initiala e RELAXED
- **focus**: vibrant warm palette, atmosfera prietenoasa, Ghost cu aura

### 03 — diagrama arhitectura (pentru §2.1)
- **ce arata**: diagrama ASCII din `docs/architecture.md` exportata ca imagine
- **cum**: foloseste un tool ca [carbon.now.sh](https://carbon.now.sh) sau screenshot la sectiunea din MD afisata in browser cu zoom mare
- **alternativa**: deseneaza o diagrama proprie cu Excalidraw + ai cei 5 layers + 3 servicii externe

### 04 — dashboard biometric (pentru §3.1, §3.6)
- **ce arata**: HUD complet cu HR, HRV, recovery, strain, sleep, CQI, autonomic balance, ECG procedural
- **cum**: in scena Room, apasa `TAB` pentru a deschide Dashboard Overlay (BeneathView)
- **focus**: grafic ECG live, valori biometrice, indicatori CQI

### 05 — FATIGUE FIREWALL in actiune (pentru §3.2) ⭐ CEL MAI IMPORTANT
- **ce arata**: terminal in-game cu comanda `git push --force` tastata + speech bubble Ghost cu "FATIGUE FIREWALL — HRV 28ms, stress 1.8/3.0. 'force push' este ireversibil." + butoane "Save Draft" / "Do It Anyway" / "Remind Later"
- **cum**:
  1. apasa `3` pe hotbar → schimba la FATIGUED
  2. apropie-te de obiectul `desk_terminal` (apare prompt `[E]`)
  3. apasa `E` → se deschide terminal app
  4. tasteaza: `git push --force origin main`
  5. asteapta interventia (instant, < 10ms)
- **focus**: warning critic, butoane safety-first, biometrice citate explicit

### 06 — Apply Fix preview side-by-side (pentru §3.3)
- **ce arata**: dialog cu cod "Inainte" stanga si cod "Dupa" dreapta, diff highlighted
- **cum**:
  1. apasa `2` (STRESSED) sau lasa RELAXED
  2. apropie-te de `desk_computer` → `E`
  3. tasteaza cod cu bug evident
  4. asteapta interventia Ghost cu Apply Fix suggestion (poate dura 5-30s daca Claude e online)
  5. click "Apply Fix" → apare preview
- **focus**: side-by-side diff, rationale Claude jos, butoane Confirma/Anuleaza
- **note**: in DEMO_OFFLINE Apply Fix se va declansa pe trigger manual prin DemoMode

### 07 — Apply Fix audit log in SQLite (pentru §3.3)
- **ce arata**: rezultatele unei interogari SQL cu rows preview/confirm/rollback
- **cum**:
  ```bash
  sqlite3 devlife.db "SELECT id, action, file, ts FROM apply_fix_audit ORDER BY ts DESC LIMIT 10;"
  ```
- **focus**: 3+ actiuni inregistrate cu timestamp si patch_hash

### 08 — banner "Mod degradat" / DEMO_OFFLINE (pentru §3.4)
- **ce arata**: banner in partea de sus ("Mod degradat — demo offline")
- **cum**: la pornire in `DEMO_OFFLINE=true`, banner-ul apare automat dupa 2s
- **focus**: indicator vizual ca aplicatia ruleaza in mod degradat

### 09 — sleep mode activ (pentru §3.5)
- **ce arata**: camera intunecata, Ghost retras, posibil mesaj "noapte buna"
- **cum**: deconecteaza BLE (sau lasa BLE neconectat) > 10 secunde, sau triggereaza manual din DemoMode
- **focus**: ambient dark, Ghost in animatie sleep

### 10 — dashboard cu ECG procedural in detaliu (pentru §3.6)
- **ce arata**: zoom pe HUD-ul biometric cu graficul ECG live
- **cum**: in Room, TAB pentru Dashboard, focus pe HUD-ul mic permanent
- **focus**: ECG ondulat, valori updateaza in timp real

### 11 — Settings cu toggle limba RO/EN (pentru §3.7)
- **ce arata**: meniul Settings cu optiunea de limba selectabila
- **cum**: din MainMenu sau pe parcurs, click "Settings" → vezi sectiunea "Limba"
- **focus**: toggle vizibil RO/EN, alta interactiune (volum, mute)

### 12 — CodeEditor in-game cu sugestie Apply Fix (pentru §3.9)
- **ce arata**: editorul Monaco deschis cu cod scris si o sugestie Ghost activa
- **cum**: vezi 06; capture momentul cand cod + speech bubble sunt vizibile
- **focus**: editor Monaco realist + Ghost vorbeste

### 13 — Terminal cu comanda risky (pentru §3.9)
- **ce arata**: terminal in-game cu `rm -rf` sau `DROP TABLE` tastat + interventie Ghost
- **cum**: similar cu 05, dar tasteaza alt pattern (de ex. `rm -rf /tmp/test`)
- **focus**: detectare instant fara API call (latenta vizibila < 10ms)

### 14 — Town scene cu player + Ghost + cladiri (pentru §3.10)
- **ce arata**: scena exterioara cu Town, player, Ghost-ul urmaritor, cladiri (Cafe + Cowork vizibile)
- **cum**: in Room, mergi la usa (door) → apasa `T` sau interactioneaza → tranzitie la Town
- **focus**: lume exterioara, multiple cladiri, atmosfera diferita de Room

### 15 — CafeScene cu sistem brewing (pentru §3.10)
- **ce arata**: cafeneaua cu sistemul de brewing interactiv
- **cum**: din Town, intra in Cafe (click sau collide cu door)
- **focus**: detalii brewing, NPCs, atmosfera "productive zone"

### 16 — CoworkScene cu NPCs animate (pentru §3.10)
- **ce arata**: spatiul de coworking cu NPC-urile in actiune
- **cum**: din Town, intra in Cowork
- **focus**: NPC animations, panouri interactive

### 17 — Plant procedural in 3 stadii (pentru §3.11)
- **ce arata**: 3 capturi side-by-side ale plant-ului: mic / mediu / mare (sau wilting)
- **cum**: capture la perioade diferite, dupa interactiuni acceptate (creste) sau ignorate (scade)
- **focus**: progresie vizibila, growth animation

### 18 — Cinematic outro credits (pentru §3.12)
- **ce arata**: frame din secventa outro cu credits derulant
- **cum**: triggereaza DemoMode complet (din MainMenu → DEMO buton) si capturealtra cadru cu credits
- **focus**: nume autori, polish vizual

### 19 — Desktop mode cu Claude Vision (pentru §3.13)
- **ce arata**: aplicatie rulata cu `GAME_MODE=False` + screenshot capturat din IDE real (VS Code) + interventie Ghost overlay
- **cum**:
  ```bash
  GAME_MODE=False ./scripts/dev.sh
  ```
  apoi deschide VS Code in alt monitor, scrie cod, asteapta interventia
- **focus**: integrare cu IDE real (nu in-game)
- **note**: necesita Claude API key activa, NU merge in DEMO_OFFLINE

### 20 — schema bazei de date in DB Browser (pentru §3.15)
- **ce arata**: DB Browser for SQLite cu cele 6 tabele expandate (sessions, interventions, biometric_samples, feedback, apply_fix_audit, consent)
- **cum**:
  ```bash
  brew install --cask db-browser-for-sqlite  # daca nu ai
  open devlife.db  # cu DB Browser
  ```
  expandeaza fiecare tabel
- **focus**: 6 tabele, relatii (FOREIGN KEY), tipuri de date

### 21 — terminal cu dev.sh + servere pornite (pentru §5.4)
- **ce arata**: output-ul `./scripts/dev.sh` cu backend pe :8000 + frontend pe :5173 confirmati
- **cum**: rulare in terminal mare, screenshot dupa ce ambele au scris "ready"
- **focus**: doua porturi vizibile, logs structurate

### 22 — Railway dashboard cu deployment activ (pentru §5.5)
- **ce arata**: dashboard Railway cu serviciul DevLife in stare "Active" + URL public
- **cum**: log in pe railway.app → proiect DevLife → captura
- **focus**: deployment URL vizibil, logs verzi, status active

### 23 — bonus scenariu "git reset --hard la 1:30 AM" (pentru §7.3)
- **ce arata**: terminal cu `git reset --hard origin/main` tastat + Fatigue Firewall + clock vizibil 01:30
- **cum**: la 1:30 AM (sau cu sistem clock schimbat), STARE FATIGUED, tasteaza in terminal
- **focus**: realismul scenariului — biometrice de FATIGUE + ora tarzie + comanda ireversibila

### 24 — desk code runner Python happy path (pentru §3.9, II.1)
- **ce arata**: desk code editor cu tab Python, `print(sum(range(100)))` → output `4950`, exit 0
- **cum**: deschide `desk_computer` → tab PY → scrie codul → Run
- **focus**: output panel verde, exit code 0, Pyodide ruleaza Python in browser

### 25 — runner Python error → Ghost (pentru §3.3, III.2) ⭐ DEMO SET-PIECE
- **ce arata**: Python runtime error in rosu in output panel + bubble Ghost cu sugestie Apply Fix
- **cum**: scrie cod cu bug (ex: `1/0` sau acces index invalid) → Run → eroarea declanseaza ghost loop
- **focus**: runtime-error → ghost intervention pipeline, butonul Apply Fix vizibil

### 26 — runner JS timeout (pentru §3.9, II.4)
- **ce arata**: tab JS cu `while(1){}` → dupa 5s, mesaj rosu "Execution timed out (5s limit)"
- **cum**: tab JS → scrie bucla infinita → Run → asteapta 5s
- **focus**: Web Worker sandbox cu timeout, protectie impotriva buclelor infinite

### 27 — runner review-only hint (pentru §3.9)
- **ce arata**: tab C++ sau Go, butonul Run ascuns, hint "Doar review AI — comuta pe PY/JS pentru a rula"
- **cum**: comuta pe un limbaj fara runtime in browser
- **focus**: degradare gratioasa — review AI disponibil chiar fara executie

### 28 — WHOOP BLE live BPM (pentru §2.4, §3.6)
- **ce arata**: HUD cu puls real venit de la strap WHOOP prin Web Bluetooth; DemoHotbar arata indicator BLE verde
- **cum**: click "Pair WHOOP" → conecteaza banda → HUD afiseaza BPM live
- **focus**: integrare Chrome Web Bluetooth, manual override dezactivat in live mode
- **note**: necesita hardware WHOOP real

---

## tips practice

- **Foloseste Cmd+Shift+5 pe macOS** pentru capturi precise (region select)
- **Salveaza in PNG nu JPEG** — calitatea conteaza pentru jurori
- **Daca un screenshot e prea inalt**, fa crop la zona relevanta (focus pe Ghost + HUD nu zone goale)
- **Pentru DEMO_OFFLINE**: porneste cu `DEMO_OFFLINE=true ./scripts/dev.sh` ca toate apelurile externe sa fie mock-uite (zero latenta, fara erori de retea)
- **Pentru a forta o stare**: apasa `1` (RELAXED), `2` (DEEP_FOCUS in unele preset-uri), `3` (FATIGUED), `4` (RELAXED), `5` (WIRED) — verifica MockBiometrics.PRESETS pentru ordinea exacta
- **Pentru a ignora screenshot-ul de Railway (22)**: doar daca deploy-ul real e activ. Daca nu e, sare la 23 sau face screenshot la `docs/deploy-runbook.md` ca dovada de configurare.

## status

| # | nume | status | observatii |
|---|------|--------|------------|
| 01 | main-menu | ⏳ | |
| 02 | room-relaxed | ⏳ | |
| 03 | architecture-diagram | ⏳ | poate fi exportat ASCII din docs/architecture.md |
| 04 | hud-biometric | ⏳ | |
| 05 | fatigue-firewall | ⏳ | **CRITICAL — capture cel mai important** |
| 06 | apply-fix-preview | ⏳ | |
| 07 | apply-fix-audit-sql | ⏳ | |
| 08 | degraded-mode-banner | ⏳ | |
| 09 | sleep-mode | ⏳ | |
| 10 | dashboard-ecg | ⏳ | |
| 11 | settings-language | ⏳ | |
| 12 | codeeditor-with-fix | ⏳ | |
| 13 | terminal-risky | ⏳ | |
| 14 | town-scene | ⏳ | |
| 15 | cafe-scene | ⏳ | |
| 16 | cowork-scene | ⏳ | |
| 17 | plant-progression | ⏳ | 3 capturi side-by-side |
| 18 | outro-credits | ⏳ | |
| 19 | desktop-mode | ⏳ | optional, depinde de Claude API |
| 20 | db-schema | ⏳ | |
| 21 | dev-sh-running | ⏳ | |
| 22 | railway-deploy | ⏳ | optional, depinde de deploy |
| 23 | scenariu-git-reset | ⏳ | bonus pentru §7.3 |
| 24 | runner-python-happy | ⏳ | desk code runner, Pyodide |
| 25 | runner-python-error-then-ghost | ⏳ | **DEMO SET-PIECE** runtime error → ghost |
| 26 | runner-js-timeout | ⏳ | Web Worker sandbox 5s |
| 27 | runner-review-only-hint | ⏳ | degradare gratioasa C++/Go |
| 28 | whoop-ble-live-bpm | ⏳ | optional, necesita hardware WHOOP |
