"""Rep counting state machine for all exercise modes."""

import time
import statistics

from .config import settings
from .models import Point, AnalyzeResponse
from .exercises import ExerciseConfig
from .geometry import calculate_angle, points_visible
from .form_analyzer import FormAnalyzer


form_analyzer = FormAnalyzer()


def _can_count_rep(state: dict) -> bool:
    """Returns True if enough time has passed since the last rep."""
    return (time.time() - state["last_rep_time"]) > settings.min_rep_interval


def _register_rep(state: dict, angle: float) -> float:
    """Register a completed rep. Returns form score for this rep."""
    now = time.time()
    state["counter"] += 1
    state["last_rep_time"] = now
    state["spam_times"].append(now)

    if len(state["spam_times"]) > 5:
        state["spam_times"] = state["spam_times"][-5:]

    # Calculate form score for this rep
    form_score = form_analyzer.score_rep(state)
    state["rep_form_scores"].append(form_score)

    # Reset per-rep tracking
    state["rep_angles"] = []
    state["rep_start_time"] = now
    state["min_angle_in_rep"] = None
    state["max_angle_in_rep"] = None

    return form_score


def _spam_detected(state: dict) -> bool:
    """True if too many reps happened too quickly."""
    times = state["spam_times"]
    if len(times) < settings.spam_count:
        return False
    return (times[-1] - times[-(settings.spam_count)]) < settings.spam_window


def _track_angle(state: dict, angle: float) -> None:
    """Track angle data for form analysis."""
    state["rep_angles"].append(angle)
    if state["rep_start_time"] is None:
        state["rep_start_time"] = time.time()

    if state["min_angle_in_rep"] is None or angle < state["min_angle_in_rep"]:
        state["min_angle_in_rep"] = angle
    if state["max_angle_in_rep"] is None or angle > state["max_angle_in_rep"]:
        state["max_angle_in_rep"] = angle


def analyze(
    shoulder: Point,
    elbow: Point,
    wrist: Point,
    exercise_key: str,
    cfg: ExerciseConfig,
    state: dict,
) -> AnalyzeResponse:
    """Run the full analysis pipeline: visibility → angle → rep counting → form."""

    # Visibility gating
    if not points_visible(shoulder, elbow, wrist):
        return AnalyzeResponse(
            angle=0,
            reps=state["counter"],
            stage=state["stage"],
            form_feedback="Move into frame — ensure joints are visible",
            exercise=exercise_key,
        )

    # Angle calculation
    raw_angle = calculate_angle(shoulder, elbow, wrist)

    # Simple smoothing: average of current + previous angle (1-frame lag)
    if state["prev_angle"] is not None:
        angle = (raw_angle + state["prev_angle"]) * 0.5
    else:
        angle = raw_angle
    state["prev_angle"] = raw_angle

    # Track in buffer for form analysis
    state["angle_buffer"].append(raw_angle)
    if len(state["angle_buffer"]) > 10:
        state["angle_buffer"] = state["angle_buffer"][-10:]

    # Track angle for form analysis
    _track_angle(state, angle)

    mode = cfg.mode
    form_feedback = ""
    last_form_score = None

    # --- Rep counting per exercise mode ---

    if exercise_key == "pushups":
        wrist_y_diff = abs(shoulder.y - wrist.y)
        if wrist_y_diff < 0.05:
            form_feedback = "Get into pushup position — hands on the ground"
        else:
            if angle > cfg.up_angle:
                state["stage"] = "up"
            if angle < cfg.down_angle and state["stage"] == "up":
                state["stage"] = "down"
            if angle > cfg.up_angle and state["stage"] == "down":
                if _can_count_rep(state):
                    if _spam_detected(state):
                        state["stage"] = None
                        form_feedback = "Slow down — control each rep"
                    else:
                        last_form_score = _register_rep(state, angle)
                        state["stage"] = "up"

    elif mode == "squat":
        if angle > cfg.up_angle:
            state["stage"] = "up"
        if angle < cfg.down_angle and state["stage"] == "up":
            state["stage"] = "down"
            if _can_count_rep(state):
                if _spam_detected(state):
                    state["stage"] = None
                    form_feedback = "Slow down — control each rep"
                else:
                    last_form_score = _register_rep(state, angle)

    elif mode == "curl":
        if angle > cfg.down_angle:
            state["stage"] = "down"
        if angle < cfg.up_angle and state["stage"] == "down":
            state["stage"] = "up"
            if _can_count_rep(state):
                if _spam_detected(state):
                    state["stage"] = None
                    form_feedback = "Slow down — control each rep"
                else:
                    last_form_score = _register_rep(state, angle)

    elif mode == "press":
        if angle < cfg.down_angle:
            state["stage"] = "down"
        if angle > cfg.up_angle and state["stage"] == "down":
            state["stage"] = "up"
            if _can_count_rep(state):
                if _spam_detected(state):
                    state["stage"] = None
                    form_feedback = "Slow down — control each rep"
                else:
                    last_form_score = _register_rep(state, angle)

    elif mode == "raise":
        if angle < cfg.down_angle:
            state["stage"] = "down"
        if angle > cfg.up_angle and state["stage"] == "down":
            state["stage"] = "up"
            if _can_count_rep(state):
                if _spam_detected(state):
                    state["stage"] = None
                    form_feedback = "Slow down — control each rep"
                else:
                    last_form_score = _register_rep(state, angle)
        if angle < cfg.down_angle and state["stage"] == "up":
            state["stage"] = "down"

    # Build form details if we have scores
    form_details = None
    if state["rep_form_scores"]:
        scores = state["rep_form_scores"]
        form_details = {
            "last_score": round(scores[-1], 1) if scores else None,
            "avg_score": round(sum(scores) / len(scores), 1),
            "best_score": round(max(scores), 1),
            "total_scored_reps": len(scores),
        }

    # Add form feedback for the rep just completed
    if last_form_score is not None:
        if last_form_score >= 85:
            form_feedback = "Excellent form!"
        elif last_form_score >= 70:
            form_feedback = "Good form — keep it up"
        elif last_form_score >= 50:
            form_feedback = "Decent — try full range of motion"
        else:
            form_feedback = "Focus on form — slow and controlled"

    return AnalyzeResponse(
        angle=round(angle, 1),
        reps=state["counter"],
        stage=state["stage"],
        form_feedback=form_feedback,
        exercise=exercise_key,
        form_score=round(last_form_score, 1) if last_form_score is not None else None,
        form_details=form_details,
    )
