# instalare si rulare: DevLife

## cerinte

- Python 3.11+
- Node.js 18+
- git

## local (prima oara)

```bash
git clone <repo-url>
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

porneste backend pe http://localhost:8000 si frontend pe http://localhost:5173

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

**WHOOP pairing nu apare / BPM ramane 0**: Web Bluetooth merge doar pe HTTPS sau localhost si doar in Chrome/Edge. Verifica toast-ul de eroare (HTTPS lipsa / browser nesuportat). Daca pairing reuseste dar HUD-ul nu arata puls live, deschide DevTools → Network → WS si verifica ca frame-uri `{"type":"heart_rate","bpm":...}` ajung la server. Backend-ul foloseste apoi `bio.live_heart_rate` (vezi `biometric_engine.py:49`).

**WHOOP s-a deconectat si nu se reconecteaza**: sunt 8 incercari cu backoff exponential (~2 min total). Dupa give-up apare toast-ul "Senzor de puls indisponibil". Apasa din nou butonul de imperechere din HUD.
