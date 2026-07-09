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
