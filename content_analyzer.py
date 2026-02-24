# multi app content analyzer for game mode
# replaces vision_analyzer file when game mode is true. instead of ss to claude vision this
# reads text context
# the game has 5 interactive objects in the room
# returns the same analysis dict format as vision_analyzer file so ghost brain can consume either one without changes

import json
import time
from anthropic import Anthropic
from config import CLAUDE_API_KEY, VISION_MODEL, VISION_MAX_TOKENS

class ContentAnalyzer:
    APP_PROMPTS = {
        "code": """ You are Ghost, an AI assistant analyzing code in real-time. analyze this
code and respond ONLY with a JSON onject:
{
        "app": "code_editor",
        "language": "detected language",
        "activity": "what the user is doing (writing, debugging, refactoring, etc)",
        "stuck_probability": "0.0 to 1.0",
        "stuck_reason": "why the conversation might be going badly or null"
        "mistake_detected": true/false,
        "mistake_description": "describe the communication issue or null",
        "help_opportunity": "how Ghost could help or null",
        "risky_action": false,
        "risky_description": null,
        "suggested_intervention": {
            "type": "suggestion | warning | encouragement",
            "message": "concise Ghost message(2-3 sentences max)",
            "priority": "low | medium | high",
            "code_suggestion": null
        },
        "context_summary": "one-line summary of conversation"
}
Signs of communication issues:
- escalating tone (ALL CAPS, exclamation marks, sarcasm)
- defensive or aggresive phrasing
- circular arguments (same point repeated)
- passive-aggeresive messages
- responding while clearly frustrated """,

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

        "browser": """You are Ghost, an AI assistant observing web browsing.
Analyze this browser content and respond with ONLY a JSON object:
{
    "app": "browser",
    "activity": "what the user is researching/reading",
    "stuck_probability": 0.0 to 1.0,
    "stuck_reason": "why they might be stuck or null",
    "mistake_detected": false,
    "mistake_description": null,
    "help_opportunity": "what Ghost could help with or null",
    "risky_action": false,
    "risky_description": null,
    "suggested_intervention": {
        "type": "suggestion | encouragement",
        "message": "concise Ghost message (2-3 sentences max)",
        "priority": "low | medium",
        "code_suggestion": null
    },
    "context_summary": "one-line summary of what user is researching"
}

Signs of being stuck while browsing:
- Searching the same error message repeatedly with different phrasing
- Opening many Stack Overflow pages on the same topic
- Bouncing between docs pages without settling""",

        "notes": """You are Ghost, an AI assistant helping with planning and organization.
Analyze these notes and respond with ONLY a JSON object:
{
    "app": "notes",
    "activity": "what the user is planning/organizing",
    "stuck_probability": 0.0 to 1.0,
    "stuck_reason": "why they might be stuck or null",
    "mistake_detected": false,
    "mistake_description": null,
    "help_opportunity": "how Ghost could help organize/prioritize or null",
    "risky_action": false,
    "risky_description": null,
    "suggested_intervention": {
        "type": "suggestion | encouragement",
        "message": "concise Ghost message (2-3 sentences max)",
        "priority": "low | medium",
        "code_suggestion": null
    },
    "context_summary": "one-line summary of planning session"
}

Signs of being stuck while planning:
- Notes are scattered with no clear structure
- Many items marked with '?' or 'idk' or 'maybe'
- Contradictory TODOs or circular reasoning
- Empty sections that should have content""",

        "chat": """You are Ghost, an AI assistant monitoring a chat conversation.
Analyze this conversation and respond with ONLY a JSON object:
{
    "app": "chat",
    "activity": "what the conversation is about",
    "stuck_probability": 0.0 to 1.0,
    "stuck_reason": "why the conversation might be going badly or null",
    "mistake_detected": true/false,
    "mistake_description": "describe the communication issue or null",
    "help_opportunity": "how Ghost could help or null",
    "risky_action": false,
    "risky_description": null,
    "suggested_intervention": {
        "type": "suggestion | warning | encouragement",
        "message": "concise Ghost message (2-3 sentences max)",
        "priority": "low | medium | high",
        "code_suggestion": null
    },
    "context_summary": "one-line summary of conversation"
}

Signs of communication issues:
- Escalating tone (ALL CAPS, exclamation marks, sarcasm)
- Defensive or aggressive phrasing
- Circular arguments (same point repeated)
- Passive-aggressive messages
- Responding while clearly frustrated"""
    }

    def __init__(self, api_key):
        self.client = Anthropic(api_key = api_key)
        self.last_analysis = None
        self.last_analysis_time = 0
        self.content_history = {}

    def analyze(self, app_type, content, extra_context = "", **kwargs):
        # analyze content from an ingame app
        # unlike vision analyzer, which takes ss this takes raw text content which is 10x cheaper

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
