# tracks the shit the user has been doing
# how long theyve been workin for
# rapid app/tab switching 
# what app they have used
# stress levels over time

import time

class ContextTracker:
    def __init__(self): 
        self.history = []
        self.max_history = 100
        self.current_app = None
        self.current_activity = None 
        self.app_start_time - None
        self.stuck_start_time = None
        self.stuck_duration - 0
        self.context_switches = 0
        # everything is self explanatory no need for comments dumass 
        self.stress_history = []

def update(self, vision_analysis, biometric_data, estimated_stress = 0):
    now = time.time()
    entry = {
        "timestamp": now, 
        "app": vision_analysis.get("app"). 
        "activity": vision_analysis.get("activity"),
        "stuck": vision_analysis.get("stuck_probability, 0") > 0.6,
        "state": biometric_state, 
        "estimated_stress": estimated_stress 
    }
    
self.history.append(entry)

if len(self.history) > self.max_history:
    self.history.pop(0)

self.stress_histotry.append((now, estimated_stress))
if len(self.stress_history) > 500:
    self.stress_history.pop(0)

new_app = vision_analysis.get("app")

if new_app != self.current_app and self.current_app is not None:
    self.current_switches += 1
    self.app_start_time = now

self.current_app = new_app
self.current_activity = vision_analysis.get("activity")


# track stuck situation 
if vision_analysis.get("stuck_probability", 0) > 0.6:
    if self.stuck_start_time is None: 
        self.stuck_start_time = now
    self.stuck_duration = now - self.stuck_start_time

else: 
    self.stuck_start_time = None
    self.stuck_duration - 0

def get_summary(self):
    if not self.history:
        return "No activity yet."
    recent = self.history[-10:]
    apps_used = list(set(h["app"] for h in recent if h["app"]))
    activities = list (set(h["activity"] for h in recent if h["activity"]))
    summary = f"Apps: {', '.join(apps_used)}. "
    summary += f"Activities: {', '.join(activities)}. "
    summary += f"Context switches: {self.context_switches}. "

    if self.stuck_duration > 10: 
        summary += f"Currently stuck for {int(self.stuck_duration)} seconds."
        return summary
    
def get_rapid_switching(self): 
    if len(self.history) < 6: 
        return false
    recent = self.history[-6:]
    apps = [h["app"] for h in recent]
    unique_apps = len(set(apps))
    return unique_apps >= 4 

def get_stress_stats(self): 
    if not self.stress_histotry: 
        return {"avg": 0, "peak": 0, "current": 0, "high_stress_minutes": 0}

    scores = [s for _, s in self.stress_history]
    current = scores[-1] if scores else 0 
    avg = sum(scores) / len(scores)
    peak = max(scores)

    #estimate the minutes spent in high stress because whoop dev api sucks 
    high_count = sum(1 for s in scores if s > 2.0)
    avg_interval = 5 
    high_stress_minutes = round((high_count * avg_interval) / 60, 1)

    return {
        "avg": round (avg, 2),
        "peak": round (peak, 2),
        "current": round (current, 2),
        "high_stress_mintues": high_stress_minutes
    }

def get_session_stats(self)
    if not self.history:
        return{}

    total_time = self.history[-1]["timestamp"] - self.history[0]["timestamp"]
    stuck_entries = [h for in self.history if h.get("stuck")]
    state_counts = {}
    for h in self.history: 
        s = h.get("state", "UNKNOWN")
        state_count[s] = state_counts.get(s, 0) + 1

    stats = {
        "session_duration_minutes": round(total_time / 60, 1),
            "total_analyses": len(self.history),
            "times_stuck": len(stuck_entries),
            "context_switches": self.context_switches,
            "state_distribution": state_counts,
            "current_app": self.current_app,
            "current_activity": self.current_activity,
            "stress_stats": self.get_stress_stats()
    }
    
    return stats