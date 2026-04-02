"""Tests for rep counting state machine."""

import time
import pytest
from backend.models import Point
from backend.exercises import EXERCISE_MAP
from backend.session_store import SessionStore
from backend.rep_counter import analyze
from backend.geometry import calculate_angle


def _pt(x: float, y: float, vis: float = 0.99) -> Point:
    return Point(x=x, y=y, z=0.0, visibility=vis)


def _run(state, cfg, key, poses):
    """Feed multiple poses, return last result."""
    res = None
    for s, e, w in poses:
        res = analyze(s, e, w, key, cfg, state)
    return res


# Pre-verified coordinate triplets and their actual angles:
# shoulder(0.5,0.2) elbow(0.5,0.5) wrist(0.5,0.8)  → 180° (arm straight down)
# shoulder(0.5,0.2) elbow(0.5,0.5) wrist(0.55,0.65) → ~154°
# shoulder(0.5,0.2) elbow(0.5,0.5) wrist(0.6,0.55)  → ~123°
# shoulder(0.5,0.2) elbow(0.5,0.5) wrist(0.65,0.45) → ~96°
# shoulder(0.5,0.2) elbow(0.5,0.5) wrist(0.6,0.38)  → ~69°
# shoulder(0.5,0.2) elbow(0.5,0.5) wrist(0.55,0.33) → ~47°
# shoulder(0.5,0.2) elbow(0.5,0.5) wrist(0.52,0.29) → ~26° (arm fully flexed)


class TestBicepCurlCounting:
    def _curl_down_up(self):
        """Return (down_poses, up_poses) for a full curl."""
        # Going down (establishing "down" stage: angle > 160)
        down = [
            (_pt(0.5, 0.2), _pt(0.5, 0.5), _pt(0.5, 0.8)),    # ~180
            (_pt(0.5, 0.2), _pt(0.5, 0.5), _pt(0.5, 0.8)),    # ~180
            (_pt(0.5, 0.2), _pt(0.5, 0.5), _pt(0.5, 0.8)),    # ~180 (fill median buffer)
        ]
        # Going up (angle drops to < 35)
        up = [
            (_pt(0.5, 0.2), _pt(0.5, 0.5), _pt(0.55, 0.65)),  # ~154
            (_pt(0.5, 0.2), _pt(0.5, 0.5), _pt(0.6, 0.55)),   # ~123
            (_pt(0.5, 0.2), _pt(0.5, 0.5), _pt(0.65, 0.45)),  # ~96
            (_pt(0.5, 0.2), _pt(0.5, 0.5), _pt(0.6, 0.38)),   # ~69
            (_pt(0.5, 0.2), _pt(0.5, 0.5), _pt(0.55, 0.33)),  # ~47
            (_pt(0.5, 0.2), _pt(0.5, 0.5), _pt(0.52, 0.29)),  # ~26
            (_pt(0.5, 0.2), _pt(0.5, 0.5), _pt(0.52, 0.29)),  # ~26 (fill median)
            (_pt(0.5, 0.2), _pt(0.5, 0.5), _pt(0.52, 0.29)),  # ~26 (fill median)
        ]
        return down, up

    def test_single_rep(self):
        """Full curl: extended → flexed = 1 rep."""
        store = SessionStore()
        _, state = store.get("test1")
        state["exercise"] = "bicep_curl"
        cfg = EXERCISE_MAP["bicep_curl"]

        down, up = self._curl_down_up()

        _run(state, cfg, "bicep_curl", down)
        assert state["stage"] == "down"

        state["last_rep_time"] = time.time() - 2.0

        res = _run(state, cfg, "bicep_curl", up)
        assert res.reps == 1

    def test_low_visibility_rejected(self):
        store = SessionStore()
        _, state = store.get("test2")
        state["exercise"] = "bicep_curl"
        cfg = EXERCISE_MAP["bicep_curl"]

        res = analyze(
            _pt(0.5, 0.2, 0.3), _pt(0.5, 0.5, 0.99), _pt(0.5, 0.8, 0.99),
            "bicep_curl", cfg, state,
        )
        assert res.reps == 0
        assert "visible" in res.form_feedback.lower() or "frame" in res.form_feedback.lower()

    def test_form_details_after_rep(self):
        store = SessionStore()
        _, state = store.get("test3")
        state["exercise"] = "bicep_curl"
        cfg = EXERCISE_MAP["bicep_curl"]

        down, up = self._curl_down_up()
        _run(state, cfg, "bicep_curl", down)
        state["last_rep_time"] = time.time() - 2.0
        res = _run(state, cfg, "bicep_curl", up)

        assert res.reps == 1
        assert res.form_details is not None
        assert res.form_details["total_scored_reps"] == 1


class TestSquatCounting:
    def test_single_squat(self):
        store = SessionStore()
        _, state = store.get("squat1")
        state["exercise"] = "squats"
        cfg = EXERCISE_MAP["squats"]

        # Standing: hip(0.48,0.35) knee(0.5,0.55) ankle(0.51,0.80) → ~175°
        standing = [
            (_pt(0.48, 0.35), _pt(0.5, 0.55), _pt(0.51, 0.80)),
            (_pt(0.48, 0.35), _pt(0.5, 0.55), _pt(0.51, 0.80)),
            (_pt(0.48, 0.35), _pt(0.5, 0.55), _pt(0.51, 0.80)),
        ]
        _run(state, cfg, "squats", standing)
        assert state["stage"] == "up"

        state["last_rep_time"] = time.time() - 2.0

        # Squat: hip drops toward knee (y increases, x decreases)
        # ankle stays fixed at (0.51, 0.80)
        squat = [
            (_pt(0.46, 0.38), _pt(0.5, 0.55), _pt(0.51, 0.80)),  # ~166
            (_pt(0.44, 0.41), _pt(0.5, 0.55), _pt(0.51, 0.80)),  # ~153
            (_pt(0.42, 0.44), _pt(0.5, 0.55), _pt(0.51, 0.80)),  # ~139
            (_pt(0.40, 0.47), _pt(0.5, 0.55), _pt(0.51, 0.80)),  # ~124
            (_pt(0.38, 0.49), _pt(0.5, 0.55), _pt(0.51, 0.80)),  # ~114
            (_pt(0.37, 0.51), _pt(0.5, 0.55), _pt(0.51, 0.80)),  # ~106
            (_pt(0.35, 0.53), _pt(0.5, 0.55), _pt(0.51, 0.80)),  # ~99
            (_pt(0.30, 0.55), _pt(0.5, 0.55), _pt(0.51, 0.80)),  # ~93
            (_pt(0.28, 0.56), _pt(0.5, 0.55), _pt(0.51, 0.80)),  # ~91
            (_pt(0.28, 0.56), _pt(0.5, 0.55), _pt(0.51, 0.80)),  # fill median
            (_pt(0.28, 0.56), _pt(0.5, 0.55), _pt(0.51, 0.80)),  # fill median
        ]
        res = _run(state, cfg, "squats", squat)
        assert res.reps >= 1
