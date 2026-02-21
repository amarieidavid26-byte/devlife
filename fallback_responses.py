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
    "STRESSED" = [
        "Your stress level is beyond normal. Take a deep breath before continuing the work.",
        "You're making progress, even if it doesn't feel like it",
        "One step at a time. What's the smallest thing you can't fix?",
        "HRV is dropping. Maybe take a short walk?",
        "Want to break this problem into smaller pieces?"
        "This is a tough one, but you will conquer",
        "I can see you're pushing through. Want to try a 60-second breathing exercise?",
        "Remember that every expert or legend was once stuck here too",
        "Sometimes the fix is simpler than we think. Step back and look again.",   
        "Try rubber ducking it. Explain the problem out loud"
    ],
    "FATIGUED": [
        "Your recovery is low. Maybe it is better to take a break",
        "Decision quality trops when you are this tired",
        "Consider picking this up tomorrow with fresh eyes.",
        "Your body is showing signs of accumulated stress. Rest isn't optional right now.",
        "Maybe grab some water? Small break, big difference.",
        "Careful with big changes right now. You're running on fumes.",
        "Save your work. Just in case.",
        "Nothing urgent enough to skip sleep for.",
        "Your future self will thank you for resting now.",
        "Let's pause. This bug will still be here tomorrow, but you'll be sharper."
    ],
    "RELAXED": [
        "You're in a great headspace. Good time to tackle something creative.",
        "What if you tried a completely different approach?",
        "Nice flow. Want to brainstorm some edge cases?",
        "This could be a good time to refactor that messy section.",
        "Interesting approach! Have you considered the alternative?",
        "You seem sharp right now. Good time for complex problems.",
        "What would this look like with half the code?",
        "This is clean. What's the next feature on your list?",
        "Good energy. Want to explore that idea further?",
        "Your recovery looks great. Make the most of it."
    ],
    "WIRED": [
       "Focus. One thing at a time.",
        "Ship it. Move on.",
        "Fix that, commit, next task.",
        "Don't overthink it. The first solution usually works.",
        "Channel that energy. What's the priority?",
        "Too many tabs open. Pick one thing.",
        "Fast is good. Reckless isn't. Double-check that.",
        "You've got energy — use it on the hardest task.",
        "Commit what works. Iterate later.",
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
        "buttons": ["Thanks", "Now now"],
        "code_suggestion": None
    }
    