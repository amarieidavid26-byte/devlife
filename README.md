# DevLife

developerii fac greseli proaste cand sunt obositi. nu un timer. nu un pomodoro app. ceva care iti citeste biometricele in timp real si spune "hey nu da push la productie acum".

DevLife e un companion AI conectat la corpul tau prin WHOOP. citeste heart rate, HRV, recovery, stress - si clasifica starea ta cognitiva. cand esti in deep focus, te lasa in pace. cand esti cooked la 2am, activeaza Fatigue Firewall-ul si blocheaza comenzile periculoase inainte sa faci ceva de care o sa iti para rau.

## cum functioneaza

biometrice (WHOOP + BLE) → clasificare stare cognitiva → ghost AI reactioneaza → interventii + firewall

**5 stari cognitive:** RELAXED · DEEP_FOCUS · STRESSED · FATIGUED · WIRED

ghost isi schimba personalitatea pentru fiecare stare. in FATIGUED, blocheaza activ comenzile de tip `git push --force`, `DROP TABLE`, `rm -rf`.

## features

- **biometrice reale** — WHOOP API + chrome bluetooth pentru bpm live. hartbatu tau apare pe ecran
- **fatigue firewall** — detecteaza comenzile periculoase si le blocheaza cand starea ta e FATIGUED
- **apply fix** — ghost vede bug-uri in cod si propune fix-uri cu preview + confirm + rollback
- **desk code runner** — editorul ruleaza Python (Pyodide) si JavaScript (Web Worker) direct in browser; runtime errors sunt trimise inapoi la ghost, care propune fix prin acelasi flow apply-fix. detalii in `docs/desk-code-runner.md`
- **sleep mode** — dai jos wearable-ul si camera se intuneca automat
- **fallback offline** — merge complet si fara WHOOP, cu biometrice simulate

## tech stack

- frontend: vanilla JS + PixiJS (camera izometrica procedurala, fara sprite-uri)
- backend: Python + FastAPI + WebSockets
- AI: Claude API (Anthropic) — analiza cod + ghost brain
- biometrice: WHOOP API + Chrome Web Bluetooth
- persistenta: SQLite
- deploy: Railway

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

## resurse externe

- [Kenney.nl](https://kenney.nl) — assets izometrice (CC0)
- [PixiJS](https://pixijs.com) — rendering canvas (MIT)
- [FastAPI](https://fastapi.tiangolo.com) — web framework (MIT)
- [Claude API](https://anthropic.com) — Anthropic
- [WHOOP API](https://developer.whoop.com) — WHOOP
