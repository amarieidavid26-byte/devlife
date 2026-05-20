#!/usr/bin/env python3
"""Ground-truth WHOOP probe: dumps the RAW v2 JSON so we can verify the field mapping.

Usage:
    1. Put WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET in .env
    2. Connect once via the running server: open http://localhost:8000/api/whoop/auth,
       log in, let it redirect (this writes .whoop_tokens.json).
    3. python scripts/whoop_probe.py

It reuses BiometricEngine so token load/refresh is identical to the app. It then prints,
for each endpoint, the HTTP status and the raw JSON of the most recent record — including
the recovery path nested under the latest cycle, which is where v2 actually puts it.
"""
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from config import WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET
from biometric_engine import BiometricEngine

API = "https://api.prod.whoop.com/developer/v2"


def show(title, resp):
    print("\n" + "=" * 78)
    print(f"{title}  ->  HTTP {resp.status_code}")
    print("=" * 78)
    try:
        print(json.dumps(resp.json(), indent=2)[:4000])
    except Exception:
        print(resp.text[:1500])


def main():
    if not WHOOP_CLIENT_ID or not WHOOP_CLIENT_SECRET:
        print("ERROR: WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET missing from .env")
        sys.exit(1)

    bio = BiometricEngine(WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET)
    bio._check_token()
    if not bio.access_token:
        print("ERROR: no access token. Connect first: open http://localhost:8000/api/whoop/auth")
        print("(that writes .whoop_tokens.json, then re-run this probe)")
        sys.exit(1)

    h = {"Authorization": f"Bearer {bio.access_token}"}
    print(f"token OK (expires in ~{int(bio.token_expiry - __import__('time').time())}s)")

    with httpx.Client(timeout=20) as c:
        show("GET /user/profile/basic", c.get(f"{API}/user/profile/basic", headers=h))

        rec = c.get(f"{API}/recovery", headers=h, params={"limit": 1})
        show("GET /recovery?limit=1  (recovery_score, hrv_rmssd_milli, resting_heart_rate, spo2, skin_temp)", rec)

        cyc = c.get(f"{API}/cycle", headers=h, params={"limit": 1})
        show("GET /cycle?limit=1  (strain, kilojoule, average_heart_rate, max_heart_rate)", cyc)

        # v2 nests recovery under the cycle — verify the canonical path too
        try:
            cid = cyc.json().get("records", [{}])[0].get("id")
            if cid:
                show(f"GET /cycle/{cid}/recovery  (canonical v2 recovery path)",
                     c.get(f"{API}/cycle/{cid}/recovery", headers=h))
        except Exception as e:
            print(f"(could not derive cycle id: {e})")

        slp = c.get(f"{API}/activity/sleep", headers=h, params={"limit": 1})
        show("GET /activity/sleep?limit=1  (sleep_performance_percentage lives HERE, not in recovery)", slp)

    print("\nDone. Compare these real fields/units against biometric_engine.fetch_data() mapping.")


if __name__ == "__main__":
    main()
