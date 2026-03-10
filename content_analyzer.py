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

# Deterministic risky command patterns for the Fatigue Firewall
# These trigger IMMEDIATELY without waiting for Claude's analysis
RISKY_COMMAND_PATTERNS = [
    (r'rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*-rf\s+)', 'Destructive file deletion (rm -rf)'),
    (r'git\s+push\s+.*--force', 'Force push — can overwrite remote history'),
    (r'git\s+push\s+-f\b', 'Force push — can overwrite remote history'),
    (r'DROP\s+(TABLE|DATABASE|INDEX)', 'Database destructive command'),
    (r'chmod\s+777\b', 'Overly permissive file permissions'),
    (r'sudo\s+rm\b', 'Elevated destructive command'),
    (r'git\s+reset\s+--hard', 'Hard reset — discards all uncommitted changes'),
    (r'DELETE\s+FROM\s+\w+', 'Database row deletion'),
    (r':\(\)\{\s*:\|:&\s*\};:', 'Fork bomb — crashes the system'),
    (r'mkfs\b', 'Disk format command'),
    (r'kubectl\s+delete', 'Kubernetes resource deletion'),
    (r'docker\s+rm\s+-f', 'Force remove running container'),
    (r'npm\s+publish\b', 'Publishing package to npm registry'),
    (r'\benv\b', 'Environment variable dump — may expose secrets'),
]

class ContentAnalyzer:
    APP_PROMPTS = {
        "code": """You are Ghost, an AI assistant analyzing code in real-time. Analyze this
code and respond ONLY with a JSON object:
{
    "app": "code_editor",
    "language": "detected language",
    "activity": "what the user is doing (writing, debugging, refactoring, etc)",
    "stuck_probability": 0.0 to 1.0,
    "stuck_reason": "why the user might be stuck or null",
    "mistake_detected": true/false,
    "mistake_description": "describe the bug or error or null",
    "help_opportunity": "how Ghost could help or null",
    "risky_action": false,
    "risky_description": null,
    "suggested_intervention": {
        "type": "fix | suggestion | warning | encouragement",
        "message": "concise Ghost message (2-3 sentences max)",
        "priority": "low | medium | high",
        "code_suggestion": "corrected code snippet or null"
    },
    "context_summary": "one-line summary of coding session"
}

Signs of bugs and mistakes:
- TypeError risks (calling methods on None, wrong argument types)
- Undefined or uninitialized variables
- Off-by-one errors in loops or array indexing
- Missing null/None checks before accessing attributes
- Infinite loops or missing break conditions
- Missing imports or undefined functions
- Logic errors (wrong operator, inverted condition)
- Resource leaks (unclosed files, connections)

Signs of being stuck:
- Same code unchanged for multiple checks
- Repeated undo/redo patterns
- Adding and deleting the same lines""",

        "terminal": """You are Ghost, an AI assistant monitoring a terminal session.
Analyze this terminal output and respond with ONLY a JSON object:
{
    "app": "terminal",
    "activity": "what the user is doing (installing, building, debugging, deploying, etc)",
    "stuck_probability": 0.0 to 1.0,
    "stuck_reason": "why they might be stuck or null",
    "mistake_detected": true/false,
    "mistake_description": "describe the error or null",
    "help_opportunity": "what Ghost could help with or null",
    "risky_action": true/false,
    "risky_description": "what the risky action is or null",
    "suggested_intervention": {
        "type": "fix | suggestion | warning | encouragement",
        "message": "concise Ghost message (2-3 sentences max)",
        "priority": "low | medium | high | critical",
        "code_suggestion": "correct command or null"
    },
    "context_summary": "one-line summary of terminal session"
}

Signs of being stuck in terminal:
- Same command failing multiple times
- Repeated errors with slight variations
- Rapid command history cycling (up-arrow spam)

Signs of risky terminal actions:
- rm -rf with broad paths (especially / or ~)
- sudo operations on production servers
- git push --force to main/master
- DROP TABLE or database destructive commands
- chmod 777 on sensitive directories""",

        "browser": """You are Ghost analyzing browser content. Respond with JSON:
{"app":"browser","activity":"string","stuck_probability":0.0-1.0,"stuck_reason":"string|null","mistake_detected":false,"mistake_description":null,"help_opportunity":"string|null","risky_action":false,"risky_description":null,"suggested_intervention":{"type":"suggestion|encouragement","message":"2-3 sentences","priority":"low|medium","code_suggestion":null},"context_summary":"one-line summary"}""",

        "notes": """You are Ghost analyzing notes/planning content. Respond with JSON:
{"app":"notes","activity":"string","stuck_probability":0.0-1.0,"stuck_reason":"string|null","mistake_detected":false,"mistake_description":null,"help_opportunity":"string|null","risky_action":false,"risky_description":null,"suggested_intervention":{"type":"suggestion|encouragement","message":"2-3 sentences","priority":"low|medium","code_suggestion":null},"context_summary":"one-line summary"}""",

        "chat": """You are Ghost analyzing a chat conversation. Respond with JSON:
{"app":"chat","activity":"string","stuck_probability":0.0-1.0,"stuck_reason":"string|null","mistake_detected":false,"mistake_description":"string|null","help_opportunity":"string|null","risky_action":false,"risky_description":null,"suggested_intervention":{"type":"suggestion|warning|encouragement","message":"2-3 sentences","priority":"low|medium|high","code_suggestion":null},"context_summary":"one-line summary"}"""
    }

    def __init__(self, api_key):
        self.client = Anthropic(api_key = api_key)
        self.last_analysis = None
        self.last_analysis_time = 0
        self.content_history = {}

    def detect_risky_commands(self, content):
        """Deterministic pattern matching for dangerous terminal commands.
        Returns (is_risky, description) — runs INSTANTLY, no API call needed."""
        for pattern, description in RISKY_COMMAND_PATTERNS:
            if re.search(pattern, content, re.IGNORECASE | re.MULTILINE):
                return True, description
        return False, None

    def analyze(self, app_type, content, extra_context = "", **kwargs):
        # analyze content from an ingame app
        # unlike vision analyzer, which takes ss this takes raw text content which is 10x cheaper

        # CUT 1: Risky command detection BEFORE Claude API call — instant response
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
                print(f"[content_analyzer] INSTANT risky detection: {risky_desc}")
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
            print(f"[content_analyzer] Analysis failed: {e}")
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
