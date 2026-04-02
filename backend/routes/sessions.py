"""Session management, workout history, and stats endpoints."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException

from ..session_store import store
from .. import database as db
from ..models import WorkoutSummary, PersonalBest, ExerciseStats, SetRecord

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Session control ──────────────────────────────────────────────────────────

@router.post("/reset")
def reset_counter(session_id: Optional[str] = None):
    """Reset the rep counter for a session."""
    if session_id:
        store.reset(session_id)
    return {"message": "Counter reset", "count": 0}


# ── Workout lifecycle ────────────────────────────────────────────────────────

@router.post("/workout/start")
def start_workout(session_id: Optional[str] = None):
    """Start a new workout session with persistence."""
    wid = db.create_workout(session_id)
    return {"workout_id": wid, "message": "Workout started"}


@router.post("/workout/{workout_id}/set")
def record_set(workout_id: str, data: SetRecord):
    """Record a completed set in a workout."""
    db.save_set(
        workout_id=workout_id,
        exercise=data.exercise,
        reps=data.reps,
        avg_form_score=data.avg_form_score,
        best_form_score=data.best_form_score,
        avg_rep_speed=data.avg_rep_speed,
    )
    return {"message": "Set recorded"}


@router.post("/workout/{workout_id}/end")
def end_workout(workout_id: str):
    """End a workout session."""
    summary = db.end_workout(workout_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Workout not found")
    return summary


# ── History & stats ──────────────────────────────────────────────────────────

@router.get("/history")
def get_history(limit: int = 30):
    """Get recent workout summaries."""
    return {"workouts": db.get_history(limit)}


@router.get("/history/{workout_id}")
def get_workout_detail(workout_id: str):
    """Get detailed workout with all sets."""
    workout = db.get_workout(workout_id)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    return workout


@router.get("/personal-bests")
def get_personal_bests():
    """Get all personal best records."""
    return {"personal_bests": db.get_personal_bests()}


@router.get("/stats/{exercise}")
def get_exercise_stats(exercise: str):
    """Get aggregate stats for a specific exercise."""
    return db.get_exercise_stats(exercise.strip().lower())
