# pre cached ghost voice lines 
# using these when claude api is too slow (more than 3 seconds)

import random  

FALLBACKS = {
    "DEEP_FOCUS": [
        "...",
        "Solid.",
        "Flow state. Keep going.",
        "...",
        "Nice.",
        "Clean code.",
        "...",
        "You're locked in",
        "..."
    ],
    "STRESSED": [
        "One step at a time. What's the smallest thing you can't fix?",
        "HRV is dropping. Maybe take a short walk?",
        "This is a tough one, but you will conquer",
        "Remember that every expert or legend was once stuck here too",
        "Try rubber ducking it. Explain the problem out loud"
    ],
    "FATIGUED": [
        "Decision quality drops when you are this tired",
        "Consider picking this up tomorrow with fresh eyes.",
        "Maybe grab some water? Small break, big difference.",
        "Save your work. Just in case.",
        "Your future self will thank you for resting now."
    ],
    "RELAXED": [
        "You're in a great headspace. Good time to tackle something creative.",
        "Nice flow. Want to brainstorm some edge cases?",
        "You seem sharp right now. Good time for complex problems.",
        "What would this look like with half the code?",
        "Your recovery looks great. Make the most of it."
    ],
    "WIRED": [
       "Focus. One thing at a time.",
        "Ship it. Move on.",
        "Don't overthink it. The first solution usually works.",
        "Too many tabs open. Pick one thing.",
        "That's done. Next."
    ],
    
}

def get_fallback(state):
    responses = FALLBACKS.get(state, FALLBACKS["RELAXED"])
    return random.choice(responses)

def get_fallback_intervention(state):
    return {
        "type": "intervention",
        "message": get_fallback(state),
        "priority": "low",
        "reason": "fallback",
        "state": state, 
        "buttons": ["Thanks", "Not Now"],
        "code_suggestion": None
    }
    