# deploy — DevLife

## local

```bash
cd devlife
./scripts/setup.sh   # prima oara
./scripts/dev.sh     # porneste backend + frontend
```

verifica: `curl http://localhost:8000/health` si `curl http://localhost:8000/ready`

## Railway

### variabile de environment (Railway dashboard → Variables)

| variabila | valoare |
|-----------|---------|
| `CLAUDE_API_KEY` | cheia API Anthropic |
| `WHOOP_CLIENT_ID` | id aplicatie WHOOP dev |
| `WHOOP_CLIENT_SECRET` | secret aplicatie WHOOP dev |
| `WHOOP_REDIRECT_URI` | `https://<domeniu>.railway.app/api/whoop/callback` |
| `GAME_MODE` | `True` |
| `ALLOWED_ORIGINS` | `https://<domeniu-frontend>.railway.app` |
| `DB_PATH` | `/data/devlife.db` (pe un Railway volume) |
| `PORT` | setat automat de Railway, nu il adaugi manual |

### Procfile (la root repo)

```
web: cd devlife && uvicorn server:app --host 0.0.0.0 --port $PORT
```

**Important:** David trebuie sa seteze Root Directory = `devlife` in Railway dashboard dupa care Procfile-ul de mai sus devine:
```
web: uvicorn server:app --host 0.0.0.0 --port $PORT
```

### pasi deploy

1. `git push origin dev` (sau merge la main)
2. Railway detecteaza push-ul automat si rebuildeaza
3. verifica `/health` si `/ready` dupa deploy
4. daca `/ready` returneaza 503, verifica variabilele de environment

### demo offline (pentru prezentare fara internet)

adauga `DEMO_OFFLINE=true` in environment variables Railway. toate apelurile externe (WHOOP, Claude) sunt simulate.

## healthcheck

```bash
./scripts/healthcheck.sh https://<domeniu>.railway.app
```
