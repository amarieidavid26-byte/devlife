# instalare si rulare: DevLife

## cerinte

- Python 3.11+
- Node.js 18+
- git

## local (prima oara)

```bash
git clone https://github.com/amarieidavid26-byte/devlife.git
cd <repo>
./scripts/setup.sh
```

creeaza venv, instaleaza deps Python si Node, descarca Pyodide si copiaza `.env.example` in `.env` daca lipseste.

## pyodide (pentru desk code runner)

setup.sh il ruleaza deja. Manual, doar daca ai sters folder-ul sau ai sarit peste setup:

```bash
./scripts/setup-pyodide.sh
```

descarca Pyodide 0.26.4 (arhiva ~284 MB; dezarhivata ocupa ~1.2 GB pe disc) in `frontend/public/lib/pyodide/`. Fara asta, JS-ul ruleaza dar tab-ul Python afiseaza eroare cand apesi Run. Folder-ul e in `.gitignore`, deci scriptul trebuie rulat pe fiecare masina.

## pornire locala

```bash
./scripts/dev.sh
```

porneste backend pe http://127.0.0.1:8000 si frontend pe http://127.0.0.1:5173 (foloseste 127.0.0.1 in browser, nu localhost: integrarea Spotify accepta doar origini 127.0.0.1)

## .env

setup.sh copiaza `.env.example` in `.env` la root; completeaza-l:

```
CLAUDE_API_KEY=sk-ant-...
WHOOP_CLIENT_ID=...
WHOOP_CLIENT_SECRET=...
WHOOP_REDIRECT_URI=http://localhost:8000/api/whoop/callback
PORT=8000
GAME_MODE=True
```

fara WHOOP merge in mock mode. fara CLAUDE_API_KEY ghost nu analizeaza cod (fallback activ).

## conectare WHOOP (date reale)

fara pasii de mai jos aplicatia ruleaza pe date simulate. cu ei, vezi recovery, somn si strain din contul tau, plus pulsul live de pe strap.

1. inregistreaza o aplicatie la [developer.whoop.com](https://developer.whoop.com); primesti `client_id` si `client_secret`.
2. Redirect URI in dashboard-ul WHOOP trebuie sa fie exact `http://localhost:8000/api/whoop/callback` (string-match: pastreaza `localhost`, nu `127.0.0.1`).
3. scopes: bifeaza `read:recovery` `read:cycles` `read:sleep` `read:profile`, exact acestea, altfel auth pica cu `invalid_scope`. aplicatia cere in plus scope-ul `offline` (nu apare in lista din dashboard); e obligatoriu pentru refresh token, fara el conexiunea moare dupa ~1h.
4. pune `client_id` si `client_secret` in `.env` (sectiunea de mai sus).
5. porneste appul si apasa "Conectează cont WHOOP" din Settings; dupa consimtamant te intorci in joc, iar tokenul se salveaza in `.whoop_tokens.json` si se reincarca automat la urmatoarea pornire.

### puls live (BLE)

pe telefon, in WHOOP app: Device Settings → Broadcast Heart Rate = ON. apoi apasa "Conectează senzor" in HUD. necesita Chrome sau Edge (Web Bluetooth nu exista in Safari/Firefox).

### ce e live si ce e sumar zilnic

doar pulsul prin BLE e live, cu badge `● LIVE` in HUD (`● ÎN DIRECT` in romana). recovery / HRV / strain / somn sunt sumarul de dimineata de la WHOOP, calculat o data pe zi (badge `WHOOP`). "stress" e derivat din deviatia HRV fata de baseline-ul tau personal de HRV (o medie mobila a valorilor zilnice); WHOOP nu expune un camp de stress in API.

## Railway (deploy)

variabile de environment necesare in Railway dashboard:

| variabila | valoare |
|-----------|---------|
| `CLAUDE_API_KEY` | cheia API Anthropic |
| `WHOOP_CLIENT_ID` | id aplicatie WHOOP |
| `WHOOP_CLIENT_SECRET` | secret aplicatie WHOOP |
| `WHOOP_REDIRECT_URI` | `https://<domeniu-railway>/api/whoop/callback` |
| `PORT` | setat automat de Railway |
| `GAME_MODE` | `True` |

Procfile la root: `web: uvicorn server:app --host 0.0.0.0 --port $PORT`

## verificare

```bash
curl http://localhost:8000/health
# {"status":"alive","ghost":"watching"}
```

## probleme comune

**`ModuleNotFoundError`**: ai uitat `source venv/bin/activate` sau n-ai rulat setup.sh

**frontend nu porneste**: `cd frontend && npm install`

**ghost nu raspunde**: verifica `CLAUDE_API_KEY` in .env; fara cheie merge cu fallback_responses

**desk code runner zice "Pyodide nu este disponibil"**: ruleaza `./scripts/setup-pyodide.sh` din root

**WHOOP pairing nu apare / BPM ramane 0**: Web Bluetooth merge doar pe HTTPS sau localhost si doar in Chrome/Edge. Verifica toast-ul de eroare (HTTPS lipsa / browser nesuportat). Verifica si ca pe telefon, in WHOOP app, Device Settings → Broadcast Heart Rate e ON; fara asta strapul nu emite nimic. Daca pairing reuseste dar HUD-ul nu arata puls live, deschide DevTools → Network → WS si verifica ca frame-uri `{"type":"heart_rate","bpm":...}` ajung la server. Backend-ul foloseste apoi `bio.live_heart_rate` (vezi `biometric_engine.py:49`).

**WHOOP s-a deconectat si nu se reconecteaza**: sunt 8 incercari cu backoff exponential (~2 min total). Dupa give-up apare toast-ul "Senzor de puls indisponibil". Apasa din nou butonul de imperechere din HUD.
