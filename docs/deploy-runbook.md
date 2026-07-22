# deploy: DevLife

> **Stare curenta:** gazda publica (`devlife-rog-production.up.railway.app`) e momentan oprita, `/health` intoarce 404 "Application not found". Modul sustinut e cel local, prin `./scripts/dev.sh`.
> Pasii de mai jos raman valabili pentru un re-deploy.

## local

```bash
./scripts/setup.sh   # prima oara
./scripts/dev.sh     # porneste backend + frontend
```

verifica: `curl http://localhost:8000/health` si `curl http://localhost:8000/ready`

## Railway

### ce se deployeaza unde

Pe Railway merge doar backend-ul FastAPI: `Procfile`-ul din root porneste `uvicorn server:app`, iar `runtime.txt` fixeaza Python 3.11.9. Frontend-ul e un build static Vite (`cd frontend && npm run build` produce `frontend/dist`) si se serveste separat, de pe orice hosting static. Build-ul de productie foloseste URL-ul backend-ului fixat in `frontend/src/config.js`, deci daca domeniul Railway se schimba, actualizezi si acolo.

### variabile de environment (Railway dashboard → Variables)

| variabila | valoare |
|-----------|---------|
| `CLAUDE_API_KEY` | cheia API Anthropic |
| `WHOOP_CLIENT_ID` | id aplicatie WHOOP dev |
| `WHOOP_CLIENT_SECRET` | secret aplicatie WHOOP dev |
| `WHOOP_REDIRECT_URI` | `https://<domeniu>.railway.app/api/whoop/callback` |
| `GAME_MODE` | `True` |
| `ALLOWED_ORIGINS` | originea publica de pe care e servit frontend-ul, ex. `https://<domeniu-frontend>` |
| `DB_PATH` | `/data/devlife.db` (pe un Railway volume) |
| `PORT` | setat automat de Railway, nu il adaugi manual |

### Procfile (la root repo)

```
web: uvicorn server:app --host 0.0.0.0 --port $PORT
```

repo-ul are app-ul la root, deci nu setezi Root Directory in Railway dashboard.

### pasi deploy

1. `git push origin main`
2. Railway detecteaza push-ul automat si rebuildeaza
3. verifica `/health` si `/ready` dupa deploy
4. daca `/ready` returneaza 503, verifica variabilele de environment

### demo offline (pentru prezentare fara internet)

adauga `DEMO_OFFLINE=true` in environment variables Railway. toate apelurile externe (WHOOP, Claude) sunt simulate.

## healthcheck

```bash
./scripts/healthcheck.sh https://<domeniu>.railway.app
```
