# DevLife frontend

The game half of DevLife: a 2.5D isometric room drawn entirely in code with PixiJS (no sprite sheets), where a ghost companion reads your live biometrics and reacts while you code. Its personality follows your cognitive state: DEEP_FOCUS, STRESSED, FATIGUED, RELAXED or WIRED.

## quick start

Backend and frontend live in the same repo; the backend is the repo root. Easiest path, from the root:

```bash
./scripts/setup.sh    # once: venv + python deps + npm install + pyodide
./scripts/dev.sh      # backend on http://localhost:8000 + this frontend
```

Frontend only:

```bash
npm install
npm run dev
# http://localhost:5173, also bound on http://127.0.0.1:5173
# (Spotify rejects `localhost` redirect URIs, so both origins are served)
```

The game talks to the backend at `ws://localhost:8000/ws`.

### no backend? still fine

When the WebSocket is down, the frontend switches to a client-side mock biometric generator. States 1-5, the HUD, the ghost and the ECG all keep working; only the ghost's AI replies need the backend.

## dashboard (judges / projector)

Press Tab in game for the biometric dashboard overlay: live ECG, sparklines, session replay. A standalone page also exists at `http://localhost:5173/dashboard.html` and connects to the same WebSocket.

## controls

| Key | Action |
|-----|--------|
| WASD | move |
| E | interact with nearby furniture (this is how apps open) |
| T | switch between room and town |
| Tab | dashboard overlay |
| O | settings (API keys, language, personality, audio) |
| ? | shortcuts overlay |
| ESC | close current app or speech bubble |
| Shift+ESC | close every open app |
| 1-5 | force a mock cognitive state |

## who wrote what

**David Amariei**: the PixiJS world (isometric camera, room, Player, Ghost, town scenes), WHOOP BLE pairing, the dashboard overlay with live ECG, DemoMode, the sound system.

**Matei Vultur**: the FastAPI backend in the repo root, plus security, persistence, the test suite, the offline fallback and RO/EN i18n.

Full breakdown in `docs/authorship.md`.

## architecture

```
Browser (game)       <->  ws://localhost:8000/ws  <->  FastAPI backend (repo root)
Browser (dashboard)  <->  same WebSocket          <->  same backend
```

Frontend sends: content_update, app_focus, keystrokes, heart_rate, run_error, feedback, firewall_block, mock_state, set_lang, set_personality, resume_live, wake

Backend sends: biometric_update, state_change, intervention, sleep_mode, plant_update, app_focus_change, whoop_connected, whoop_disconnected, degraded_mode

## the 5 cognitive states

| # | State | Color | Ghost personality |
|---|-------|-------|-------------------|
| 1 | DEEP_FOCUS | #9B6AFF | silent, minimal |
| 2 | STRESSED | #FF7A6A | warm, supportive |
| 3 | FATIGUED | #FFB84A | protective, blocks risky actions |
| 4 | RELAXED | #6AD89A | curious, exploratory |
| 5 | WIRED | #6AB8FF | direct, action-oriented |

Colors live in `src/theme.js`, the single source for the per-state palette.

## repo

`github.com/amarieidavid26-byte/devlife` is a monorepo. This folder is `frontend/`; the backend sits in the repo root.
