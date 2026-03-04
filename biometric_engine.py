# biometric engine - here we have the whoop integration and cognitive state classifier
# smart ass file right here
# connects to whoop api via oauth2, fetches recov/strain/sleep data and classifies them into
# deepfocus - stressed - wired - fatigued - relaxed
# the classification is based on Peifer 2014, inverted U model adn the Yerkes-Dodson law.
# performance peaks at moderate arousal, drops at both extremes
# alright lets code enough science

import httpx
import time
import json 
import os 

class BiometricEngine:
    TOKENS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
        ".whoop_tokens.json")

    def __init__ (self, client_id = None, client_secret = None):
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token = None
        self.current_data = None
        self.current_state = "RELAXED"
        self.on_state_change_callback = None
        self.polling = False
        self.hrv_history = []
        self.hrv_baseline = 50.0
        self.estimated_stress = 0.0
        self.rhr_baseline = 65.0
        # token refresh
        self.token_expiry = 0
        self.refresh_token = None
        self._sleep_error_logged = False
        self.live_heart_rate = 0
        self.live_hr_timestamp = 0
        self._load_tokens()

    # oauth2 urls
    AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
    TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
    API_BASE = "https://api.prod.whoop.com/developer/v2"

    # oauth flow
    def get_auth_url(self, redirect_uri):
        # generate the WHOOP oauth url
        # user visits this URL, logs in and whoop redirects back with a code
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "read:recovery read:cycles read:sleep read:workout read:body_measurement",
            "state": "devlife_whoop_auth_2026"
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.AUTH_URL}?{query}"

    def exchange_token(self, code, redirect_uri):
        try:
            response = httpx.post(self.TOKEN_URL, data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri
            })
            if response.status_code == 401:
                print("[biometric_engine] Token exchange failed: invalid or expired credentials")
                self.access_token = None
                return False
            if response.status_code < 200 or response.status_code >= 300:
                print(f"[biometric_engine] Token exchange failed: HTTP {response.status_code}")
                self.access_token = None
                return False
            data = response.json()
            self.access_token = data.get("access_token")
            self.refresh_token = data.get("refresh_token")
            expires_in = data.get("expires_in", 3600)
            self.token_expiry = time.time() + expires_in
            return self.access_token is not None
        except Exception as e:
            print(f"[biometric_engine] Token exchange error: {e}")
            self.access_token = None
            return False

    def refresh_access_token(self):
        if not self.refresh_token:
            return False
        try:
            response = httpx.post(self.TOKEN_URL, data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token"
            })
            if response.status_code == 200:
                data = response.json()
                self.access_token = data.get("access_token")
                self.refresh_token = data.get("refresh_token", self.refresh_token)
                expires_in = data.get("expires_in", 3600)
                self.token_expiry = time.time() + expires_in
                print("[biometric_engine] Token refreshed successfully")
                return True
            else:
                print(f"[biometric_engine] Token refresh failed: HTTP {response.status_code}")
        except Exception as e:
            print(f"[biometric_engine] Token refresh failed: {e}")
        return False

    def ensure_token_valid(self):
        if self.access_token and time.time() >= self.token_expiry - 60:
            print("[biometric_engine] Token expiring soon, refreshing...")
            return self.refresh_access_token()
        return self.access_token is not None

    def update_baseline(self, hrv_value):
        self.hrv_history.append(hrv_value)
        if len(self.hrv_history) > 14:
            self.hrv_history.pop(0)
        if self.hrv_history:
            self.hrv_baseline = sum(self.hrv_history) / len(self.hrv_history)

    def fetch_data(self):
        if not self.access_token:
            return None
        self.ensure_token_valid()
        headers = {"Authorization": f"Bearer {self.access_token}"}
        try:
            recovery_resp = httpx.get(f"{self.API_BASE}/recovery", headers=headers, params={"limit": 1})
            if recovery_resp.status_code == 401:
                print("[bio] Token expired — need to re-authenticate")
                self.access_token = None
                return None
            if recovery_resp.status_code < 200 or recovery_resp.status_code >= 300:
                print(f"[bio] Recovery API error: HTTP {recovery_resp.status_code}")
                return None
            recovery_data = recovery_resp.json()

            cycle_resp = httpx.get(f"{self.API_BASE}/cycle", headers=headers, params={"limit": 1})
            if cycle_resp.status_code == 401:
                print("[bio] Token expired — need to re-authenticate")
                self.access_token = None
                return None
            if cycle_resp.status_code < 200 or cycle_resp.status_code >= 300:
                print(f"[bio] Cycle API error: HTTP {cycle_resp.status_code}")
                return None
            cycle_data = cycle_resp.json()

            sleep_data = None
            try:
                sleep_resp = httpx.get(f"{self.API_BASE}/activity/sleep", headers=headers, params={"limit": 1})
                if sleep_resp.status_code == 200:
                    sleep_data = sleep_resp.json()
                    self._sleep_error_logged = False
                elif not self._sleep_error_logged:
                    print(f"[bio] Sleep API returned HTTP {sleep_resp.status_code} — skipping sleep data")
                    self._sleep_error_logged = True
            except Exception as e:
                if not self._sleep_error_logged:
                    print(f"[bio] Sleep API failed: {e} — skipping sleep data")
                    self._sleep_error_logged = True

            recovery_records = recovery_data.get("records", [])
            recovery_scored = (len(recovery_records) > 0 and recovery_records[0].get("score_state") == "SCORED")
            recovery_score = recovery_records[0].get("score", {}) if recovery_scored else {}
            cycle_records = cycle_data.get("records", [])
            cycle_scored = (len(cycle_records) > 0 and cycle_records[0].get("score_state") == "SCORED")
            cycle_score = cycle_records[0].get("score", {}) if cycle_scored else {}

            sleep_scored = False
            sleep_score = {}
            if sleep_data:
                sleep_records = sleep_data.get("records", [])
                sleep_scored = (len(sleep_records) > 0 and sleep_records[0].get("score_state") == "SCORED")
                sleep_score = sleep_records[0].get("score", {}) if sleep_scored else {}

            self.current_data = {
                "recovery": recovery_score.get("recovery_score", 50),
                "strain": cycle_score.get("strain", 8.0),
                "sleepPerformance": recovery_score.get("sleep_performance_percentage", 75) / 100 if recovery_scored else 0.75,
                "heartRate": recovery_score.get("resting_heart_rate", 65),
                "hrv": recovery_score.get("hrv_rmssd_milli", 50),
                "spo2": recovery_score.get("spo2_percentage", 97.0),
                "skinTemp": recovery_score.get("skin_temp_celsius", 33.5),
            }
            hrv_value = self.current_data.get("hrv")
            if hrv_value:
                self.update_baseline(hrv_value)

            src = "whoop+sleep" if sleep_scored else "whoop"
            print(f"[bio] source={src} | rec={self.current_data['recovery']} strain={self.current_data['strain']} hr={self.current_data['heartRate']} hrv={self.current_data['hrv']}")
            return self.current_data
        except Exception as e:
            print(f"[bio] WHOOP API error: {e}")
            return None

    def classify(self, data=None):
        if data is None:
            data = self.current_data
        if data is None:
            return "RELAXED"
        recovery = data.get("recovery", 50)
        strain = data.get("strain", 8)
        sleep = data.get("sleepPerformance", 0.75)
        hrv = data.get("hrv", 50)
        rhr = data.get("heartRate", 65)
        old_state = self.current_state
        hrv_ratio = hrv / self.hrv_baseline if self.hrv_baseline > 0 else 1.0
        if hrv_ratio < 0.6:
            estimated_stress = 2.5
        elif hrv_ratio < 0.75:
            estimated_stress = 1.8
        elif hrv_ratio < 0.85:
            estimated_stress = 1.2
        else:
            estimated_stress = 0.5
        live_hr = self.live_heart_rate if (time.time() - self.live_hr_timestamp < 5) else 0
        if live_hr > 0:
            if live_hr > 100:
                new_state = "STRESSED"
                estimated_stress = 2.5
            elif live_hr > 95:
                new_state = "WIRED"
                estimated_stress = 1.9
            elif live_hr > 75: 
                new_state = "DEEP_FOCUS"
                estimated_stress = 1.2
            elif live_hr >= 60: 
                new_state = "RELAXED"
                estimated_stress = 0.5
            else:
                live_hr = 0
        if live_hr == 0:
            if recovery < 40 or sleep < 0.7:
                new_state = "FATIGUED"
            elif estimated_stress >= 2.0 or strain > 16:
                new_state = "STRESSED"
            elif strain > 12 and recovery < 60:
                new_state = "WIRED"
            elif 0.9 > estimated_stress <= 1.5 and 8 <= strain <= 14 and recovery > 60:
                new_state = "RELAXED"
            else:
                new_state = "RELAXED"
        self.current_state = new_state
        self.estimated_stress = estimated_stress
        if old_state != new_state and self.on_state_change_callback:
            self.on_state_change_callback(old_state, new_state)
        return new_state

    def get_personality_modifiers(self, state=None):
        if state is None:
            state = self.current_state
        modifiers = {
            "DEEP_FOCUS": {
                "intervention_threshold": 0.9,
                "verbosity": "minimal",
                "tone": "silent_supportive",
                "risk_sensitivity": "low",
                "capture_interval": 10,
                "max_tokens": 30
            },
            "STRESSED": {
                "intervention_threshold": 0.4,
                "verbosity": "medium",
                "tone": "warm_supportive",
                "risk_sensitivity": "high",
                "capture_interval": 2,
                "max_tokens": 100
            },
            "FATIGUED": {
                "intervention_threshold": 0.3,
                "verbosity": "short",
                "tone": "protective",
                "risk_sensitivity": "critical",
                "capture_interval": 3,
                "max_tokens": 80
            },
            "RELAXED": {
                "intervention_threshold": 0.5,
                "verbosity": "detailed",
                "tone": "curious_exploratory",
                "risk_sensitivity": "normal",
                "capture_interval": 5,
                "max_tokens": 200
            },
            "WIRED": {
                "intervention_threshold": 0.5,
                "verbosity": "short",
                "tone": "direct_action",
                "risk_sensitivity": "medium",
                "capture_interval": 3,
                "max_tokens": 60
            }
        }
        result = dict(modifiers.get(state, modifiers["RELAXED"]))
        result["estimated_stress"] = self.estimated_stress
        result["hrv_baseline"] = self.hrv_baseline
        return result

    def _save_tokens(self):
        try:
            with open(self.TOKENS_FILE, "w") as f:
                json.dump({
                    "access_token": self.access_token,
                    "refresh_token": self.refresh_token,
                    "expires_at": self.token_expiry
                }, f)
        except Exception as e:
            print(f"[whoop] Failed to save tokesns: {e}")

    def _load_tokens(self):
        try: 
            if not os.path.exists(self.TOKENS_FILE):
                return
            with open(self.TOKENS_FILE, "r") as f:
                data = json.load(f)
            expires_at = data.get("expires_at", 0)
            if time.time() < expires_at - 60:
                self.access_token = data.get("access_token")
                self.refresh_token = data.get("refresh_token")
                self.token_expiry = expires_at
                print("[whoop] Loaded saved tokens, auto connected")
            elif data.get("refresh_token"): 
                self.refresh_token = data.get("refresh_token")
                print("[whoop] saved token expired, attempting to refresh")
                self.refresh_access_token()
        except Exception as e:
            print(f"[whoop] failed to load tokens: {e}")
    def on_state_change(self, callback):
        self.on_state_change_callback = callback
