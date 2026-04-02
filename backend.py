from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import math
import time
import statistics
import uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────
# Models
# ─────────────────────────────────────────

class Point(BaseModel):
    x: float
    y: float
    z: float = 0.0
    visibility: float = 1.0

class PoseData(BaseModel):
    shoulder: Point   # mapped from joint A
    elbow:    Point   # mapped from joint B
    wrist:    Point   # mapped from joint C
    session_id: Optional[str] = None

# ─────────────────────────────────────────
# Exercise configuration
# Keys MUST match exactly what the frontend sends
# ─────────────────────────────────────────

EXERCISE_MAP = {
    "bicep_curl":     {"down_angle": 160, "up_angle":  35, "mode": "curl"},
    "pushups":        {"up_angle":   155, "down_angle": 90, "mode": "pushup"},
    "squats":         {"up_angle":   165, "down_angle": 95, "mode": "squat"},
    "shoulder_press": {"down_angle":  80, "up_angle":  165, "mode": "press"},
    "lateral_raise":  {"down_angle":  20, "up_angle":   75, "mode": "raise"},
    "lunges":         {"up_angle":   165, "down_angle": 100, "mode": "squat"},
    "front_raise":    {"down_angle":  25, "up_angle":   80, "mode": "raise"},
}

VISIBILITY_THRESHOLD = 0.6

# ─────────────────────────────────────────
# Per-session state
# ─────────────────────────────────────────

def new_session() -> dict:
    return {
        "counter":       0,
        "stage":         None,
        "exercise":      None,
        "angle_buffer":  [],
        "last_rep_time": 0.0,
        "prev_angle":    None,
        "spam_times":    [],   # track rapid rep timestamps for spam guard
    }

SESSIONS: dict[str, dict] = {}

def get_session(sid: Optional[str]) -> dict:
    if not sid:
        sid = str(uuid.uuid4())
    if sid not in SESSIONS:
        SESSIONS[sid] = new_session()
    return SESSIONS[sid]

# ─────────────────────────────────────────
# Geometry
# ─────────────────────────────────────────

def calculate_angle(a: Point, b: Point, c: Point) -> float:
    """Angle at B (in degrees) using pixel-space vectors.
    Inputs are normalised [0,1]; we scale to 640×480 for accurate angles."""
    W, H = 640, 480
    ax, ay = a.x * W, a.y * H
    bx, by = b.x * W, b.y * H
    cx, cy = c.x * W, c.y * H

    ba = [ax - bx, ay - by]
    bc = [cx - bx, cy - by]

    dot    = ba[0] * bc[0] + ba[1] * bc[1]
    mag_ba = math.sqrt(ba[0] ** 2 + ba[1] ** 2)
    mag_bc = math.sqrt(bc[0] ** 2 + bc[1] ** 2)

    if mag_ba * mag_bc == 0:
        return 0.0

    cos_a = max(min(dot / (mag_ba * mag_bc), 1.0), -1.0)
    return math.degrees(math.acos(cos_a))

# ─────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "AI Fitness Trainer Backend Running"}


@app.post("/analyze")
def analyze_pose(data: PoseData, exercise: str = "bicep_curl"):
    exercise_key = exercise.strip().lower()

    STATE = get_session(data.session_id)

    print(f"[DEBUG] exercise_key='{exercise_key}' stage='{STATE['stage']}' count={STATE['counter']}")

    # ── Hard guard: unknown exercise ──────────────────────────────
    if exercise_key not in EXERCISE_MAP:
        raise HTTPException(status_code=400, detail=f"Unknown exercise: '{exercise_key}'")

    # ── Reset state when exercise changes ─────────────────────────
    if STATE["exercise"] != exercise_key:
        STATE["counter"]      = 0
        STATE["stage"]        = None
        STATE["angle_buffer"] = []
        STATE["prev_angle"]   = None
        STATE["last_rep_time"]= 0.0
        STATE["spam_times"]   = []
        STATE["exercise"]     = exercise_key

    # ── Confidence gating ─────────────────────────────────────────
    if (data.shoulder.visibility < VISIBILITY_THRESHOLD or
            data.elbow.visibility   < VISIBILITY_THRESHOLD or
            data.wrist.visibility   < VISIBILITY_THRESHOLD):
        return {
            "angle":         0,
            "reps":          STATE["counter"],
            "stage":         STATE["stage"],
            "form_feedback": "Move into frame",
            "exercise":      exercise_key,
        }

    # ── Angle calculation ─────────────────────────────────────────
    raw_angle = calculate_angle(data.shoulder, data.elbow, data.wrist)

    # ── Lag spike / angle velocity guard ─────────────────────────
    if STATE["prev_angle"] is not None:
        delta = abs(raw_angle - STATE["prev_angle"])
        if delta > 60:
            STATE["prev_angle"] = raw_angle
            return {
                "angle":         round(raw_angle, 1),
                "reps":          STATE["counter"],
                "stage":         STATE["stage"],
                "form_feedback": "Stabilizing...",
                "exercise":      exercise_key,
            }
    STATE["prev_angle"] = raw_angle

    # ── Angle smoothing buffer (median of last 3) ─────────────────
    STATE["angle_buffer"].append(raw_angle)
    if len(STATE["angle_buffer"]) > 3:
        STATE["angle_buffer"] = STATE["angle_buffer"][-3:]
    angle = statistics.median(STATE["angle_buffer"])

    cfg  = EXERCISE_MAP[exercise_key]
    mode = cfg["mode"]
    form_feedback = ""

    # ── Rep counting logic ────────────────────────────────────────

    def can_count_rep() -> bool:
        """Returns True if enough time has passed since last rep."""
        return (time.time() - STATE["last_rep_time"]) > 0.8

    def register_rep():
        now = time.time()
        STATE["counter"]       += 1
        STATE["last_rep_time"]  = now
        STATE["spam_times"].append(now)
        # Keep only last 5 rep times for spam check
        if len(STATE["spam_times"]) > 5:
            STATE["spam_times"] = STATE["spam_times"][-5:]

    def spam_detected() -> bool:
        """True if 3+ reps happened within the last 3 consecutive seconds."""
        times = STATE["spam_times"]
        if len(times) < 3:
            return False
        return (times[-1] - times[-3]) < 3.0

    if exercise_key == "pushups":
        # Pushup wrist sanity check
        wrist_y_diff = abs(data.shoulder.y - data.wrist.y)
        if wrist_y_diff < 0.05:
            form_feedback = "Get into pushup position"
            # Still allow angle to be returned for display
        else:
            # INVERTED logic: start UP (arms extended), go DOWN (bent), return UP = rep
            if angle > cfg["up_angle"]:
                STATE["stage"] = "up"
            if angle < cfg["down_angle"] and STATE["stage"] == "up":
                STATE["stage"] = "down"
            if angle > cfg["up_angle"] and STATE["stage"] == "down":
                if can_count_rep():
                    if spam_detected():
                        STATE["stage"] = None
                        form_feedback  = "Slow down — checking form"
                    else:
                        register_rep()
                        STATE["stage"] = "up"

    elif mode in ("squat",):
        # squats / lunges: standing = up (>up_angle), bent = down (<down_angle)
        if angle > cfg["up_angle"]:
            STATE["stage"] = "up"
        if angle < cfg["down_angle"] and STATE["stage"] == "up":
            STATE["stage"] = "down"
            if can_count_rep():
                if spam_detected():
                    STATE["stage"] = None
                    form_feedback  = "Slow down — checking form"
                else:
                    register_rep()

    elif mode == "curl":
        # bicep_curl: arm down = down (>down_angle), arm up = up (<up_angle)
        if angle > cfg["down_angle"]:
            STATE["stage"] = "down"
        if angle < cfg["up_angle"] and STATE["stage"] == "down":
            STATE["stage"] = "up"
            if can_count_rep():
                if spam_detected():
                    STATE["stage"] = None
                    form_feedback  = "Slow down — checking form"
                else:
                    register_rep()

    elif mode == "press":
        # shoulder_press: arms low = down (<down_angle), overhead = up (>up_angle)
        if angle < cfg["down_angle"]:
            STATE["stage"] = "down"
        if angle > cfg["up_angle"] and STATE["stage"] == "down":
            STATE["stage"] = "up"
            if can_count_rep():
                if spam_detected():
                    STATE["stage"] = None
                    form_feedback  = "Slow down — checking form"
                else:
                    register_rep()

    elif mode == "raise":
        # lateral_raise / front_raise: arm down = down (<down_angle), raised = up (>up_angle)
        if angle < cfg["down_angle"]:
            STATE["stage"] = "down"
        if angle > cfg["up_angle"] and STATE["stage"] == "down":
            STATE["stage"] = "up"
            if can_count_rep():
                if spam_detected():
                    STATE["stage"] = None
                    form_feedback  = "Slow down — checking form"
                else:
                    register_rep()
        if angle < cfg["down_angle"] and STATE["stage"] == "up":
            STATE["stage"] = "down"

    return {
        "angle":         round(angle, 1),
        "reps":          STATE["counter"],
        "stage":         STATE["stage"],
        "form_feedback": form_feedback,
        "exercise":      exercise_key,
    }


@app.post("/reset")
def reset_counter(session_id: Optional[str] = None):
    if session_id and session_id in SESSIONS:
        s = SESSIONS[session_id]
        s["counter"]      = 0
        s["stage"]        = None
        s["angle_buffer"] = []
        s["prev_angle"]   = None
        s["last_rep_time"]= 0.0
        s["spam_times"]   = []
    return {"message": "Counter reset", "count": 0}
