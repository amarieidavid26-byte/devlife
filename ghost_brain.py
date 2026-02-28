# ghost brain - decision engine
# takes the vision analysis and the biometric data
# then it decides if the ghost should speak, what should it say and how it should say it

import time
import anthropic

from config import VISION_MODEL, GHOST_MAX_TOKENS_DEFAULT
class GhostBrain:
    def __init__(self, api_key):
        self.client = anthropic.Anthropic(api_key = api_key)
        self.last_intervention_time = 0
        self.cooldown = 30
        self.context_history = []
        self.max_history = 20
        self.intervention_count = 0
        self.ignored_count = 0
        self.accepted_count = 0

    PROMPTS = {
        "DEEP_FOCUS": (
            "You are Ghost, a silent AI companion. The user is in deep focus. "
            "ONLY speak if there is a CRITICAL error. One short sentence max. "
            "No bullet points. No markdown. Plain text only."
        ),
        "STRESSED": (
            "You are Ghost, a warm AI companion. The user is stressed (low HRV). "
            "Be encouraging. 'You're on the right track.' 'Almost there.' "
            "If risky action detected, gently flag it. "
            "Max 2 sentences. No bullet points. No markdown. Plain text only."
        ),
        "FATIGUED": (
            "You are Ghost, a protective AI companion. The user is cognitively depleted. "
            "If they're doing something irreversible (git push --force, rm -rf, deploy), "
            "activate FATIGUE FIREWALL: short urgent warning with their biometric data. "
            "Example: 'FATIGUE FIREWALL — Recovery 30%, HRV 28ms. Don't push to production exhausted.' "
            "Max 1-2 sentences. No bullet points. No markdown. Plain text only."
        ),
        "RELAXED": (
            "You are Ghost, a curious AI companion. The user is in a great state. "
            "Be helpful and suggest approaches. Ask a thought-provoking question if relevant. "
            "Max 2-3 sentences. No bullet points. No markdown. Plain text only."
        ),
        "WIRED": (
            "You are Ghost, a direct AI companion. The user has high energy but is unfocused. "
            "Give quick, action-oriented responses. 'Fix line 5.' 'Ship it.' "
            "Max 1-2 sentences. No bullet points. No markdown. Plain text only."
        )
    }

    # here is the decision being made
    def should_intervene(self, vision_analysis, biometric_state, modifiers):
        now = time.time()
        time_since_last = now - self.last_intervention_time

        # Risky actions get priority but still respect a minimum 10s cooldown
        # to prevent spam when the same content is re-analyzed
        if vision_analysis.get("risky_action"):
            if time_since_last < 10:
                return False, "cooldown"
            if biometric_state == "FATIGUED":
                return True, "fatigue_firewall"
            if biometric_state == "STRESSED":
                return True, "stress_firewall"
            return True, "risky_action_detected"

        # Normal cooldown for non-risky interventions
        effective_cooldown = self.cooldown
        if self.ignored_count >= 3:
            effective_cooldown = 60
        elif self.accepted_count > self.ignored_count:
            effective_cooldown = 20

        if time_since_last < effective_cooldown:
            return False, "cooldown"

        estimated_stress = modifiers.get("estimated_stress", 0)

        # stress firewall
        # if high stress + mistakes + mistakes = critical intervention
        if vision_analysis.get("mistake_detected") and estimated_stress > 2.0:
            return True, "stress_firewall"

        if vision_analysis.get("mistake_detected") and biometric_state == "FATIGUED":
            return True, "fatigue_firewall"

        if vision_analysis.get("mistake_detected"):
            return True, "mistake_detected"

        stuck = vision_analysis.get("stuck_probability", 0)
        threshold = modifiers.get("intervention_threshold", 0.5)

        #if the user is stuck as fuck
        if stuck >= threshold:
            return True, "stuck_detected"

        # help opportunities
        if vision_analysis.get("help_opportunity") and biometric_state in ["RELAXED", "STRESSED"]:
            if stuck >= threshold * 0.7:
                return True, "help_opportunity"

        # never interrupt deep focus or you will ruin the user's LIFE
        if biometric_state == "DEEP_FOCUS":
            return False, "protecting_flow"

        return False, "no_intervention_needed"

    def generate_response(self, vision_analysis, biometric_state, modifiers):
        # what ghost should yap about, adapting it to the user's state
        recent_context = ""
        if self.context_history:
            summaries = [h.get("context_summary", "") for h in self.context_history[-5:]]
            recent_context = "Recent activity:" + "→".join(summaries)

        # look up the system prompt for this bio state
        system = self.PROMPTS.get(biometric_state, self.PROMPTS["RELAXED"])

        # build the user message as a f string

        user_msg = f""" Screen analysis:
- App: {vision_analysis.get('app', 'unknown')}
- Actiity: {vision_analysis.get('activity', 'unknown')}
- Stuck probability: {vision_analysis.get('stuck_probability', 0)}
- Stuck reason: {vision_analysis.get('stuck_reason', 'none')}
- Mistake detected: {vision_analysis.get('mistake_detected', False)}
- Mistake: {vision_analysis.get('mistake_description', 'none')}
- Help opportunity: {vision_analysis.get('help_opportunity', 'none')}
- Risky action: {vision_analysis.get('risky_action', False)}
- Risky description: {vision_analysis.get('risky_description', 'none')}

{recent_context}

Biometric state: {biometric_state}
Estimated stress level: {modifiers.get('estimated_stress', 0):.1f}/3.0
HRV baseline: {modifiers.get('hrv_baseline', 50):.0f}ms

Generate a Ghost intervention. Be concise. Match the personality for {biometric_state} state."""

        try:
            response = self.client.messages.create(
                model = VISION_MODEL,
                max_tokens = modifiers.get("max_tokens", GHOST_MAX_TOKENS_DEFAULT),
                system = system,
                messages = [{"role": "user", "content": user_msg}]
            )

            return response.content[0].text
        except Exception as e:
            print (f"[ghost_brain] Claude API error: {e}")
            return None

    def process(self, vision_analysis, biometric_state, modifiers):
        self.context_history.append(vision_analysis)
        if len(self.context_history) > self.max_history:
            self.context_history.pop(0)

        should_speak, reason = self.should_intervene(vision_analysis, biometric_state, modifiers)
        if not should_speak:
            return None
        ghost_message = self.generate_response(vision_analysis, biometric_state, modifiers)
        if ghost_message is None:
            intervention = vision_analysis.get("suggested_intervention")
            if intervention:
                ghost_message = intervention.get("message", "...")
            else:
                return None

        self.last_intervention_time = time.time()
        self.intervention_count += 1

        priority = "medium"
        if reason == "stress_firewall":
            priority = "critical"
        elif reason == "fatigue_firewall":
            priority = "critical"
        elif reason == "mistake_detected":
            priority = "high"
        elif reason == "help_opportunity":
            priority = "low"

        #pick appropiate buttons for the UI
        buttons = ["Thanks", "Not Now"]
        if vision_analysis.get("suggested_intervention", {}).get("code_suggestion"):
            buttons = ["Apply Fix", "Show More", "Not Now"]
        if reason == "fatigue_firewall" or reason == "stress_firewall":
            buttons = ["Save Draft", "Do It Anyway", "Remind Later"]

        intervention = {
            "type": "intervention",
            "message": ghost_message,
            "priority": priority,
            "reason": reason,
            "state": biometric_state,
            "buttons": buttons,
            "context": vision_analysis.get("context_summary", ""),
            "code_suggestion": vision_analysis.get("suggested_intervention", {}).get("code_suggestion"),
            "timestamp": time.time()
        }

        if reason == "risky_action_detected":
            intervention["priority"] = "critical"
            intervention["buttons"] = ["Cancel", "Do It Anyway", "Save Draft"]
            intervention["risky"] = True

        return intervention

    # user feedback trackinggg
    def user_feedback(self, action):
        # track user's response to a intervention made by ghost

        if action in ["Thanks", "Apply Fix", "Save Draft", "Show More"]:
            self.accepted_count += 1
            self.ignored_count = max(0, self.ignored_count -1)
        elif action in ["Not Now", "Do It Anyway"]:
            self.ignored_count += 1
