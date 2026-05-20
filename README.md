# DevLife

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
- **fatigue firewall** — detecteaza comenzile periculoase si le blocheaza cand starea ta e FATIGUED
- **apply fix** — ghost vede bug-uri in cod si propune fix-uri cu preview + confirm + rollback
- **desk code runner** — butonul Run executa Python (Pyodide) si JavaScript (Web Worker) in sandbox; runtime errors merg la ghost prin flow-ul apply-fix. detalii in `docs/desk-code-runner.md`
- **sleep mode** — dai jos wearable-ul si camera se intuneca automat
- **demo offline** — fara backend, biometricele sunt simulate client-side: starile (1-5), HUD-ul, ghost-ul si ECG-ul functioneaza complet (doar replicile AI ale ghost-ului au nevoie de backend)

## tech stack

- frontend: vanilla JS + PixiJS (camera izometrica procedurala, fara sprite-uri)
- editor: Monaco (bundled ESM) + xterm.js (terminal) + provideri inline AI / LSP
- backend: Python + FastAPI + WebSockets; PTY (stdlib `pty`), file API, LSP bridge
- AI: Claude API (Anthropic) — ghost brain (Sonnet) + completari inline (Haiku)
- biometrice: WHOOP API + Chrome Web Bluetooth
- persistenta: SQLite
- deploy: Railway (functiile locale privilegiate — terminal/fisiere/LSP — sunt OFF in prod)

## arhitectura

```
Browser (PixiJS)  <──ws://──>  FastAPI (Python)  <──>  Claude API
                                     │
                               SQLite (sessions,
                               interventions, audit)
                                     │
                              WHOOP API / BLE mock
```

## instalare

```bash
git clone <repo>
cd devlife
./scripts/setup.sh    # venv + deps
./scripts/dev.sh      # porneste backend + frontend
```

vezi `docs/install-runbook.md` pentru setup complet cu .env.

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
