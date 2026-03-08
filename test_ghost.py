# runs thru all Ghost components to verify their integrity 
# takes ss - sends it to claude vision for analysis - tests each biometric 
# tests hrv baseline - tests HRV based stress classification
import time 
from config import CLAUDE_API_KEY
from screen_capture import ScreenCapture
from vision_analyzer import VisionAnalyzer
from biometric_engine import BiometricEngine
from mock_biometrics import MockBiometrics
from ghost_brain import GhostBrain
from context_history import ContextTracker

def main():
    print("=" * 50)
    print(" Ghost - component test")
    print("=" * 50)
    print()

    capture = ScreenCapture()
    vision = VisionAnalyzer(CLAUDE_API_KEY)
    mock = MockBiometrics()
    bio = BiometricEngine()
    brain = GhostBrain(CLAUDE_API_KEY)
    tracker = ContextTracker()

    # screen capture test
    print ("[1] Capturing screen...")
    try: 
        img, b64 = capture.capture()
        capture.add_to_buffer(b64)
        print(f"  Screenshot captured: {len(b64):,} bytes (base64)")
        print(f" Image size: {img.size}")
        print(f" Buffer size: {len(capture.get_buffer())}")
    except Exception as e: 
        print(f" Error: {e}")
        print(" (This may fail in headless environments)")
        return 
    print()

    # vision analysis test
    if not CLAUDE_API_KEY: 
        print("[2] Skipping vision analysis (no CLAUDE_API_KEY in .env)")
        analysis = {
            "app": "terminal",
            "activity": "testing", 
            "stuck_probability": 0.3,
            "stuck_reason": None,
            "mistake_detected": False, 
            "mistake_description": None,
            "help_opportunity": "Could help with testing",
            "suggested_intervention": {
                "type": "suggestion",
                "message": "Tests are running well!",
                "priority": "low",
                "code_suggestions": None
            },
            "context_summary": "User is running Ghost component tasks"
        }
    else: 
        print("[2] Analyzing with Claude Vision...")
        try: 
            analysis = vision.analyze([b64])
            print(f" App: {analysis.get('app')}")
            print(f" Activity: {analysis.get('activity')}")
            print(f"    Stuck probability: {analysis.get('stuck_probability')}")
            print(f"    Mistake detected: {analysis.get('mistake_detected')}")
            print(f"    Context: {analysis.get('context_summary')}")
        except Exception as e:
            print(f"    ERROR: {e}")
            print("    (Check your CLAUDE_API_KEY)")
            return
    print()


    # each biometric state
    print("[3] Testing each biometric state...")
    print()
    state_names = {1: "DEEP_FOCUS", 2: "STRESSED", 3: "FATIGUED", 4: "RELAXED", 5:"WIRED"}
    for state_num in range (1,6):
        mock.set_state(state_num)
        time.sleep(0.5)
        # get biometric data and classify it into a state
        data = mock.get_data()
        state = bio.classify(data)
        modifiers = bio.get_personality_modifiers(state)
        print(f"  [{state_names[state_num]}] (preset {state_num})")
        print(f"    HR: {data['heartRate']:.0f} | Recovery: {data['recovery']:.0f} | Strain: {data['strain']:.1f}")
        print(f"    HRV: {data.get('hrv', 0):.1f}ms | SpO2: {data.get('spo2', 0):.1f}% | Skin: {data.get('skinTemp', 0):.1f}C")
        print(f"    Classified as: {state}")
        print(f"    Estimated stress: {bio.estimated_stress:.1f}/3.0")
        print(f"    HRV baseline: {bio.hrv_baseline:.0f}ms")
        print(f"    Intervention threshold: {modifiers['intervention_threshold']}")
        print(f"    Capture interval: {modifiers['capture_interval']}s")
        brain.last_intervention_time = 0

        # process thru ghost_brain if we have an API key
        if CLAUDE_API_KEY: 
            result = brain.process(analysis, state, modifiers)
            if result: 
                msg = result["message"][:100]
                if len(result["message"]) > 100:
                   msg += "..."
                print(f" Ghost says: {msg}")
                print(f" Priority: {result['priority']} | Buttons: {result['buttons']}")
            else: 
                print(f" Ghost stays silent (no intervention)")
        else: 
            print(f" (skipping brain test - no API)")
        print()

    # contex tracker 
    print("[4] Context Tracker...")
    #update the tracker with 2 entries to test it 
    tracker.update(analysis, "RELAXED", 0.5)
    tracker.update(analysis, "STRESSED", 2.3)
    
    # get the summary
    summary = tracker.get_summary()
    print(f" Summary: {summary}")

    # get session stats for the dashboard
    stats = tracker.get_session_stats()
    print(f" Session stats: {stats}")

    # chack if the user is rapid switching tabs
    rapid = tracker.get_rapid_switching()
    print(f" Rapid switching detected: {rapid}")

    # stress stats
    stress_stats = tracker.get_stress_stats()
    print(f" Stress stats: {stress_stats}")

    # HRV baseline tracking
    print("[5] Testing HRV baseline tracking...")
    bio.update_baseline(65)
    bio.update_baseline(70)
    bio.update_baseline(55)
    print(f" Baseline after 3 readings: {bio.hrv_baseline:.1f}ms")
    print(f"    History length: {len(bio.hrv_history)}")
    print(f"    (expected: ~63.3ms)")
    print()

    # HRV-based stress classification
    print("[6] Testing HRV-based stress classification...")
    bio.hrv_baseline = 65.0
    #simulate very low HRV (high stress) 
    test_data = {"recovery": 70, "strain": 10, "sleepPerformance": 0.8, "hrv": 30, "heartRate": 85}
    state = bio.classify(test_data)
    print(f" Low HRV (30ms vs 65ms baseline): state = {state}, stress = {bio.estimated_stress:.1f}")
    # simulate normal HRV
    test_data["hrv"] = 62
    state = bio.classify(test_data)
    print(f" Medium HRV: state = {state}, stress = {bio.estimated_stress:.1f}")
    # simulate low HRV 
    test_data["hrv"] = 48
    state = bio.classify(test_data)
    print(f" Mediumm HRV: state = {state}, stress = {bio.estimated_stress:.1f}")
    
    # mock bio transition
    print("[7] Mock biometric smooth transition...")
    mock.set_state(1)
    time.sleep(0.1)
    d1 = mock.get_data()
    time.sleep(1.0)
    d2 = mock.get_data()
    print(f"    Start HR: {d1['heartRate']:.1f} → After 1s: {d2['heartRate']:.1f}")
    print(f"    Start stress: {d1.get('estimated_stress', 0):.2f} → After 1s: {d2.get('estimated_stress', 0):.2f}")
    print(f"    (should be transitioning smoothly)")
    print()
    
    # test 8 - content analyzer, the game mode
    from config import GAME_MODE
    if GAME_MODE and CLAUDE_API_KEY:
        print("[8] Testing ContentAnalyzer (game mode)...")
        from content_analyzer import ContentAnalyzer
        content = ContentAnalyzer(CLAUDE_API_KEY)
        sample_code = """ def calculate_total (items):
        total = 0 
        for item in items: 
            total += item.price
        return total
    result = calculate_total (None)
    print(result)""" 
        try: 
            result = content.analyze("code", sample_code, language = "python", cursor_line = 8)
            print(f" Code analysis:")
            print(f"      Activity: {result.get('activity')}")
            print(f"      Mistake: {result.get('mistake_detected')} — {result.get('mistake_description', 'none')}")
            print(f"      Stuck: {result.get('stuck_probability')}")
            print(f"      Risky: {result.get('risky_action')}")
            print(f"      Context: {result.get('context_summary')}")
        except Exception as e:
            # catch any exception 
            print(f"    Code analysis ERROR: {e}")

        sample_terminal = """$ npm run build
error TS2307: Cannot find module './components/Ghost'
$ npm run build
error TS2307: Cannot find module './components/Ghost'
$ npm run build
error TS2307: Cannot find module './components/Ghost'"""
        try: 
            result = content.analyze("terminal", sample_terminal, shell = "bash")
            print(f" Terminal analysis:")
            print(f" Activity: {result.get('activity')}")
            print(f" Stuck: {result.get('stuck_probability')}")
            print(f"      Suggestion: {result.get('suggested_intervention', {}).get('message', 'none')[:80]}")
        except Exception as e:
            print(f" Terminal analysis ERROR: {e}")
        print()
    else: 
        if GAME_MODE: 
            print("[8] Skipping ContentAnalyzer test (no API key)")
        else: 
            print("[8] Skipping ContentAnalyzer test (desktop, not game mode)")
        print()
    print("=" * 50)
    print("All tests complete")
    print("=" * 50)

if __name__ == "__main__": 
    main()
