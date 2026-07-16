import logging
import os
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)

# api keys 
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY", "")
WHOOP_CLIENT_ID = os.getenv("WHOOP_CLIENT_ID", "")
WHOOP_CLIENT_SECRET = os.getenv("WHOOP_CLIENT_SECRET", "")

# how long the live BLE pulse can be missing before we treat the WHOOP as taken off the
# wrist: the character falls asleep and the HUD shows "--" instead of presenting the
# WHOOP API resting HR as if it were a live heartbeat.
WHOOP_OFF_GRACE_SECONDS = int(os.getenv("WHOOP_OFF_GRACE_SECONDS", "15"))

# how long a manually-selected demo state (keyboard 1-5) is held before live WHOOP resumes.
# Long enough to span a presentation; "Back to live" clears it instantly.
DEMO_STATE_HOLD_SECONDS = int(os.getenv("DEMO_STATE_HOLD_SECONDS", "3600"))

# screenshot settings
CAPTURE_INTERVAL_DEFAULT = 3 
CAPTURE_WIDTH = 1280             # save api tokens cause we still broke
JPEG_QUALITY = 60                # national geographic quality
HASH_THRESHOLD = 5

# ghost iq
INTERVENTION_COOLDOWN = 30
VISION_MODEL = "claude-sonnet-5"
# Big enough that code_suggestion can carry the COMPLETE corrected file (Apply Fix replaces the
# whole file). At 500 the JSON truncated on full-file fixes -> parse failed -> no Apply Fix button.
VISION_MAX_TOKENS = 2048
GHOST_MAX_TOKENS_DEFAULT = 100

# inline code completions (Cursor-style ghost text) — fast model, short output
INLINE_MODEL = "claude-haiku-4-5"
INLINE_MAX_TOKENS = 128
INLINE_TIMEOUT = 8.0

# stress detection settings 
HRV_BASELINE_WINDOW = 14
STRESS_HIGH_THRESHOLD = 2.0
STRESS_MEDIUM_THRESHOLD = 1.0
STRESS_FIREWALL_THRESHOLD = 2.0

# server settings
# default to loopback so the privileged local endpoints (terminal/files/lsp) are not
# reachable from the LAN. The Procfile overrides with --host 0.0.0.0 for hosted deploys,
# where these endpoints MUST be feature-flagged off (see *_ENABLED below).
HOST = os.getenv("HOST", "127.0.0.1")
PORT = 8000
WHOOP_REDIRECT_URI = os.getenv("WHOOP_REDIRECT_URI", "http://localhost:8000/api/whoop/callback")
# Both localhost and the 127.0.0.1 loopback are allowed: Spotify's dev dashboard rejects
# `localhost` redirect URIs, so the game is presented on http://127.0.0.1:5173 — the WS origin
# check (security.check_origin) + CORS must accept that origin or biometrics/ghost/IDE all break.
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174",
).split(",")
DB_PATH = os.getenv("DB_PATH", "./devlife.db")
DEMO_OFFLINE = os.getenv("DEMO_OFFLINE", "false").lower() == "true"

# local IDE settings — workspace root bounds every file op, the terminal cwd, and the LSP root.
# Set WORKSPACE_ROOT to point the in-game IDE at a real project directory.
WORKSPACE_ROOT = os.path.abspath(os.getenv("WORKSPACE_ROOT", "./workspace"))
os.makedirs(WORKSPACE_ROOT, exist_ok=True)

# privileged-feature flags — they expose a real shell, real filesystem writes, and LSP
# subprocesses on the host, so they default to OFF (fail-safe). Enable them ONLY on a
# local machine via .env. A public deploy with no env override therefore stays safe.
TERMINAL_ENABLED = os.getenv("TERMINAL_ENABLED", "false").lower() == "true"
FILES_ENABLED = os.getenv("FILES_ENABLED", "false").lower() == "true"
LSP_ENABLED = os.getenv("LSP_ENABLED", "false").lower() == "true"
INLINE_AI_ENABLED = os.getenv("INLINE_AI_ENABLED", "false").lower() == "true"
# "Open in full VS Code" — launches code-server locally. Local-only; never on a public host.
CODE_SERVER_ENABLED = os.getenv("CODE_SERVER_ENABLED", "false").lower() == "true"
CODE_SERVER_PORT = int(os.getenv("CODE_SERVER_PORT", "8080"))

# mode settings 
USE_MOCK_BIOMETRICS = True       # false when we are using real WHOOP metrics not this BS

# game mode settings 
GAME_MODE = True
GAME_APPS = ["code", "terminal", "browser", "notes", "chat"]
CONTENT_REANALYZE_INTERVAL = 8
CONTENT_MIN_LENGTH = 10


