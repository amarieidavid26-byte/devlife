# instalare si rulare — DevLife

## cerinte

- Python 3.11+
- Node.js 18+
- git

## local (prima oara)

```bash
git clone <repo-url>
cd <repo>/devlife
./scripts/setup.sh
```

creeaza venv, instaleaza deps Python si Node.

## pornire locala

```bash
cd devlife
./scripts/dev.sh
```

porneste backend pe http://localhost:8000 si frontend pe http://localhost:5173

## .env

creeaza `devlife/.env` dupa modelul `devlife/.env.example`:

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

Procfile la root: `web: cd devlife && uvicorn server:app --host 0.0.0.0 --port $PORT`

## verificare

```bash
curl http://localhost:8000/health
# {"status":"alive","ghost":"watching"}
```

## probleme comune

**`ModuleNotFoundError`** — ai uitat `source venv/bin/activate` sau n-ai rulat setup.sh

**frontend nu porneste** — `cd devlife/frontend && npm install`

**ghost nu raspunde** — verifica `CLAUDE_API_KEY` in .env; fara cheie merge cu fallback_responses
