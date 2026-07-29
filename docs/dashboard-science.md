# DevLife: The Science Behind the Biometric Dashboard

> In the app these same explanations are one click away: a 💡 lightbulb next to each
> term on the Dashboard (TAB) opens an expandable panel with the plain-language
> meaning, the formula, and the citations below.

---

## Overview

DevLife reads four *measured* signals from a WHOOP band: **recovery**, **HRV** (heart-rate
variability, RMSSD), **day strain**, and **resting heart rate**, plus an optional **live
heart rate** over Bluetooth. From these it derives four *interpreted* signals shown on the
dashboard: a **Stress Level**, a **Cognitive Load** index, an **Autonomic Balance** (SNS vs
PNS) readout, and a five-way **Cognitive State**. A composite **Code Quality Index (CQI)**
summarises "fitness to ship".

The throughline is one well-established idea in psychophysiology: the **autonomic nervous
system** (which we can observe non-invasively through the heart) tracks both stress and the
mental effort behind focused work, and performance follows an **inverted-U** with arousal.
Everything below grounds each readout in that literature.

> **Honesty note:** DevLife estimates wellness/arousal signals for productivity insight. It
> is **not** a medical device and provides **no diagnosis**. HRV is interpreted against the
> user's *own* rolling baseline, which is the recommended practice because HRV differs
> hugely between individuals.

---

## 1. Stress Level (scale 0.0-3.0)

**What it means.** A live estimate of nervous-system strain. It rises when current HRV falls
below the user's personal normal.

**How DevLife computes it** (`biometric_engine.classify()`):
```
ratio = current HRV (RMSSD) ÷ 14-reading baseline
ratio ≥ 0.85 → 0.5   (calm)
ratio < 0.85 → 1.2
ratio < 0.75 → 1.8
ratio < 0.60 → 2.5   (high)
# a live Bluetooth HR, when present, also pushes the score up when elevated
```

**The science.** HRV is a validated, non-invasive index of autonomic activity. A meta-analysis
of 37 studies found psychological stress is reliably associated with **reduced HRV**,
especially vagally-mediated components such as RMSSD (Kim et al., 2018). Comparing to a
**personal baseline** rather than fixed thresholds follows standard HRV methodology, because
healthy HRV varies widely across people (Shaffer & Ginsberg, 2017).

- Kim et al. (2018), *Psychiatry Investig.*, PMID **29486547**
- Shaffer & Ginsberg (2017), *Front Public Health*, PMID **29034226**

---

## 2. Cognitive Load (index 0-100%)

**What it means.** The physiological "cost" of concentration right now. High sustained load is
where errors begin.

**How DevLife computes it** (`DashboardOverlay.update()`):
```
cognitiveLoad % = (stress ÷ 3) × 100
```
Autonomic arousal (the stress index) is used as a proxy for mental workload.

**The science.** Mental workload measurably suppresses HRV: as a task gets harder, time-domain
HRV drops in a **graded, dose-dependent** way (Jian et al., 2026; Jian et al., 2025 — note both
are from the same research group, so treat this as one line of evidence, not two independent
replications). This is explained by **neurovisceral integration**:
the prefrontal circuits that sustain focus also regulate the heart, so cardiac autonomic
signals track executive demand (integrative review, 2021). HRV is used operationally to gauge
workload in demanding professions, e.g. surgeons (meta-analysis, 2026).

- Task difficulty influences HRV (2026), *Sci Rep*, PMID **41820547**
- Graded task-difficulty effects via time-domain HRV (2025), *J Physiol Anthropol*, PMID **41286973**
- Low HRV, emotional dysregulation & prefrontal function (2021), *J Pers Med*, PMID **34575648**
- HRV in assessing surgeons' stress (2026), *Healthcare*, PMID **41753997**

---

## 3. Autonomic Balance (SNS vs PNS)

**What it means.** The autonomic nervous system has two opposing branches: **sympathetic**
(SNS, "fight-or-flight", speeds you up) and **parasympathetic** (PNS, "rest-and-digest",
calms you down). The two bars show which currently dominates (sympathovagal balance).

**How DevLife computes it** (`DashboardOverlay.update()`):
```
PNS bar = min(HRV ÷ 80ms, 1)     ← vagal / recovery tone
SNS bar = min(stress ÷ 3, 1)     ← arousal / activation
SNS ≫ PNS → "Fight-or-flight dominant"
PNS ≫ SNS → "Rest-and-digest dominant"
else      → "Balanced"
```

**The science.** RMSSD-based HRV is a recognised marker of **parasympathetic (vagal)**
activity, so higher HRV = stronger rest-and-digest tone (Shaffer & Ginsberg, 2017). Stress
shifts the balance toward **sympathetic dominance** and away from vagal control (Kim et al.,
2018). The brain and heart continuously negotiate this balance through the brain-heart axis
(2025 review).

- Shaffer & Ginsberg (2017), *Front Public Health*, PMID **29034226**
- Kim et al. (2018), *Psychiatry Investig.*, PMID **29486547**
- Brain-Heart Interactions (2025), *Appl Psychophysiol Biofeedback*, PMID **39969644**

---

## 4. Cognitive State (5 states · Yerkes-Dodson inverted-U)

**What it means.** Each moment is classified as **RELAXED, DEEP_FOCUS, WIRED, STRESSED, or
FATIGUED** using the **inverted-U law**: performance peaks at *moderate* arousal and declines
when under-aroused (tired/bored) or over-aroused (stressed/wired).

**How DevLife computes it** (`biometric_engine.classify()`):
```
inputs: WHOOP recovery, day strain, HRV stress index, live HR (if paired)
low recovery / poor sleep      → FATIGUED
high stress / very high strain → STRESSED
high strain + low recovery     → WIRED
moderate-arousal "sweet spot"  → DEEP_FOCUS
otherwise                      → RELAXED
```

**The science.** The Yerkes-Dodson law (1908) has been **re-validated with modern
neuroscience**: a cortical disinhibitory circuit produces peak performance at mid-level
arousal (PNAS, 2024), and norepinephrine-driven arousal yields inverted-U brain-network
dynamics (Nat Commun, 2025). Because lower HRV maps to weaker prefrontal control (2021), the
high-arousal states are exactly when error rates climb, which is why DevLife's Ghost
intervenes most in STRESSED/WIRED/FATIGUED.

- A disinhibitory circuit for peak performance at mid-level arousal (2024), *PNAS*, PMID **38277436**
- Norepinephrine-mediated inverted-U connectivity dynamics (2025), *Nat Commun*, PMID **41390822**
- Low HRV & prefrontal dysfunction (2021), *J Pers Med*, PMID **34575648**

---

## 5. Code Quality Index: CQI (index 0-100%)

**What it means.** A single "fitness to ship" readout. Two **capacity** terms set the ceiling —
how recovered the developer is and how well-regulated their autonomic system is — and one
**arousal fit** term decides where inside that ceiling they land right now.

**How DevLife computes it** (`utils/cqi.js`, shared by the dashboard and the in-game HUD):
```
arousalFit = max(0, 1 − |stress − 1.2| ÷ 1.8)

CQI % = ( recovery/100          × 0.30
        + min(dailyHRV/80, 1)   × 0.25
        + arousalFit            × 0.45 ) × 100
```

**The science.** CQI is DevLife's **own composite** (not a clinical measure), but each
ingredient is independently validated: recovery/sleep readiness, vagally-mediated HRV as a
marker of self-regulation capacity (Shaffer & Ginsberg, 2017), and the HRV-based stress index
(Kim et al., 2018). The rationale is the neurovisceral link: better autonomic regulation
supports the prefrontal control careful programming depends on.

The arousal term follows the **same inverted-U as the state classifier** (§4): performance
peaks at moderate arousal, so full rest scores lower than productive engagement. `1.2` is the
midpoint of the DEEP_FOCUS stress band (0.9–1.5) and the exact value `classify()` assigns to
the live-HR focus band; `1.8` normalises the distance so the fit only reaches 0 at the top of
the 0–3 scale.

> **Why this replaced the earlier formula.** CQI previously used a monotonic `1 − stress/3`
> penalty, i.e. "less arousal is always better". That contradicted the inverted-U this project
> is built on, and produced the visible symptom that RELAXED outscored DEEP_FOCUS. The HRV term
> also used the *live* RMSSD, which falls while you concentrate — penalising focus twice, since
> that same effort is already counted in the stress term. It now uses the stable overnight HRV.

**Honest note on the weights.** The three weights are our own calibration, not taken from any
published study — the same status as the 0.75 stress threshold documented in `positioning.md`.
The momentary term carries the most weight so CQI behaves as a live readout rather than a
slow-moving daily capacity number.

- Shaffer & Ginsberg (2017), *Front Public Health*, PMID **29034226**
- Kim et al. (2018), *Psychiatry Investig.*, PMID **29486547**

---

## Key terminology

- **HRV (heart-rate variability):** the small beat-to-beat changes in heart rhythm; a window
  into autonomic nervous-system activity.
- **RMSSD:** the specific time-domain HRV metric WHOOP reports (`hrv_rmssd_milli`, in ms); it
  primarily reflects **parasympathetic/vagal** activity.
- **SNS / PNS:** sympathetic ("fight-or-flight") and parasympathetic ("rest-and-digest")
  branches of the autonomic nervous system.
- **Neurovisceral integration:** the framework linking prefrontal cognitive control to cardiac
  autonomic regulation, which is why HRV tracks focus and stress.
- **Yerkes-Dodson / inverted-U:** performance is best at moderate arousal and worse at the
  extremes.

## Selected papers

1. **An Overview of Heart Rate Variability Metrics and Norms**, Shaffer & Ginsberg (2017),
   *Frontiers in Public Health*. PMID 29034226: https://pubmed.ncbi.nlm.nih.gov/29034226/
2. **Stress and Heart Rate Variability: A Meta-Analysis and Review**, Kim et al. (2018),
   *Psychiatry Investigation*. PMID 29486547: https://pubmed.ncbi.nlm.nih.gov/29486547/
3. **A disinhibitory circuit mechanism for peak performance at mid-level arousal** (2024),
   *PNAS*. PMID 38277436: https://pubmed.ncbi.nlm.nih.gov/38277436/
4. **Task difficulty influences heart rate variability** (2026), *Scientific Reports*.
   PMID 41820547: https://pubmed.ncbi.nlm.nih.gov/41820547/
5. **Low HRV, emotional dysregulation & prefrontal function: an integrative view** (2021),
   *J Personalized Medicine*. PMID 34575648: https://pubmed.ncbi.nlm.nih.gov/34575648/

*DevLife is not a medical device and does not provide medical advice or diagnosis.*
