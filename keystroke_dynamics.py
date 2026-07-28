# keystroke dynamics - stress/fatigue estimation from typing rhythm alone
# the frontend never sends key contents, only (inter-key interval ms, category) pairs
# categories: char / backspace / enter / nav
# grounding: the keystroke dynamics literature establishes that typing timing carries
# state information - Vizer, Zhou & Sears (2009) separated cognitively/physically stressed
# typing from neutral at 75%/62.5% using inter-key timing and correction-key rate, and Epp,
# Lippold & Mandryk (CHI 2011) classified states like tiredness/nervousness at 77-88% from
# digraph timings. what neither paper gives us is a *signed* rule, so the specific directions
# we use below (stress -> faster + burstier + more corrections, fatigue -> slower + more
# variable + long pauses) are OUR design heuristic, not a published finding. treat as a
# hypothesis to validate, not settled science. works with zero hardware, which makes it the
# fallback signal when no heart rate band is paired

import time

WINDOW_SECONDS = 90
MIN_EVENTS = 30            # below this the signal reports inactive
STALE_SECONDS = 15         # no keys this long -> inactive
IKI_MIN_MS, IKI_MAX_MS = 30, 3000   # rhythm stats only trust plausible intervals
PAUSE_MS = 1500            # interval above this counts as a thinking pause
BASELINE_ALPHA = 0.05      # slow EMA toward the user's personal rhythm
CATEGORIES = {"char", "backspace", "enter", "nav"}


class KeystrokeDynamics:
    def __init__(self):
        self.events = []           # (server_time, iki_ms, category)
        self.baseline_iki = None   # personal median inter-key interval
        self.baseline_err = None   # personal backspace ratio

    def add_events(self, batch):
        now = time.time()
        for item in batch:
            if not isinstance(item, (list, tuple)) or len(item) != 2:
                continue
            iki, cat = item
            if cat not in CATEGORIES or not isinstance(iki, (int, float)):
                continue
            if iki < 0 or iki > 10000:
                continue
            self.events.append((now, float(iki), cat))
        cutoff = now - WINDOW_SECONDS
        self.events = [e for e in self.events if e[0] >= cutoff]
        self._update_baseline()

    def _features(self):
        now = time.time()
        events = [e for e in self.events if e[0] >= now - WINDOW_SECONDS]
        if not events:
            return None
        rhythm = [iki for _, iki, cat in events if cat == "char" and IKI_MIN_MS <= iki <= IKI_MAX_MS]
        typed = sum(1 for _, _, cat in events if cat in ("char", "enter", "backspace"))
        if typed == 0 or len(rhythm) < 2:
            return None
        backspaces = sum(1 for _, _, cat in events if cat == "backspace")
        err = backspaces / typed
        pauses = sum(1 for _, iki, _ in events if iki > PAUSE_MS) / len(events)

        s = sorted(rhythm)
        n = len(s)
        median = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
        mean = sum(rhythm) / n
        var = sum((x - mean) ** 2 for x in rhythm) / n
        cv = (var ** 0.5) / mean if mean > 0 else 0

        span = max(10.0, now - min(t for t, _, _ in events))
        return {
            "count": len(events),
            "last_event": max(t for t, _, _ in events),
            "iki_median": median,
            "iki_cv": cv,
            "backspace_ratio": err,
            "pause_ratio": pauses,
            "events_per_min": len(events) / (span / 60),
        }

    def _update_baseline(self):
        f = self._features()
        if f is None or f["count"] < MIN_EVENTS:
            return
        if self.baseline_iki is None:
            self.baseline_iki = f["iki_median"]
            self.baseline_err = f["backspace_ratio"]
            return
        # adapt only while typing looks neutral: the baseline must not chase the very
        # deviation (stress or fatigue) it exists to detect
        speed_ratio = self.baseline_iki / f["iki_median"] if f["iki_median"] > 0 else 1.0
        elevated_err = self.baseline_err is not None and f["backspace_ratio"] > self.baseline_err + 0.04
        if speed_ratio > 1.05 or speed_ratio < 0.85 or elevated_err:
            return
        self.baseline_iki += (f["iki_median"] - self.baseline_iki) * BASELINE_ALPHA
        self.baseline_err += (f["backspace_ratio"] - self.baseline_err) * BASELINE_ALPHA

    def snapshot(self):
        # the one consumer-facing method: classify() and build_biometric_msg read this
        inactive = {
            "active": False, "stress": 0.5, "fatigue": 0.0, "flow": False,
            "events_per_min": 0, "backspace_ratio": 0.0, "iki_median": None, "iki_cv": None,
        }
        f = self._features()
        if f is None or f["count"] < MIN_EVENTS:
            return inactive
        if time.time() - f["last_event"] > STALE_SECONDS:
            return inactive

        base_iki = self.baseline_iki or f["iki_median"]
        base_err = self.baseline_err if self.baseline_err is not None else f["backspace_ratio"]
        speed_ratio = base_iki / f["iki_median"] if f["iki_median"] > 0 else 1.0

        # stress: typing noticeably faster than your own baseline + more corrections
        stress = 0.5
        if speed_ratio > 1.05:
            stress += min(1.2, (speed_ratio - 1.05) * 5)
        if f["backspace_ratio"] > base_err + 0.04:
            stress += min(1.0, (f["backspace_ratio"] - base_err - 0.04) * 10)
        stress = min(3.0, round(stress, 2))

        # fatigue: slower + erratic rhythm + long pauses + more corrections
        fatigue = 0.0
        if speed_ratio < 0.85:
            fatigue += min(0.5, (0.85 - speed_ratio) * 2.0)
        if f["iki_cv"] > 1.1:
            fatigue += 0.25
        if f["pause_ratio"] > 0.15:
            fatigue += 0.2
        if f["backspace_ratio"] > base_err + 0.06:
            fatigue += 0.2
        fatigue = min(1.0, round(fatigue, 2))

        # flow: sustained, clean, steady typing = the deep-focus tell
        flow = (
            f["events_per_min"] >= 30
            and f["backspace_ratio"] <= base_err + 0.04
            and f["iki_cv"] < 0.9
            and fatigue < 0.4
        )

        return {
            "active": True,
            "stress": stress,
            "fatigue": fatigue,
            "flow": flow,
            "events_per_min": round(f["events_per_min"], 1),
            "backspace_ratio": round(f["backspace_ratio"], 3),
            "iki_median": round(f["iki_median"], 1),
            "iki_cv": round(f["iki_cv"], 2),
        }
