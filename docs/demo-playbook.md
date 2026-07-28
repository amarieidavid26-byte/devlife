# demo playbook: DevLife
# InfoEducație 2026, sectiunea Software Utilitar

durata tinta: 7-10 minute

---

## 0. inainte de prezentare (setup, ~2 min inainte)

```bash
cd devlife
DEMO_OFFLINE=true ./scripts/dev.sh
```

verifica:
- `curl http://localhost:8000/ready` → `{"ready":true,"demo_offline":true}`
- frontend deschis pe `http://127.0.0.1:5173`, nu pe localhost: Spotify respinge redirect URI-urile `localhost`, iar originea `127.0.0.1` e oricum in lista permisa pentru WS
- browser deschis, tab pregatit

daca ceva nu merge: `curl http://localhost:8000/health` → daca returneaza `alive`, backend-ul e ok, problema e frontend-ul.

### materiale pregatite

- tab 1: aplicatia pe `http://127.0.0.1:5173`
- tab 2: raportul HTML de sesiune exportat dintr-o repetitie (butonul "Exportă raport" din dashboard-ul deschis cu TAB, endpoint `/api/session/report/html`); fisierul e self-contained (CSS si SVG inline), se deschide si fara backend sau internet, deci ramane piesa de aratat orice ar pica
- tab 3: `evidence/screenshots/` deschis local (23 de capturi, lista in `evidence/screenshots/README.md`); daca un pas al demo-ului esueaza live, arati captura pasului si mergi mai departe
- un terminal separat, cu comanda de audit din pasul 2e deja scrisa (`sqlite3 devlife.db ...`)

### ordinea de pornire: banda BLE se conecteaza ULTIMA

O conexiune Web Bluetooth traieste exact cat pagina: orice reincarcare o rupe, si
re-imperecherea cere din nou selectorul din browser. Doua actiuni din aplicatie reincarca
pagina, deci trebuie facute **inainte** de a conecta banda:

1. **alege limba** (RO/EN): schimbarea limbii reincarca pagina (`SettingsMenu.js`)
2. **conecteaza Spotify**, daca il arati: autorizarea navigheaza la Spotify si revine pe o
   pagina noua (`Spotify.js`)
3. **abia acum** conecteaza banda BLE
4. dupa pas 3, nu mai schimba limba si nu mai atinge Spotify

Reteaua NU e o problema. Bluetooth-ul e o legatura radio locala, iar WebSocket-ul se
reconecteaza singur, cu backoff, fara sa reincarce pagina. Internet prost inseamna
reconectare tacuta, nu pierderea pulsului.

### dupa un refresh, banda BLE se re-imperecheaza cu UN click

Regula de baza: **nu reincarca pagina dupa ce ai conectat banda.** Ordinea de mai sus (limba
si Spotify inainte de banda) evita singurele reincarcari pe care le face aplicatia, deci in
demo-ul rulat corect problema nu apare deloc. Nu cere niciun flag.

Daca totusi pagina se reincarca (Cmd-R accidental), **apasa din nou butonul Pair**: o
singura data, si banda revine. Pe macOS asta e singura cale sigura.

Nota tehnica (de ce nu se reconecteaza singura pe Mac): aplicatia incearca o reconectare
tacuta prin `navigator.bluetooth.getDevices()`, dar pe macOS/CoreBluetooth un dispozitiv
intors de `getDevices()` nu e conectabil direct. Trebuie re-descoperit printr-un scan
(`watchAdvertisements`), iar un ceas deja bonded la nivel de sistem (ex: Huawei) adesea nu
mai emite reclamele pe care le-ar astepta scanul. Metoda sta si in spatele flag-ului
`chrome://flags/#enable-web-bluetooth-new-permissions-backend`. Concluzia, verificata pe
specificatie si pe platforma: reconectarea complet automata nu poate fi facuta sigura pe
macOS Chrome azi. Codul incearca (cu timeout de 6s ca sa nu blocheze niciodata pornirea) si,
cand nu reuseste, cade curat pe butonul Pair. Pe alt sistem sau cu flag-ul activat poate
reusi, dar nu te baza pe asta in demo. Bazeaza-te pe ordinea de pornire.

### banda BLE care se deconecteaza -> personajul adoarme

Cand banda tace (scoasa sau deconectata, inclusiv dupa un refresh), personajul intra in
sleep mode. **Iesire: apasa o tasta de stare 1-5 sau pur si simplu misca-te
(WASD / sageti / E)**, orice control manual il trezeste imediat si il tine treaz.
(Repunerea benzii pe incheietura il trezeste si ea, cand pulsul live revine.)

---

## 1. introducere: problema (1 min)

> "Developerii iau decizii proaste cand sunt obositi. Nu un timer, nu un pomodoro. Ceva care iti citeste biometricele in timp real."

arata README-ul pe scurt (problema si solutia, apoi stack-ul).

de mentionat: biometricele sunt reale, vin din WHOOP API si prin Chrome Bluetooth. Din ele
clasificam 5 stari cognitive (HRV, recovery, strain). Ghost brain-ul vorbeste prin Claude API.

---

## 2. demo live: fluxul principal (4 min)

### 2a. pornire si meniu (30s)
- deschide `http://127.0.0.1:5173`
- arata meniul principal, cu titlu si subtitlu in romana
- click Settings → arata toggle de limba RO/EN → pune pe RO
- START

### 2b. starea initiala: RELAXED (30s)
- arata HUD-ul cu biometrice simulate (recovery 85%, HRV 72, strain 4.5)
- "in mod normal acestea ar veni de pe WHOOP in timp real"
- arata toast-ul "Mod demo offline" din coltul ecranului

### 2c. fatigue firewall, cel mai important feature (1.5 min)
- apasa hotbar-ul → tasta `3` → schimba starea in FATIGUED
- deschide Terminal (tasta `T` sau click pe obiect)
- scrie `git push --force`
- ghost detecteaza instant comanda periculoasa (regex pattern, fara API call)
- **arata interventia**: "FATIGUE FIREWALL -- HRV 28ms, stress 1.8/3.0. 'force push' este ireversibil."
- arata butoanele: "Save Draft", "Do It Anyway", "Remind Later"
- click "Save Draft" → plant scade

### 2d. apply fix: preview + confirm (1.5 min)
- apasa hotbar-ul → tasta `2` → STRESSED
- deschide Code Editor (click desk_computer)
- scrie cod cu bug evident (ex: `result = calculateTotal(None)`)
- asteapta interventie ghost (sau triggereaza manual prin content_update)
- arata propunerea de fix cu "Apply Fix" button
- click "Apply Fix" → **arata preview dialog**: Inainte / Dupa, diff vizual
- click "Confirma" → fix aplicat, flash verde in editor
- arata toast-ul "Fix aplicat", cu butonul Revert pentru anulare

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
- SQLite persistent: datele supravietuiesc restart-ului
- toate globalele stau intr-un singur dataclass (AppState)
- Pydantic validation pe toate endpoint-urile POST
- rate limiting cu slowapi
- CORS restrictionat la originile cunoscute
- Settings → sectiunea "functii locale": dovada vizuala rapida ca functiile privilegiate sunt flag-uri opt-in din `.env`, toate ON in demo pentru ca ruleaza local

---

## 4. testare + calitate cod (1 min)

```bash
./scripts/run-tests.sh
```

sau arata rapid: `pytest tests/ -v`

puncte:
- 242 teste, coverage ~75% (unit + integration + WS flow + HRV live/RMSSD + dinamica tastarii + calibrare + setari/chei API + interventie firewall + override one-shot + ghost brain/analyzer cu client Claude stub-uit + session replay + keystroke firewall + firewall anti-drift + explicabilitate stare)
- test_biometric_classifier: clasele de stare cognitive
- test_apply_fix: contract, validator, lifecycle complet
- test_ws_flow: conexiune WebSocket end-to-end + handler heart_rate
- test_run_error_routing: desk code runner → ghost intervention

---

## 5. Q&A: raspunsuri pregatite

**"Este un joc sau o unealta utilitara?"**
> Camera izometrica e interfata de vizualizare. Core-ul e: biometrice reale → clasificare stare → interventie AI → firewall activ. Daca il rulezi pe desktop mode (GAME_MODE=False) captureaza screenshot-uri ale ecranului real.

**"Cum functioneaza clasificarea starii?"**
> Yerkes-Dodson: performanta optima la arousal moderat. FATIGUED: recovery < 40% sau sleep < 70%. STRESSED: HRV ratio < 0.75 sau strain > 16. DEEP_FOCUS: estimated_stress intre 0.9-1.5 cu strain moderat.

**"Apply Fix e sigur?"**
> Patch-ul trece prin validator inainte de aplicare: max 500 linii (fisier complet), fara metacaractere shell, rationale obligatoriu, range valid. Pre-imaginea e stocata pentru rollback, butonul Revert de pe toast o restaureaza. Totul e in audit log.

**"Ce date biometrice colectezi?"**
> HR, HRV, recovery, strain, sleep performance, SpO2, temperatura pielii. Toate vin doar din WHOOP, cu consimtamant explicit prin OAuth. Nimic fara acord.

**"Ai folosit AI pentru cod?"**
> Parti din cod au fost scrise cu asistenta AI (Claude), declarat in `docs/authorship.md`. Arhitectura si design-ul sunt ale noastre, la fel si logica de clasificare.

---

## tabel failure recovery

| simptom | cauza probabila | actiune live |
|---------|----------------|--------------|
| backend nu porneste | `.env` lipsa sau `venv` neactivat | `source venv/bin/activate && python3 server.py` |
| `/ready` returneaza 503 | `CLAUDE_API_KEY` lipsa | adauga in `.env` sau `DEMO_OFFLINE=true` |
| ghost nu raspunde | cooldown activ: gate de 8s dupa fiecare interventie (`loops.py`) sau cooldown-ul adaptiv de 20-60s din `GhostBrain.should_intervene` | schimba starea cu hotbar-ul: reseteaza ambele cooldown-uri (`ws_game.py`) |
| apply fix nu apare | continut prea scurt (`< 10 chars`) | scrie mai mult cod in editor |
| WHOOP token expirat | token WHOOP dureaza 1h | apasa `DEMO MODE` pe hotbar |
| WebSocket deconectat | backend restart | toast "Reconectare..." apare automat cu backoff; retry continua in fundal la nesfarsit |
| banda BLE s-a deconectat, pulsul a disparut | pagina s-a reincarcat (schimbare de limba, autorizare Spotify, refresh) | reconecteaza banda; daca nu ai timp, treci pe `DEMO MODE` din hotbar si continua, starea se forteaza cu tastele 1-5. Nu schimba limba dupa ce ai conectat banda |
| pulsul se opreste dar pagina nu s-a reincarcat | banda a iesit din raza sau de pe incheietura | HUD-ul arata `--` dupa 5s; aplicatia reincearca singura, cu backoff, ~2 min. Nu apasa nimic |
| pagina deschisa inaintea backend-ului | ordinea de pornire | nimic de facut, socket-ul reincearca singur si preia cand backend-ul e sus |
| Claude API cade in timpul demo-ului | timeout / cheie / retea | ghost-ul trece automat pe replici fallback pre-scrise (RO/EN), demo-ul continua |
| fara internet in sala | WiFi cazut | fonturile sunt self-hosted si Pyodide e local, deci demo-ul offline merge complet; pica doar replicile generate de Claude si Spotify |
| Python runner nu merge pe deploy | pyodide gitignored | fallback automat pe CDN jsdelivr (doar pe deploy; local e servit din `lib/pyodide/`) |

---

## beats noi de demo (adaugate pentru nationala)

1. **HRV live (RMSSD)**, cu strapul BLE conectat: "WHOOP va arata HRV-ul de ieri. Noi il calculam LIVE, din intervalele RR brute dintre batai, cu RMSSD pe fereastra de 60s. Uite punctul verde de langa HRV in HUD." (matematica: `biometric_engine.py::compute_live_hrv`, teste in `test_live_hrv.py`)
2. **Session Replay**: deschide dashboard-ul (TAB) → panoul "Replay sesiune": linia HR colorata dupa stare, liniile rosii = interventii. Scrub cu mouse-ul: "aici m-am blocat, aici ghost-ul m-a oprit din force push."
3. **Personalitate**: Settings → Personalitatea Ghost-ului → Sarcastic → declanseaza firewall-ul → replica sarcastica. 10 secunde, memorabil.
4. **Firewall server-side**, la intrebarea juriului "si daca ocolesti UI-ul?": conecteaza-te direct la WS-ul de terminal (sau arata `test_keystroke_firewall.py`). Serverul inghite Enter-ul si trimite Ctrl-U; comanda nu ajunge NICIODATA la shell. Defense in depth.
5. **Ghost invata**: dashboard → panoul "Ghost invata": rata de acceptare + cooldown-ul adaptiv ("3+ ignorate → Ghost s-a retras la 60s").
6. **Explicabilitate**: dashboard (TAB) → panoul "De ce aceasta stare?": semnalul dominant si motivul cu praguri concrete, plus factorii cu efectul lor (decisiv, veto). Punctul de spus juriului: starea e calculata local de clasificator, ghost-ul AI doar formuleaza mesajul, nu decide niciodata starea.
