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

## resurse externe

- [Kenney.nl](https://kenney.nl) — assets izometrice (CC0)
- [PixiJS](https://pixijs.com) — rendering canvas (MIT)
- [FastAPI](https://fastapi.tiangolo.com) — web framework (MIT)
- [Claude API](https://anthropic.com) — Anthropic
- [WHOOP API](https://developer.whoop.com) — WHOOP
