# DevLife — Ghost AI Companion

2.5D isometric game where an AI companion called Ghost reads your WHOOP biometric data and helps you code — adapting its personality based on whether you're focused, stressed, fatigued, relaxed, or wired.

Built for **Hack Club: The Game** hackathon (NYC, May 22-25, 2026).

## Quick Start

### Frontend (this repo)
```bash
npm install
npm run dev
# Opens at http://localhost:5173
```

### Backend (David's Python server)
```bash
cd ~/devlife
source venv/bin/activate
python3 server.py
# Runs on http://localhost:8000, WebSocket at ws://localhost:8000/ws
```

### Test without backend
```bash
node test-server.js
# Fake Ghost backend on ws://localhost:8000
# Sends biometric updates every 5s, interventions every 20s
# Then in another terminal: npm run dev
```

### Dashboard (for judges/projector)
Open `http://localhost:8000/public/dashboard.html` or open `public/dashboard.html` directly.

## Controls

| Key | Action |
|-----|--------|
| C | Open Code Editor |
| T | Open Terminal |
| B | Open Browser |
| N | Open Notes |
| H | Open Chat |
| ESC | Close current app |
| 1 | Mock: DEEP_FOCUS (purple) |
| 2 | Mock: STRESSED (red) |
| 3 | Mock: FATIGUED (orange) |
| 4 | Mock: RELAXED (green) |
| 5 | Mock: WIRED (blue) |

## File Ownership

**David (backend + frontend infrastructure):**
- `src/network/WebSocket.js` — all backend communication
- `src/apps/*` — 5 app overlay panels
- `src/utils/isometric.js` — coordinate math
- `public/dashboard.html` — judge projector view
- `test-server.js` — fake backend for testing

**Matei (PixiJS game world):**
- `src/room/*` — Room.js, Furniture.js, Atmosphere.js
- `src/character/*` — Player.js, Ghost.js
- `src/hud/HUD.js` — biometric HUD overlay
- `src/main.js` — game entry point (owns this file)

## Architecture

```
Browser (game)  <->  ws://localhost:8000/ws  <->  Python Backend (FastAPI)
Browser (dashboard)  <->  same WebSocket  <->  Same Backend
```

Frontend sends: content_update, feedback, mock_state, app_focus
Backend sends: intervention, biometric_update, state_change, connection_established

## The 5 Cognitive States

| # | State | Color | Ghost Personality |
|---|-------|-------|-------------------|
| 1 | DEEP_FOCUS | #8000FF | Silent, minimal |
| 2 | STRESSED | #FF5050 | Warm, supportive |
| 3 | FATIGUED | #FFA000 | Protective, blocks risky actions |
| 4 | RELAXED | #00C864 | Curious, exploratory |
| 5 | WIRED | #0096FF | Direct, action-oriented |

## Backend Repo
`github.com/amariedavid26-byte/devlife`
