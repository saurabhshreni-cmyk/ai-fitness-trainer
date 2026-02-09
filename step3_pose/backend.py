from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np
import time

app = FastAPI()

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

# -------- In-memory workout state (demo) --------
STATE = {
    "counter": 0,
    "stage": None,
    "last_rep_time": 0
}

REP_COOLDOWN = 0.6
# -----------------------------------------------

class PoseData(BaseModel):
    shoulder: list
    elbow: list
    wrist: list
    exercise: str


@app.post("/analyze")
def analyze_pose(data: PoseData):
    angle = calculate_angle(data.shoulder, data.elbow, data.wrist)
    current_time = time.time()

    down, up = 60, 160  # default (bicep)

    if data.exercise == "pushup":
        down, up = 75, 160
    elif data.exercise == "squat":
        return {"message": "Squat needs knee joints"}

    if angle < down:
        STATE["stage"] = "down"

    if angle > up and STATE["stage"] == "down":
        if current_time - STATE["last_rep_time"] > REP_COOLDOWN:
            STATE["counter"] += 1
            STATE["stage"] = "up"
            STATE["last_rep_time"] = current_time

    return {
        "angle": round(angle, 2),
        "reps": STATE["counter"]
    }
