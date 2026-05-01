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

# screenshot settings
CAPTURE_INTERVAL_DEFAULT = 3 
CAPTURE_WIDTH = 1280             # save api tokens cause we still broke
JPEG_QUALITY = 60                # national geographic quality
HASH_THRESHOLD = 5

# ghost iq 
INTERVENTION_COOLDOWN = 30
VISION_MODEL = "claude-sonnet-4-20250514"
VISION_MAX_TOKENS = 500          # same reason as line 15 
GHOST_MAX_TOKENS_DEFAULT = 100

# stress detection settings 
HRV_BASELINE_WINDOW = 14
STRESS_HIGH_THRESHOLD = 2.0
STRESS_MEDIUM_THRESHOLD = 1.0
STRESS_FIREWALL_THRESHOLD = 2.0

# server settings
HOST = "0.0.0.0"
PORT = 8000
WHOOP_REDIRECT_URI = os.getenv("WHOOP_REDIRECT_URI", "http://localhost:8000/api/whoop/callback")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174").split(",")
DB_PATH = os.getenv("DB_PATH", "./devlife.db")

# mode settings 
USE_MOCK_BIOMETRICS = True       # false when we are using real WHOOP metrics not this BS

# game mode settings 
GAME_MODE = True
GAME_APPS = ["code", "terminal", "browser", "notes", "chat"]
CONTENT_REANALYZE_INTERVAL = 8
CONTENT_MIN_LENGTH = 10


