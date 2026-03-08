# all configs here, API keys are loaded from .env, never commit them to git so you dont get yo shit leaked 
import os 
from dotenv import load_dotenv

# load variables from env 
load_dotenv()

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
PORT = int(os.environ.get("PORT", 8000))

# mode settings 
USE_MOCK_BIOMETRICS = True       # false when we are using real WHOOP metrics not this BS

# game mode settings 
GAME_MODE = True
GAME_APPS = ["code", "terminal", "browser", "notes", "chat"]
CONTENT_REANALYZE_INTERVAL = 15
CONTENT_MIN_LENGTH = 10


