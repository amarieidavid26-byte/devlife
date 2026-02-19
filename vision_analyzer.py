"""
claude vision API integration
sends screenshots to vision and gets back a structured JSON
analysis of what the user is doing and how should Ghost intervene

sends up to 2 screenshots (previous and current) for temporal context
so claude can detect things that are similar
 - similar errors in code for example
 
 """


import anthropic 
import json 

VISION_SYSTEM_PROMPT = """ You are Ghost, an AI desktop analyst. You receive 
screenshots of a user's computer screen. 
Analyze and respond with ONLY a JSON object (no markdown, no explanation):
{
    "app": "string - what application is open (vscode, email, slack, cursor
        figma, browser, terminal, google docs)",
    "activity": "string - what the user is doing - coding, debugging, writing_email, designing
        browsing_docs, writing_message, analyzing_data",
    "stuck_probability": 0.0 to 1.0, 
    "stuck_reason": "string or null - why you think they are stuck",
    "mistake_detected": true/false, 
    "mistake_description": "string or null - what the mistake is",
    "help_opportunity": "string or null - how Ghost could help right now",
    "sugegsted_intervention": {
        "type": "proactive_fix | warning | suggestion | learning | fatigue_check",
        "message": "string - what Ghost should say to the user"
        "priority": "low | medium | high | critical"
        "code_suggestion": "string or null - code fix if applicable"
    }, 
    "context_summary": "string - 1 sentence summary of what user is doing"
}

Signs of being stuck: 
- same error visible across multiple screenshots 
- cursor hasn't moved between captures
- googling the same thing repeatedly
- rapid tab switching (confusion)
- repeated failed terminal commands

Signs of mistakes: 
- obvious code syntax errors
- email/message with aggresive tone 
- dangerous terminal commands (rm -rf, DROP TABLE, git push --force)
- design misalignment issues

Help opportunities
- reading docs = could summarize 
- writing boilerplate = could generate
- debugging = could spot the fix """

class VisionAnalyzer:
    def __init__(self, api_key):
        self.client = anthropic.Anthropic(api_key = api_key)
        self.last_analysis = None
    
    def analyze(self, screenshots_b64, context_history = None)
    """
    Send screenshots to claude code vision for analysis. 
    Args: 
        screenshots_b64: list of base 64 JPEG strings (most recent last)
        context_history: optional string summary of recent activity 
    
    Returns: 
        dict with analysis results (app, activity, stuck probability, etc)
    """
    content = []
    if context_history: 
        content.append({
            "type": "text", 
            "text": f"Recent activity context: {context_history}" 
        })
    # send the last 2 ss 
    # previous and current lets claude detect same erorr or no movement problems
    for i, b64 in enumerate (screenshots_b64[-2:]):
        if i == 0  and len(screenshots_b64) > 1:
            label = "Previous screenshot"
        else: 
            label = "Current screenshot"
        content.append({
            "type": "text",
            "text": f"[{label}]"
        })
        content.append({
            "type": "image", 
            "source": {
                "type": "base64", 
                "media_type": "image/jpeg",
                "data": b64
            }
        })
    content.append({
        "type": "text",
        "text": "analyze what the user is doing. respond with only a JSON object, no markdown"

    })

    # claude vision api call 
    response = self.client.messages.create(
        model = "claude-sonnet-4-20250514", 
        max_tokens = 500,
        system = VISION_SYSTEM_PROMPT, 
        messages =  [{"role": "user", "content": content}]
    )

    try: 
        text = response.content[0].text.strip()

         if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]

        analysis = json.loads(text)
    except (json.JSONDecodeError, IndexError): 
        analysis = {
            "app": "unknown",
                "activity": "unknown",
                "stuck_probability": 0,
                "stuck_reason": None,
                "mistake_detected": False,
                "mistake_description": None,
                "help_opportunity": None,
                "suggested_intervention": None,
                "context_summary": "Could not analyze screenshot"
        }
    self.last_analysis = analysis
    return analysis