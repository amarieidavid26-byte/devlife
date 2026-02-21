# biometric engine - here we have the whoop integration and cognitive state classifier
# smart ass file right here 
# connects to whoop api via oauth2, fetches recov/strain/sleep data and classifies them into
# deepfocus - stressed - wired - fatigued - relaxed 
# the classification is based on Peifer 2014, inverted U model adn the Yerkes-Dodson law. 
# performance peaks at moderate arousal, drops at both extremes
# alright lets code enough science 

import httpx

class BiometricEngine: 
    def __init__ (self, client_id = None, client_secret = None):
        self.client_id = client_id
        self.client_secret = client_secret
        self.across_token = None
        self.current_data = None
        self.current_state = "RELAXED"
        self.on_state_change_callback = None
        self.polling = False

    # oauth2 urls 
    AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
    TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
    API_BASE = "https://api.prod.whoop.com/developer/v1"

    # oauth flow 
    def get_auth_url(self, redirect_uri)
    