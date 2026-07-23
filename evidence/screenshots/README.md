# screenshots: index pentru predare

Capturi pentru documentatia DOCX + sustinerea rubricii (Cap III + IV.2). **23 din 36 facute.**
PNG minim 1920x1080, numite dupa numarul din tabel (`01.png`), salvate aici.
Pornire: `DEMO_OFFLINE=true ./scripts/dev.sh`, app pe http://localhost:5173 (Chrome, zoom 100%).
Stari fortate: `1` DEEP_FOCUS, `2` STRESSED, `3` FATIGUED, `4` RELAXED, `5` WIRED
(ordinea din `MockBiometrics.PRESETS`; pornim pe 4).

## facute

| # | slug | ce arata | DOCX |
|---|------|----------|------|
| 01 | main-menu | meniu principal cu intro animat, START / DEMO / SETTINGS | §1.1 |
| 02 | room-relaxed | camera 2.5D cu Ghost si HUD biometric, stare RELAXED | §1.1, §3.10 |
| 03 | architecture-diagram | diagrama arhitecturii: 5 layers + 3 servicii externe | §2.1 |
| 04 | hud-biometric | dashboard (TAB): HR, HRV, recovery, strain, sleep, CQI, autonomic balance, ECG | §3.1, §3.6 |
| 05 | fatigue-firewall | `git push --force` blocat, bubble cu HRV 28ms + stres 1.8/3.0, butoane Save Draft / Do It Anyway / Remind Later; **cea mai importanta captura** | §3.2 |
| 06 | apply-fix-preview | diff side-by-side Inainte/Dupa cu rationale si Confirma/Anuleaza | §3.3 |
| 07 | apply-fix-audit-sql | randuri preview/confirm/rollback din `apply_fix_audit` | §3.3 |
| 10 | dashboard-ecg | zoom pe ECG-ul procedural live din HUD | §3.6 |
| 11 | settings-language | Settings cu toggle limba RO/EN | §3.7 |
| 12 | codeeditor-with-fix | editorul Monaco cu sugestie Ghost activa | §3.9 |
| 13 | terminal-risky | `rm -rf` detectat local, fara API call, < 10ms | §3.9 |
| 14 | town-scene | Town cu player, Ghost si cladirile Cafe + Cowork | §3.10 |
| 15 | cafe-scene | Cafe cu sistemul de brewing | §3.10 |
| 16 | cowork-scene | Cowork cu NPC-uri animate | §3.10 |
| 21 | dev-sh-running | `./scripts/dev.sh` cu backend :8000 + frontend :5173 ready | §5.4 |
| 24 | runner-python-happy | runner Python (Pyodide): `print(sum(range(100)))` → 4950, exit 0 | §3.9, II.1 |
| 25 | runner-python-error-then-ghost | runtime error rosu → interventie Ghost cu Apply Fix; **DEMO SET-PIECE** | §3.3, III.2 |
| 26 | runner-js-timeout | `while(1){}` oprit dupa 5s de sandbox-ul Web Worker | §3.9, II.4 |
| 27 | runner-review-only-hint | C++/Go fara buton Run, hint "Doar review AI" | §3.9 |
| 31 | personality-settings | Settings → Personalitatea Ghost-ului, "Sarcastic" activ | - |
| 32 | firewall-sarcastic | interventie firewall cu personalitatea Sarcastic | - |
| 34 | server-firewall-banner | banner rosu "FATIGUE FIREWALL (server)" in terminal, stare FATIGUED + comanda riscanta | - |
| 35 | shortcuts-overlay | overlay-ul de shortcuts (`?` in joc) | - |

## cele 13 ramase

Necesita banda WHOOP reala (le face colegul cu hardware):

- 28 whoop-ble-live-bpm (§2.4, §3.6): Pair WHOOP → HUD cu BPM live prin Web Bluetooth
- 33 hrv-live-dot: HUD cu HRV + punct verde (RMSSD live din RR)

Optionale, depind de servicii externe:

- 19 desktop-mode (§3.13): `GAME_MODE=False ./scripts/dev.sh` + cheie Claude activa; nu merge in DEMO_OFFLINE
- 22 railway-deploy (§5.5): doar daca deploy-ul e viu; altfel folosim `docs/deploy-runbook.md` ca dovada de configurare

De facut in DEMO_OFFLINE, fara hardware:

- 08 degraded-mode-banner (§3.4): apare automat dupa 2s la pornirea cu `DEMO_OFFLINE=true`
- 09 sleep-mode (§3.5): BLE neconectat > 10s, sau trigger manual din DemoMode
- 17 plant-progression (§3.11): trei capturi side-by-side, mic / mediu / mare
- 18 outro-credits (§3.12): MainMenu → DEMO, cadru cu credits
- 20 db-schema (§3.15): DB Browser for SQLite (`brew install --cask db-browser-for-sqlite`), deschide `devlife.db`, cele 8 tabele expandate
- 23 scenariu-git-reset (§7.3): `http://127.0.0.1:5173/?clock=01:30` (fixeaza ora afisata fara sa umbli la ceasul sistemului), `3` (FATIGUED) + TAB, tasteaza `git reset --hard origin/main`
- 29 session-replay-scrub: dashboard (TAB) → panoul "Replay sesiune", mouse pe timeline, readout vizibil
- 30 ghost-learning-panel: dashboard → "Ghost invata", rata acceptare + mesajul de cooldown adaptiv
- 36 plant-withering: planta ofilita (frunze cazand) dupa interventii ignorate
