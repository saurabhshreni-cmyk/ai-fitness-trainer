import cv2
import mediapipe as mp
import numpy as np
from collections import deque
import time

# ---------------- Angle Calculation ----------------
def calculate_angle(a, b, c):
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)

    ba = a - b
    bc = c - b

    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc))
    angle = np.arccos(np.clip(cosine_angle, -1.0, 1.0))

    return np.degrees(angle)
# --------------------------------------------------

mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils

pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=1,
    enable_segmentation=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

cap = cv2.VideoCapture(0)

# ---------------- Exercise Configuration ----------------
EXERCISES = {
    "bicep": {
        "name": "Bicep Curl",
        "joints": (
            mp_pose.PoseLandmark.LEFT_SHOULDER,
            mp_pose.PoseLandmark.LEFT_ELBOW,
            mp_pose.PoseLandmark.LEFT_WRIST
        ),
        "down": 60,
        "up": 160,
        "met": 3.5
    },
    "squat": {
        "name": "Squat",
        "joints": (
            mp_pose.PoseLandmark.LEFT_HIP,
            mp_pose.PoseLandmark.LEFT_KNEE,
            mp_pose.PoseLandmark.LEFT_ANKLE
        ),
        "down": 90,
        "up": 170,
        "met": 5.0
    },
    "pushup": {
        "name": "Push-up",
        "joints": (
            mp_pose.PoseLandmark.LEFT_SHOULDER,
            mp_pose.PoseLandmark.LEFT_ELBOW,
            mp_pose.PoseLandmark.LEFT_WRIST
        ),
        "down": 75,
        "up": 160,
        "met": 8.0
    }
}
# ------------------------------------------------------

# -------- Session Variables --------
exercise_key = "bicep"
counter = 0
stage = None
feedback = ""
angle_history = deque(maxlen=5)

last_rep_time = 0
REP_COOLDOWN = 0.6

start_time = time.time()
last_set_time = start_time
SET_GAP = 5          # seconds of rest → new set
sets = 1
total_reps = 0

USER_WEIGHT_KG = 70
# ----------------------------------

while True:
    ret, frame = cap.read()
    if not ret:
        break

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = pose.process(rgb)

    elapsed_time = time.time() - start_time

    if results.pose_landmarks:
        lm = results.pose_landmarks.landmark
        cfg = EXERCISES[exercise_key]
        j1, j2, j3 = cfg["joints"]

        a = [lm[j1].x, lm[j1].y]
        b = [lm[j2].x, lm[j2].y]
        c = [lm[j3].x, lm[j3].y]

        raw_angle = calculate_angle(a, b, c)
        angle_history.append(raw_angle)
        angle = int(sum(angle_history) / len(angle_history))

        current_time = time.time()

        # -------- Rep Counting --------
        if angle < cfg["down"]:
            stage = "down"

        if angle > cfg["up"] and stage == "down":
            if current_time - last_rep_time > REP_COOLDOWN:
                stage = "up"
                counter += 1
                total_reps += 1
                last_rep_time = current_time
                feedback = "Good rep"

                # Detect new set
                if current_time - last_set_time > SET_GAP:
                    sets += 1
                last_set_time = current_time
        # ------------------------------

        # -------- Feedback --------
        if exercise_key == "squat":
            feedback = "Go lower" if angle > 100 else "Good depth"
        elif exercise_key == "bicep":
            feedback = "Extend fully" if angle > 150 else "Good rep"
        elif exercise_key == "pushup":
            feedback = "Go lower" if angle > 150 else "Good push-up"
        # --------------------------

        # -------- Display --------
        cv2.putText(frame, f"Exercise: {cfg['name']}", (30, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 0), 2)

        cv2.putText(frame, f"Reps: {counter}", (30, 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)

        cv2.putText(frame, f"Sets: {sets}", (30, 120),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)

        cv2.putText(frame, f"Time: {int(elapsed_time)}s", (30, 160),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)

        cv2.putText(frame, f"Feedback: {feedback}", (30, 200),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)

        mp_drawing.draw_landmarks(
            frame, results.pose_landmarks, mp_pose.POSE_CONNECTIONS
        )

    cv2.imshow("AI Fitness Trainer | Step 9", frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('q') or key == 27:
        break
    elif key == ord('1'):
        exercise_key, counter, stage = "bicep", 0, None
        angle_history.clear()
    elif key == ord('2'):
        exercise_key, counter, stage = "squat", 0, None
        angle_history.clear()
    elif key == ord('3'):
        exercise_key, counter, stage = "pushup", 0, None
        angle_history.clear()

cap.release()
cv2.destroyAllWindows()

# -------- Session Summary --------
duration_hr = elapsed_time / 3600
met = EXERCISES[exercise_key]["met"]
calories = met * USER_WEIGHT_KG * duration_hr

print("\n===== WORKOUT SUMMARY =====")
print(f"Exercise: {EXERCISES[exercise_key]['name']}")
print(f"Total Reps: {total_reps}")
print(f"Total Sets: {sets}")
print(f"Duration: {int(elapsed_time)} seconds")
print(f"Calories Burned (est): {calories:.2f} kcal")
print("===========================\n")


##Key	Exercise
# 1 	Bicep Curl
# 2	    Squat
# 3	    Push-up
# 4	    Lateral Raise
# 5	    Shoulder Press
# 6	    Lunge
# 7	    Front Raise
# 8	    Mountain Climber
# 9	    Plank Shoulder Tap
# Q	    Quit