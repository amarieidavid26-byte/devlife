// Code Quality Index -- the single "fitness to ship" readout.
//
// Two capacity terms set the ceiling and one arousal term decides where you are inside it:
//   recovery   -- WHOOP overnight readiness, stable across a day
//   hrv_daily  -- WHOOP overnight RMSSD, vagal self-regulation capacity. Deliberately NOT the
//                 live BLE RMSSD, which drops while you concentrate and would double-penalise
//                 focus (the same effort already shows up in estimated_stress).
//   arousalFit -- inverted-U. Peaks at CQI_OPT and falls off toward both extremes.
//
// The arousal term is the point of this module. An earlier version used a monotonic
// `1 - stress/3` penalty, which said "less arousal is always better" and therefore
// contradicted the Yerkes-Dodson inverted-U that biometric_engine.classify() itself
// implements -- RELAXED scored higher than DEEP_FOCUS. Now both agree: the best physiological
// moment to ship code is moderate arousal, not zero.
//
// CQI_OPT is the midpoint of the DEEP_FOCUS stress band (0.9-1.5) and the exact value
// classify() assigns to the live-HR focus band. CQI_SPAN normalises the distance so the fit
// only reaches 0 at the top of the 0-3 stress scale.
//
// Weights are our own design calibration, not taken from a published study: the momentary
// term carries the most weight so CQI behaves as a live readout rather than a slow-moving
// daily capacity number.

export const CQI_OPT = 1.2;
export const CQI_SPAN = 1.8;

export const CQI_W_RECOVERY = 0.30;
export const CQI_W_HRV = 0.25;
export const CQI_W_AROUSAL = 0.45;

// How well the current arousal matches the productive middle of the inverted-U. 0..1
export function arousalFit(stress) {
    return Math.max(0, 1 - Math.abs(stress - CQI_OPT) / CQI_SPAN);
}

// data: a biometric_update payload. Returns 0-100, rounded.
export function computeCQI(data, fallback = {}) {
    const recovery = data.recovery || fallback.recovery || 50;
    const hrvDaily = (data.hrv_daily != null ? data.hrv_daily : data.hrv) || fallback.hrv || 40;
    const stress = data.estimated_stress !== undefined
        ? data.estimated_stress
        : (fallback.stress || 0);

    const recFactor = Math.min(recovery / 100, 1);
    const hrvFactor = Math.min(hrvDaily / 80, 1);

    return Math.round((
        recFactor * CQI_W_RECOVERY +
        hrvFactor * CQI_W_HRV +
        arousalFit(stress) * CQI_W_AROUSAL
    ) * 100);
}
