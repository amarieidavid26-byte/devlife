import os

# flag-gated routes are registered/checked at server import time, so the flags
# must be set before any test module imports server -- conftest loads first.
# setdefault: a real .env value (loaded later with override=False) does not win over these
os.environ.setdefault("TERMINAL_ENABLED", "true")
os.environ.setdefault("FILES_ENABLED", "true")
