import time

from biometric_engine import BiometricEngine


def _bio():
    return BiometricEngine("", "")


def test_rmssd_known_value():
    bio = _bio()
    # RR series 800,810,790,805,795,800,812,798,803 -> diffs 10,-20,15,-10,5,12,-14,5
    bio.add_rr_intervals([800, 810, 790, 805, 795, 800, 812, 798, 803])
    diffs = [10, -20, 15, -10, 5, 12, -14, 5]
    expected = round((sum(d * d for d in diffs) / len(diffs)) ** 0.5, 1)
    assert bio.live_hrv == expected
    assert bio.live_hrv_timestamp > 0


def test_rmssd_needs_min_samples():
    bio = _bio()
    bio.add_rr_intervals([800, 810, 790])
    assert bio.live_hrv is None


def test_rmssd_rejects_artifacts():
    bio = _bio()
    # 50ms and 5000ms are outside physiological bounds and must be dropped
    bio.add_rr_intervals([800, 50, 810, 5000, 790, 805, 795, 800, 812, 798, 803])
    values = [v for _, v in bio.live_rr]
    assert 50 not in values and 5000 not in values
    assert bio.live_hrv is not None


def test_rmssd_ceiling_rejects_artifact_window():
    bio = _bio()
    # beats oscillating at the top of the accepted band (each within the per-beat tolerance,
    # so the median filter lets them through) still produce an RMSSD of ~240ms -- far above any
    # real HRV. The per-window ceiling must reject it so the clean WHOOP-cloud value stands in.
    bio.add_rr_intervals([800, 1040] * 5)
    assert bio.compute_live_hrv() is None
    assert bio.live_hrv is None


def test_artifact_beat_excluded_from_hrv():
    bio = _bio()
    # steady ~800ms beats with one doubled-beat spike (1600); it is a window-median outlier and
    # must be excluded from the RMSSD instead of inflating it
    bio.add_rr_intervals([800, 810, 790, 805, 1600, 795, 800, 812, 798, 803])
    assert bio.live_hrv is not None
    assert bio.live_hrv < 50   # without exclusion the 1600 spike would blow the RMSSD sky-high


def test_lone_bad_first_beat_does_not_lock_out_good_beats():
    bio = _bio()
    # the first beat after pairing is a doubled-beat artifact (400ms), then the sensor recovers.
    # A running-anchor filter would reject every real beat after it; the window-median approach
    # treats the 400 as the outlier and still yields a real HRV.
    bio.add_rr_intervals([400, 800, 810, 790, 805, 795, 800, 812, 798, 803])
    assert bio.live_hrv is not None
    assert bio.live_hrv < 50


def test_live_hrv_cleared_when_window_turns_artifact():
    bio = _bio()
    bio.add_rr_intervals([800, 810, 790, 805, 795, 800, 812, 798, 803])
    assert bio.live_hrv is not None
    # a later artifact burst must drop live_hrv back to None, not leave a stale reading that
    # keeps overriding the cloud HRV for 30s
    bio.live_rr = []
    bio.add_rr_intervals([800, 1040] * 5)
    assert bio.live_hrv is None


def test_rmssd_window_expiry():
    bio = _bio()
    bio.add_rr_intervals([800, 810, 790, 805, 795, 800, 812, 798])
    # age everything past the window; the next add prunes it
    bio.live_rr = [(t - 120, v) for t, v in bio.live_rr]
    bio.add_rr_intervals([700])
    assert len(bio.live_rr) == 1
    assert bio.compute_live_hrv() is None


def test_steady_rr_means_low_rmssd_high_stress_mapping():
    bio = _bio()
    # zero-variability series -> RMSSD 0 (autonomic exhaustion signature)
    bio.add_rr_intervals([750] * 10)
    assert bio.live_hrv == 0.0


def test_live_hrv_drives_estimated_stress_in_classify():
    bio = _bio()
    bio.hrv_baseline = 60.0
    # healthy variability ~ratio > 0.85 -> low stress
    bio.add_rr_intervals([800, 870, 790, 860, 795, 865, 812, 858, 803])
    bio.live_heart_rate = 80
    bio.live_hr_timestamp = time.time()
    bio.classify({"recovery": 70, "strain": 8, "sleepPerformance": 0.8, "hrv": 40, "heartRate": 70})
    assert bio.estimated_stress is not None


def test_hrv_baseline_survives_repeated_same_day_polls():
    """WHOOP HRV is a once-daily value but fetch_data polls every 5s. update_baseline used
    to append every poll, so the 14-slot window filled with copies of today and the baseline
    collapsed to today's value -> hrv_ratio ~1.0 -> the HRV stress signal erased itself."""
    bio = _bio()
    bio.hrv_baseline = 65.0
    bio._hrv_calibrated = True          # a real 2-week baseline is loaded
    for _ in range(30):                 # same daily reading re-polled 30 times
        bio.update_baseline(40.0, cycle_id=1001)
    # a low-recovery day (40 vs 65) must still read as depressed, not collapse to ratio 1.0
    assert bio.hrv_baseline > 55.0, "baseline collapsed toward today's value"
    assert 40.0 / bio.hrv_baseline < 0.85, "HRV stress signal was erased"


def test_hrv_baseline_drifts_slowly_across_days():
    bio = _bio()
    bio.hrv_baseline = 60.0
    bio._hrv_calibrated = True
    bio.update_baseline(40.0, cycle_id=1)   # new day, low reading
    after_one = bio.hrv_baseline
    assert 55.0 < after_one < 60.0, "a new day should nudge the baseline, not snap to it"
    bio.update_baseline(40.0, cycle_id=1)   # same day again -> no change
    assert bio.hrv_baseline == after_one


def test_hrv_cold_start_snaps_to_first_real_reading():
    bio = _bio()                            # no calibration loaded
    assert not bio._hrv_calibrated
    bio.update_baseline(48.0, cycle_id=7)
    assert bio.hrv_baseline == 48.0         # snap once, then EMA from here
    assert bio._hrv_calibrated
