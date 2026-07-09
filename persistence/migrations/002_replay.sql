-- session replay: samples need the cognitive state to color the timeline
ALTER TABLE biometric_samples ADD COLUMN state TEXT;
