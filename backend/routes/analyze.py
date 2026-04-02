"""Pose analysis endpoint — the core rep-counting + form-scoring route."""

import logging

from fastapi import APIRouter, HTTPException

from ..models import PoseData, AnalyzeResponse
from ..exercises import get_exercise, EXERCISE_MAP
from ..session_store import store
from ..rep_counter import analyze

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_pose(data: PoseData, exercise: str = "bicep_curl"):
    exercise_key = exercise.strip().lower()

    cfg = get_exercise(exercise_key)
    if cfg is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown exercise: '{exercise_key}'. Available: {list(EXERCISE_MAP.keys())}",
        )

    sid, state = store.get(data.session_id)

    logger.debug(
        "exercise=%s stage=%s count=%d sid=%s",
        exercise_key, state["stage"], state["counter"], sid,
    )

    # Reset state when exercise changes
    if state["exercise"] != exercise_key:
        store.reset(sid)
        _, state = store.get(sid)
        state["exercise"] = exercise_key

    return analyze(
        shoulder=data.shoulder,
        elbow=data.elbow,
        wrist=data.wrist,
        exercise_key=exercise_key,
        cfg=cfg,
        state=state,
    )
