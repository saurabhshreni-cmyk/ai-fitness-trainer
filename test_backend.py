import requests
import time

# URL of the backend
BASE_URL = "http://127.0.0.1:8000"

def test_health():
    try:
        res = requests.get(f"{BASE_URL}/")
        print(f"Health Check: {res.status_code} - {res.json()}")
    except Exception as e:
        print(f"Health Check Failed: {e}")

def test_analyze():
    print("\n--- Testing Rep Counting Logic ---")
    
    # Reset first
    requests.post(f"{BASE_URL}/reset")
    
    # Simulate a full rep
    
    # 1. Arm Down (Extension ~ 170 deg)
    initial_pose = {
        "shoulder": {"x": 0.5, "y": 0.2, "z": 0.0, "visibility": 0.99},
        "elbow":    {"x": 0.5, "y": 0.5, "z": 0.0, "visibility": 0.99},
        "wrist":    {"x": 0.5, "y": 0.8, "z": 0.0, "visibility": 0.99}  # Straight down
    }
    
    # 2. Arm Up (Flexion ~ 30 deg)
    flexed_pose = {
        "shoulder": {"x": 0.5, "y": 0.2, "z": 0.0, "visibility": 0.99},
        "elbow":    {"x": 0.5, "y": 0.5, "z": 0.0, "visibility": 0.99},
        "wrist":    {"x": 0.5, "y": 0.3, "z": 0.0, "visibility": 0.99}  # Folded up close to shoulder
    }
    
    # Send DOWN
    res = requests.post(f"{BASE_URL}/analyze", json=initial_pose)
    print(f"Step 1 (Down): {res.json()}")
    
    time.sleep(0.5)
    
    # Send UP
    res = requests.post(f"{BASE_URL}/analyze", json=flexed_pose)
    print(f"Step 2 (Up): {res.json()}")
    
    # Verify rep count
    if res.json()['reps'] == 1:
        print("✅ Rep counting success!")
    else:
        print("❌ Rep counting failed!")

if __name__ == "__main__":
    test_health()
    test_analyze()
