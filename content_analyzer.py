import logging
# multi app content analyzer for game mode
# replaces vision_analyzer file when game mode is true. instead of ss to claude vision this
# reads text context
# the game has 5 interactive objects in the room
# returns the same analysis dict format as vision_analyzer file so ghost brain can consume either one without changes

import json
import re
import time
from anthropic import Anthropic
from config import CLAUDE_API_KEY, VISION_MODEL, VISION_MAX_TOKENS

logger = logging.getLogger(__name__)

# patterns that trigger the fatigue firewall instantly (no api call)
# mostly stuff that can nuke your repo or server if you run it while tired
RISKY_COMMAND_PATTERNS = [
    (r'rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*-rf\s+)', 'rm -rf, deletes stuff permanently'),
    (r'git\s+push\s+.*--force', 'force push -- can overwrite remote'),
    (r'git\s+push\s+-f\b', 'force push -- can overwrite remote'),
    (r'DROP\s+(TABLE|DATABASE|INDEX)', 'DROP command, destroys db stuff'),
    (r'chmod\s+777\b', 'chmod 777, way too permissive'),
    (r'sudo\s+rm\b', 'sudo rm, elevated delete'),
    (r'git\s+reset\s+--hard', 'hard reset, kills uncommitted changes'),
    (r'DELETE\s+FROM\s+\w+', 'DELETE FROM, removes db rows'),
    (r'docker\s+rm\s+-f', 'force removing a running container'),
    (r'npm\s+publish\b', 'publishing to npm'),
    (r'\benv\b', 'env dump, might leak secrets'),
    # might need more patterns later
]

class ContentAnalyzer:
    # prompts for each app type, tells claude what to look for
    # code and terminal are the most important ones so they get more detail
    APP_PROMPTS = {
        "code": """You are Ghost analyzing code. Respond ONLY with JSON:
{
    "app": "code_editor",
    "language": "detected language",
    "activity": "what the user is doing",
    "stuck_probability": 0.0 to 1.0,
    "stuck_reason": "why stuck or null",
    "mistake_detected": true/false,
    "mistake_description": "bug description or null",
    "help_opportunity": "how to help or null",
    "risky_action": false,
    "risky_description": null,
    "suggested_intervention": {
        "type": "fix | suggestion | warning | encouragement",
        "message": "short Ghost message, 2-3 sentences",
        "priority": "low | medium | high",
        "code_suggestion": "corrected code or null"
    },
    "context_summary": "one line summary"
}

Look for bugs like:
- TypeError (calling methods on None, wrong types)
- undefined variables, missing imports
- off by one errors, infinite loops
- missing null checks, logic errors
- unclosed files/connections

Stuck signals:
- same code unchanged for a while
- undo/redo spam
- adding and deleting the same lines""",

        "terminal": """Ghost watching terminal. JSON only:
{"app":"terminal","activity":"what theyre doing","stuck_probability":0.0-1.0,"stuck_reason":"string|null","mistake_detected":false,"mistake_description":"string|null","help_opportunity":"string|null","risky_action":false,"risky_description":"string|null","suggested_intervention":{"type":"fix|suggestion|warning|encouragement","message":"2-3 sentences","priority":"low|medium|high|critical","code_suggestion":"correct cmd or null"},"context_summary":"one line"}

Stuck = same command failing, up-arrow spam
Risky = rm -rf, sudo rm, force push, DROP TABLE, chmod 777""",

        "browser": """You are Ghost looking at browser content. Respond with JSON only:
{"app":"browser","activity":"string","stuck_probability":0.0-1.0,"stuck_reason":"string|null","mistake_detected":false,"mistake_description":null,"help_opportunity":"string|null","risky_action":false,"risky_description":null,"suggested_intervention":{"type":"suggestion|encouragement","message":"2-3 sentences","priority":"low|medium","code_suggestion":null},"context_summary":"one-line summary"}""",

        "notes": """Ghost analyzing notes. JSON only:
{"app":"notes","activity":"string","stuck_probability":0.0-1.0,"stuck_reason":"string|null","mistake_detected":false,"mistake_description":null,"help_opportunity":"string|null","risky_action":false,"risky_description":null,"suggested_intervention":{"type":"suggestion|encouragement","message":"2-3 sentences","priority":"low|medium","code_suggestion":null},"context_summary":"one-line summary"}""",

        "chat": """Ghost analyzing chat. JSON only:
{"app":"chat","activity":"string","stuck_probability":0.0-1.0,"stuck_reason":"string|null","mistake_detected":false,"mistake_description":"string|null","help_opportunity":"string|null","risky_action":false,"risky_description":null,"suggested_intervention":{"type":"suggestion|warning|encouragement","message":"2-3 sentences","priority":"low|medium|high","code_suggestion":null},"context_summary":"one-line summary"}"""
    }

    def __init__(self, api_key):
        self.client = Anthropic(api_key = api_key)
        self.last_analysis = None
        self.last_analysis_time = 0
        self.content_history = {}

    def detect_risky_commands(self, content):
        # check if content has any dangerous commands, returns before hitting the api
        for pattern, description in RISKY_COMMAND_PATTERNS:
            if re.search(pattern, content, re.IGNORECASE | re.MULTILINE):
                return True, description
        return False, None

    def analyze(self, app_type, content, extra_context = "", **kwargs):
        # analyze content from an ingame app
        # unlike vision analyzer, which takes ss this takes raw text content which is 10x cheaper

        # CUT 1: check for risky commands before wasting an api call
        if app_type == "terminal":
            is_risky, risky_desc = self.detect_risky_commands(content)
            if is_risky:
                analysis = {
                    "app": "terminal",
                    "activity": "risky command detected",
                    "stuck_probability": 0.0,
                    "stuck_reason": None,
                    "mistake_detected": False,
                    "mistake_description": None,
                    "help_opportunity": None,
                    "risky_action": True,
                    "risky_description": risky_desc,
                    "suggested_intervention": {
                        "type": "warning",
                        "message": f"Risky command detected: {risky_desc}",
                        "priority": "critical",
                        "code_suggestion": None
                    },
                    "context_summary": f"User ran risky command: {risky_desc}"
                }
                self.last_analysis = analysis
                self.last_analysis_time = time.time()
                logger.info("instant risky detection: %s", risky_desc)
                return analysis

        system_prompt = self.APP_PROMPTS.get(app_type, self.APP_PROMPTS["code"])
        user_msg = f"App type: {app_type}\n"
        user_msg += f"Content:\n{content}\n"

        # append optional metadata fields from **kwargs
        if kwargs.get("language"):
            user_msg += f"\nLanguage: {kwargs['language']}"
        if kwargs.get("cursor_line"):
            user_msg += f"\nCursor at line: {kwargs['cursor_line']}"
        # url is the current URL from the browser app
        if kwargs.get("url"):
            user_msg += f"\nURL: {kwargs['url']}"
        # shell is the shell type from the terminal
        if kwargs.get("shell"):
            user_msg += f"\nShell: {kwargs['shell']}"
        # platform is the chat platform like slack discord whatsapp and all that
        if kwargs.get("platform"):
            user_msg += f"\nPlatform: {kwargs['platform']}"
        # add context from tracker if that shit is available
        if extra_context:
            user_msg += f"\n\nRecent context: {extra_context}"

        # detection if the user is stuck, tracks content hashes overtime
        content_hash = hash(content[:500])
        now = time.time()

        if app_type not in self.content_history:
            self.content_history[app_type] = []

        history = self.content_history[app_type]
        history.append((now, content_hash))
        if len(history) > 20:
            history.pop(0)

        # count how many recent entries have the same hash
        recent_same = sum(1 for t, h in history if h == content_hash and now - t < 60)
        if recent_same >= 3:
            user_msg += f"\n\nNOTE: The content has not changed for {recent_same} consecutive checks (~{recent_same * 5}+ seconds). The user may be stuck."

        try:
            response = self.client.messages.create(
                model = VISION_MODEL,
                max_tokens = VISION_MAX_TOKENS,
                system = system_prompt,
                messages = [{"role": "user", "content": user_msg}]
            )

            text = response.content[0].text
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3]

            analysis = json.loads(text)

            self.last_analysis = analysis
            self.last_analysis_time = now
            return analysis
        except json.JSONDecodeError:
            self.last_analysis = {
                "app": app_type,
                "activity": "unknown",
                "stuck_probability": 0.0,
                "stuck_reason": None,
                "mistake_detected": False,
                "mistake_description": None,
                "help_opportunity": None,
                "risky_action": False,
                "risky_description": None,
                "suggested_intervention": None,
                "context_summary": f"User is using {app_type}"
            }
            return self.last_analysis
        except Exception as e:
            logger.warning("analysis failed: %s", e)
            return self.last_analysis or {
                "app": app_type,
                "activity": "unknown",
                "stuck_probability": 0.0,
                "stuck_reason": None,
                "mistake_detected": False,
                "mistake_description": None,
                "help_opportunity": None,
                "risky_action": False,
                "risky_description": None,
                "suggested_intervention": None,
                "context_summary": f"User is using {app_type}"
            }
