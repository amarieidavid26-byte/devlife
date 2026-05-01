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
        "One step at a time. whats the smallest thing you can fix?",
        "HRV is dropping. maybe take a short walk?",
        "This is a tough one, but you will conquer",
        "every expert was stuck here at some point too",
        "try rubber ducking it. explain the problem out loud",
        "breathe bro. you got this"
    ],
    "FATIGUED": [
        "your decision quality drops when youre this tired",
        "pick this up tomorrow with fresh eyes.",
        "grab some water? small break, big difference.",
        "Save your work. just in case.",
        "your future self will thank you for resting now",
        "just save bro"
    ],
    "RELAXED": [
        "good headspace rn. tackle something creative.",
        "Nice flow. wanna brainstorm some edge cases?",
        "You seem sharp right now. good time for the hard stuff",
        "what would this look like with half the code?",
        "recovery looks great. make the most of it"
    ],
    "WIRED": [
       "Focus. One thing at a time.",
        "Ship it. Move on.",
        "dont overthink it. first solution usually works.",
        "Too many tabs open. pick one.",
        "That's done. Next.",
        # "slow down" -- too preachy, removed
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
    