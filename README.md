# DevLife

[![CI](https://github.com/amarieidavid26-byte/devlife/actions/workflows/ci.yml/badge.svg)](https://github.com/amarieidavid26-byte/devlife/actions/workflows/ci.yml)

developerii fac greseli proaste cand sunt obositi. nu un timer. nu un pomodoro app. ceva care iti citeste biometricele in timp real si spune "hey nu da push la productie acum".

DevLife e un companion AI conectat la corpul tau prin WHOOP. citeste heart rate, HRV, recovery, stress - si clasifica starea ta cognitiva. cand esti in deep focus, te lasa in pace. cand esti cooked la 2am, activeaza Fatigue Firewall-ul si blocheaza comenzile periculoase inainte sa faci ceva de care o sa iti para rau.

## cum functioneaza

biometrice (WHOOP + BLE) → clasificare stare cognitiva → ghost AI reactioneaza → interventii + firewall

**5 stari cognitive:** RELAXED · DEEP_FOCUS · STRESSED · FATIGUED · WIRED

ghost isi schimba personalitatea pentru fiecare stare. in FATIGUED, blocheaza activ comenzile de tip `git push --force`, `DROP TABLE`, `rm -rf`.

## features

- **biometrice reale** — WHOOP API (recovery/somn/strain) + Chrome Web Bluetooth pentru bpm live. heart rate-ul tau apare pe ecran cu badge `● LIVE`
- **IDE real in joc** — editorul Monaco (acelasi din VS Code) editeaza **fisiere reale** de pe PC: file tree, taburi, deschide/salveaza (Cmd/Ctrl+S). detalii in `docs/local-ide.md`
- **terminal real** — un shell adevarat (zsh) in joc via xterm.js + PTY pe backend; ruleaza orice comanda, inclusiv TUI-uri (vim, htop)
- **biometric Cursor** — completari AI inline (ghost-text in stil Cursor, Claude Haiku, accepti cu Tab) care se **adapteaza la starea ta cognitiva**: prudente/safety-first cand esti FATIGUED/STRESSED, minimale in DEEP_FOCUS. badge `🧠 <STARE>` in editor.
- **inteligenta de limbaj (LSP)** — diagnostice, autocomplete si hover reale prin pyright / typescript-language-server
- **Open in full VS Code** — buton care lanseaza code-server (VS Code real, 1:1) in iframe pe acelasi workspace, pentru editare „power". local-only.
- **fatigue firewall** — detecteaza comenzile periculoase si le blocheaza cand starea ta e FATIGUED. **defense in depth**: pe langa interceptarea din UI, serverul mirroreaza tastele in PTY si inghite Enter-ul (inlocuit cu Ctrl-U) — comanda nu ajunge niciodata la shell, chiar daca ocolesti browserul
- **HRV live (RMSSD)** — cand strapul transmite intervalele RR intre batai (BLE flag bit 4), calculam RMSSD pe fereastra glisanta de 60s, cu filtrare de artefacte. WHOOP iti arata HRV-ul de ieri; noi il calculam in timp real, in mijlocul sesiunii de cod
- **dinamica tastarii** — stres si oboseala estimate din ritmul tastarii (intervale intre taste, rata de backspace, pauze) fata de baseline-ul tau personal — functioneaza **fara niciun wearable**. confidentialitate: se trimit doar intervale si categorii, niciodata ce tastezi. fuziune: pulsul real > tastare > sumar WHOOP > mock
- **calibrare personala persistenta** — baseline-urile tale (ritm de tastare, HR de repaus, HRV de referinta) se salveaza in SQLite si se incarca la pornire; din a doua sesiune sistemul te compara cu TINE, nu cu valori hardcodate
- **session replay** — fiecare sesiune e inregistrata in SQLite (sample-uri biometrice + interventii); dashboard-ul are un timeline colorat pe stari prin care poti face scrub: "aici am obosit, aici ghost-ul m-a oprit din force push"
- **raport de sesiune exportabil** — `GET /api/session/report/html` genereaza un raport HTML self-contained (CSS + SVG inline, se deschide offline): distributia starilor, puls min/max/mediu, timeline colorat pe stare cu tick-uri pe interventii, tabelul interventiilor. RO/EN prin `?lang=`
- **chei API din aplicatie (BYOK)** — panoul "Chei API" din dashboard: iti pui cheia Claude si credentialele WHOOP direct din UI, fara sa editezi `.env`; se salveaza in SQLite-ul local (niciodata pe alt server), se aplica instant fara restart, iar API-ul returneaza doar ultimele 4 caractere (endpoint protejat cu session token)
- **personalitate ghost** — antrenor strict / prieten cald / sarcastic, din Settings; schimba tonul interventiilor AI
- **apply fix** — ghost vede bug-uri in cod si propune fix-uri cu preview + confirm + rollback (buton Revert pe toast)
- **desk code runner** — butonul Run executa Python (Pyodide) si JavaScript (Web Worker) in sandbox; runtime errors merg la ghost prin flow-ul apply-fix. detalii in `docs/desk-code-runner.md`
- **sleep mode** — dai jos wearable-ul si camera se intuneca automat
- **demo offline** — fara backend, biometricele sunt simulate client-side: starile (1-5), HUD-ul, ghost-ul si ECG-ul functioneaza complet (doar replicile AI ale ghost-ului au nevoie de backend)
- **extensie VS Code (DevLife Bridge)** — acelasi protocol WS, dar cu contextul REAL din editorul tau: ghost-ul analizeaza codul pe care il scrii efectiv, interventiile apar ca notificari VS Code, starea cognitiva sta in status bar. DevLife devine utilitar real, nu doar joc. detalii in `vscode-extension/README.md`

## public tinta

- **developeri care lucreaza noaptea / freelanceri** — nimeni nu le spune "opreste-te"; DevLife o face pe baza de date, nu de ceas
- **studenti si elevi la informatica** — invata igiena cognitiva (somn, stres, pauze) direct in fluxul de lucru, gamificat
- **echipe mici / startup-uri** — un singur force push obosit pe productie costa mai mult decat tot setup-ul
- **quantified-self enthusiasts cu wearables** — au deja datele (WHOOP, Polar, orice strap BLE standard); DevLife e primul tool care le transforma in interventii active in editor si terminal

## tech stack

- frontend: vanilla JS + PixiJS (camera izometrica procedurala, fara sprite-uri)
- editor: Monaco (bundled ESM) + xterm.js (terminal) + provideri inline AI / LSP
- backend: Python + FastAPI + WebSockets; PTY (stdlib `pty`), file API, LSP bridge
- AI: Claude API (Anthropic) — ghost brain (Sonnet) + completari inline (Haiku)
- biometrice: WHOOP API + Chrome Web Bluetooth
- persistenta: SQLite
- deploy: Railway (functiile locale privilegiate — terminal/fisiere/LSP — sunt OFF in prod)

### de ce aceste tehnologii

| alegere | alternativa respinsa | motivul |
|---------|---------------------|---------|
| FastAPI | Flask / Django | WebSocket nativ + Pydantic integrat (validarea e parte din contractul Apply Fix); async fara plugin-uri |
| PixiJS 7 | Three.js / Phaser | 2D WebGL pur, control complet pe randarea izometrica procedurala (zero sprite-uri externe); Three.js e overkill 3D, Phaser impune un game-loop opinionat |
| vanilla JS | React / Vue | UI-ul de joc e canvas, nu DOM; un framework ar adauga un layer de reconciliere peste PixiJS fara castig |
| SQLite (WAL) | Postgres | zero deployment overhead, ACID, reads concurente; volumul (o sesiune de cod) nu justifica un server de DB |
| Claude API | GPT / local LLM | JSON structurat stabil pentru contractul de analiza + calitate pe cod; Haiku tine completarile inline sub ~1s |
| WHOOP + Web Bluetooth | doar API polling | API-ul da sumarul zilnic; BLE da pulsul + intervalele RR in timp real — din ele calculam HRV-ul live noi insine |
| Pyodide + Web Worker | executie pe server | codul utilizatorului ruleaza sandboxed in browser, zero risc pe server; workerul se poate termina fortat la timeout |
| pty (stdlib) | node-pty / xterm server | zero dependinte native; add_reader pe master fd = streaming fara thread busy |

## arhitectura

```
Browser (PixiJS)  <──ws://──>  FastAPI (Python)  <──>  Claude API
                                     │
                               SQLite (sessions,
                               interventions, audit)
                                     │
                              WHOOP API / BLE mock
```

## structura proiectului

```
devlife/
├── server.py             # FastAPI app: rute HTTP + endpoint-uri WebSocket (joc + privilegiate)
├── runtime.py            # AppState partajat, singletons (engine/brain/analyzer), broadcast
├── loops.py              # thread-urile daemon: biometric_loop (5s) + ghost_loop (1s)
├── ws_game.py            # handler-ele mesajelor WS de joc (dispatch map, seam de extensie)
├── biometric_engine.py   # WHOOP OAuth, clasificare stari, RMSSD/HRV live din RR
├── keystroke_dynamics.py # stres/oboseala din ritmul tastarii (semnal zero-hardware)
├── session_report.py     # raport HTML de sesiune, self-contained (CSS+SVG inline)
├── ghost_brain.py        # decizia de interventie, prompturi per stare, personalitati
├── content_analyzer.py   # analiza continutului din app-uri + detectie instant comenzi riscante
├── terminal_pty.py       # sesiune PTY reala + KeystrokeFirewall (firewall server-side)
├── security.py           # origin check, token per proces, jail pe WORKSPACE_ROOT
├── file_api.py           # operatii pe fisiere, limitate la workspace
├── lsp_bridge.py         # punte WebSocket <-> pyright / typescript-language-server
├── inline_completer.py   # completari inline AI (Claude Haiku), adaptate starii
├── code_server.py        # lansare code-server ("Open in full VS Code")
├── fallback_responses.py # replici ghost pre-scrise (RO/EN) cand Claude nu raspunde
├── apply_fix/            # contract Pydantic + validator + audit pentru patch-uri
├── persistence/          # SQLite (WAL) + migratii: sesiuni, interventii, replay
├── tests/                # 151 teste pytest
├── frontend/
│   └── src/
│       ├── main.js       # bootstrap PIXI + lumea camerei + game loop
│       ├── game/         # wiring: socketHandlers, keyboard, scenes, BLE, apply-fix flow
│       ├── theme.js      # paleta per stare (sursa unica)
│       ├── room/         # camera izometrica procedurala (Room, Furniture, Plant, Atmosphere)
│       ├── character/    # Player + Ghost
│       ├── town/         # scenele exterioare (Town, Cafe, Cowork)
│       ├── apps/         # Monaco editor, terminal xterm, browser, notes, chat + runners
│       ├── hud/          # HUD biometric, dashboard/ (ECG, sparkline, replay), toasts
│       ├── network/      # WebSocket, BLE (RR intervals), KeystrokeCapture, Spotify
│       ├── audio/        # sunete sintetizate procedural (Web Audio)
│       ├── demo/         # secventa demo cinematica
│       └── i18n/         # RO/EN (524 chei, paritate garantata)
├── vscode-extension/     # DevLife Bridge: contextul real din VS Code -> acelasi backend
├── docs/                 # arhitectura, securitate, demo playbook, pozitionare
├── evidence/             # teste, licente, screenshots, team-process
└── scripts/              # setup, dev, run-tests, healthcheck
```

## instalare

```bash
git clone <repo>
cd devlife
./scripts/setup.sh    # venv + deps
./scripts/dev.sh      # porneste backend + frontend
```

vezi `docs/install-runbook.md` pentru setup complet cu .env.

## teste

```bash
./scripts/run-tests.sh    # 151 teste + junit.xml + coverage HTML in evidence/tests/
```

unit + integration: clasificator biometric, RMSSD/HRV live, dinamica tastarii (features + fuziune in clasificator), contract Apply Fix, keystroke firewall (PTY), sincronizare pattern-uri firewall frontend/backend, session replay, flux WebSocket end-to-end, security jail. detalii in `evidence/tests/SUMMARY.md`.

## conectare WHOOP (date reale)

Ca să vezi datele tale reale (recovery, somn, strain) și heart rate live:

1. **Înregistrează o aplicație** la [developer.whoop.com](https://developer.whoop.com) → obții `client_id` și `client_secret`.
2. **Redirect URI** în dashboard-ul WHOOP trebuie să fie exact `http://localhost:8000/api/whoop/callback` (string-match — păstrează `localhost`, nu `127.0.0.1`).
3. **Scopes**: bifează `offline` + `read:recovery` `read:cycles` `read:sleep` `read:workout` `read:body_measurement` `read:profile`. `offline` e obligatoriu — fără el conexiunea moare după ~1h.
4. Pune valorile în `.env`:
   ```
   WHOOP_CLIENT_ID=...
   WHOOP_CLIENT_SECRET=...
   WHOOP_REDIRECT_URI=http://localhost:8000/api/whoop/callback
   ```
5. Pornește appul, apasă **Connect WHOOP** → consimțământ → te întorci în joc, tokenul se salvează în `.whoop_tokens.json` și se reîncarcă automat la următoarea pornire.

**Heart rate live** (BLE): pe telefon, în WHOOP app → **Device Settings → Broadcast Heart Rate = ON**, apoi apasă **Pair** în joc. Necesită **Chrome sau Edge** (Web Bluetooth nu există în Safari/Firefox).

**De reținut, ca să fim corecți:** doar HR-ul prin BLE e live (badge `● LIVE`). Recovery / HRV / strain / somn sunt **sumarul de dimineață** de la WHOOP (calculat o dată pe zi, badge `WHOOP`), nu în timp real. "Stress" e **derivat** din deviația HRV față de baseline-ul tău de 14 zile — WHOOP nu expune un câmp de stress în API.

## IDE local, terminal & LSP

> **Rulează LOCAL pentru experiența completă.** Terminalul real, editarea fișierelor de pe
> PC, LSP, completările AI și „Open in VS Code" funcționează **doar local** (`./scripts/dev.sh`)
> — un site public nu poate atinge fișierele de pe calculatorul unui vizitator, deci pe
> deploy ele sunt dezactivate intenționat. Versiunea de pe Vercel e un teaser (joc +
> biometrice + ghost + demo offline).

Editorul si terminalul din joc lucreaza cu **fisiere reale** de pe masina ta, fiindca
backend-ul ruleaza local. Totul e limitat la un singur director (`WORKSPACE_ROOT`).

- **Workspace**: implicit `./workspace`. Pointeaza-l catre un proiect real cu
  `WORKSPACE_ROOT=/cale/catre/proiect` in `.env`.
- **Flag-uri locale** (in `.env`, default OFF — vezi `.env.example`): `TERMINAL_ENABLED`,
  `FILES_ENABLED`, `LSP_ENABLED`, `INLINE_AI_ENABLED`, `CODE_SERVER_ENABLED`.
- **Inteligenta de limbaj (optional)**: instaleaza serverele LSP local —
  `pip install pyright` (Python) si `npm i -g typescript-language-server typescript`
  (JS/TS). Daca lipsesc, editorul merge fara diagnostice/autocomplete LSP.
- **Open in full VS Code (optional)**: instaleaza code-server o singura data —
  `curl -fsSL https://code-server.dev/install.sh | sh` — apoi `CODE_SERVER_ENABLED=true`
  in `.env`. Butonul „Open in VS Code" lanseaza VS Code real (1:1) in iframe pe workspace.
- **Browser**: Chrome/Edge (Web Bluetooth pentru WHOOP BLE; restul merge si in altele).
- **Securitate**: backend-ul asculta doar pe `127.0.0.1`, fiecare endpoint privilegiat
  cere un token de sesiune + verifica Origin, iar accesul la fisiere e blocat in afara
  `WORKSPACE_ROOT`. Pe deploy hostat toate aceste functii raman OFF (fail-safe by default).

Detalii de arhitectura: `docs/local-ide.md`.

## resurse externe

- [Kenney.nl](https://kenney.nl) — assets izometrice (CC0)
- [PixiJS](https://pixijs.com) — rendering canvas (MIT)
- [FastAPI](https://fastapi.tiangolo.com) — web framework (MIT)
- [Claude API](https://anthropic.com) — Anthropic
- [WHOOP API](https://developer.whoop.com) — WHOOP
