# fake biometrics for demo
# simulates the whoop data so we can work around with Ghost without a real band
# 5 presets and switches between them over 2 seconds 
"""
Usage: 
    mock = MockBiometrics()
    mock.set_state(2)
    data = mock.get_data()

Preset numbers: 
    1 = focus
    2 = stressed  - just like i am 
    3 = fatigued
    4 = relaxed - the default one 
    5 = wired  

"""
import time 
import threading 

class MockBiometrics: 
    #biometric values that match a specific cognitive state
    PRESETS = {
        1: {  # DEEP_FOCUS — moderate strain, good recovery, calm heart
            "name": "DEEP_FOCUS",
            "heartRate": 62,
            "strain": 10.2,
            "recovery": 75,
            "sleepPerformance": 0.85,
            "hrv": 65,
            "estimated_stress": 1.2,
            # float — blood oxygen saturation percentage (from WHOOP pulse oximeter)
            "spo2": 97.5,
            "skinTemp": 33.2
        },
        2: {  # STRESSED — high strain, low recovery, elevated heart rate
            "name": "STRESSED",
            "heartRate": 95,
            "strain": 18.5,
            "recovery": 45,
            "sleepPerformance": 0.60,
            "hrv": 22,
            "estimated_stress": 2.6,
            "spo2": 96.0,
            "skinTemp": 34.1
        },
        3: { # FATIGUED - low everything, bad sleep, needs rest
             "name": "FATIGUED", 
            "heartRate": 55,
            "strain": 3.1, 
            "recovery": 30, 
            "sleepPerformance": 0.45,
            "hrv": 28, 
            "estimated_stress": 1.8, 
            "spo2": 95.5,
            "skinTemp": 33.0
        }, 
        4: { # RELAXED - low strain, high recovery, rested as fuck 
            "name": "RELAXED", 
            "heartRate": 68,
            "strain": 4.5,
            "recovery": 85,
            "sleepPerformance": 0.92,
            "hrv": 72, 
            "estimated_stress": 0.4, 
            "spo2": 98.0,
            "skinTemp": 33.5
        },
        5: { # WIRED - high strain + low recovery so that means that the coder is running on caffeine and crack
            "name": "WIRED", 
            "heartRate": 88,
            "strain": 14.3,
            "recovery": 50, 
            "sleepPerformance": 0.70,
            "hrv": 35,
            "estimated_stress": 1.9,
            "spo2": 96.5,
            "skinTemp": 33.8
        }
    }

    NUMERIC_FIELDS = {
        "heartRate", "strain", "recovery", "sleepPerformance", "hrv", "estimated_stress", "spo2", "skinTemp"

    }

    def __init__(self): 
        self.current_preset = 4
        self.current_data = dict(self.PRESETS[4])
        self.target_data = dict(self.PRESETS[4])
        self.transitioning = False

    def set_state(self, preset_number):
    # switch to a preset state, smooth transition so HR doesnt jump instantly
        if preset_number not in self.PRESETS: 
            return False

        self.current_preset = preset_number
        self.target_data = dict(self.PRESETS[preset_number])
        self.transitioning = True

        thread = threading.Thread(target = self._transition, daemon = True)
        thread.start()
        return True

    def get_data(self): 
        return dict(self.current_data)
    
    def get_state_name(self):
        return self.PRESETS[self.current_preset]["name"]

    def _transition(self):
        steps = 20
        delay = 2.0 / steps
        start_data = dict(self.current_data)
        
        for step in range (1, steps + 1):
            progress = step / steps

            for key in self.NUMERIC_FIELDS: 
                start_val = start_data.get(key, 0)
                target_val = self.target_data.get(key, 0)
                self.current_data[key] = start_val + (target_val - start_val) * progress

        time.sleep(delay)
    
        self.current_data["name"] = self.target_data["name"]
        self.transitioning = False


        