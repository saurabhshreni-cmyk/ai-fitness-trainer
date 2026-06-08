"""
Backend test suite — FastAPI TestClient against an isolated SQLite DB.

Runs fully offline (no live server). Each run uses a throwaway database file
so tests are deterministic and never touch real workout data.
"""
import os
import pathlib

# Point the app at a disposable DB *before* importing it.
TEST_DB = pathlib.Path(__file__).parent / "_test_fitness.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["DEBUG"] = "true"

import pytest
from fastapi.testclient import TestClient

import backend  # noqa: E402


@pytest.fixture(scope="module")
def client():
    if TEST_DB.exists():
        TEST_DB.unlink()
    with TestClient(backend.app) as c:
        yield c
    if TEST_DB.exists():
        TEST_DB.unlink()


# ── Health & meta ────────────────────────────────────────────────

def test_root(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "version" in res.json()


def test_ping(client):
    res = client.get("/ping")
    assert res.status_code == 200


def test_health_reports_db_connected(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["db"] == "connected"


# ── Pose analysis & rep counting ─────────────────────────────────

def _arm(wrist_y):
    """A pose with the wrist at a given vertical position."""
    return {
        "shoulder": {"x": 0.5, "y": 0.2, "z": 0.0, "visibility": 0.99},
        "elbow": {"x": 0.5, "y": 0.5, "z": 0.0, "visibility": 0.99},
        "wrist": {"x": 0.5, "y": wrist_y, "z": 0.0, "visibility": 0.99},
        "session_id": "pytest-session",
    }


def test_analyze_counts_a_full_rep(client):
    """Feed a gradual curl ramp.

    The engine guards against teleporting landmarks (>60° jump between frames)
    and smooths with a 3-sample median, so a realistic rep is a *sequence* of
    frames: arm extended (large angle) → arm curled (small angle).
    """
    client.post("/reset", params={"session_id": "pytest-session"})

    last = None
    # Extended → curled: step the wrist up from y=0.80 to y=0.25.
    sequence = [0.80, 0.80, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30, 0.25, 0.25, 0.25]
    for wrist_y in sequence:
        last = client.post("/analyze", json=_arm(wrist_y), params={"exercise": "bicep_curl"})
        assert last.status_code == 200

    assert last.json()["reps"] == 1


def test_analyze_rejects_low_visibility(client):
    bad = _arm(0.8)
    bad["wrist"]["visibility"] = 0.1
    res = client.post("/analyze", json=bad, params={"exercise": "bicep_curl"})
    assert res.status_code == 200  # graceful, not a crash


# ── Session CRUD ─────────────────────────────────────────────────

SAMPLE_SESSION = {
    "exercise": "bicep_curl",
    "sets": 3,
    "reps": 30,
    "duration_seconds": 240,
    "avg_form_score": 88.5,
    "best_form_score": 97.0,
    "rep_log": [{"rep_number": 1, "form_score": 90.0, "range_of_motion": 120.0}],
    "summary": {"note": "test"},
}


def test_session_crud_lifecycle(client):
    # Create
    created = client.post("/sessions", json=SAMPLE_SESSION)
    assert created.status_code == 201
    sid = created.json()["id"]

    # List
    listed = client.get("/sessions")
    assert listed.status_code == 200
    assert any(s["id"] == sid for s in listed.json()["sessions"])

    # Get single (with rep log)
    single = client.get(f"/sessions/{sid}")
    assert single.status_code == 200
    assert single.json()["reps"] == 30

    # Delete
    deleted = client.delete(f"/sessions/{sid}")
    assert deleted.status_code == 204

    # 404 after delete
    assert client.get(f"/sessions/{sid}").status_code == 404


def test_create_session_rejects_empty_exercise(client):
    bad = {**SAMPLE_SESSION, "exercise": "   "}
    res = client.post("/sessions", json=bad)
    assert res.status_code == 422


def test_delete_all_requires_confirmation_header(client):
    client.post("/sessions", json=SAMPLE_SESSION)
    # Without the header → refused.
    assert client.delete("/sessions").status_code in (400, 403, 428)
    # With the header → wipes everything.
    ok = client.delete("/sessions", headers={"X-Confirm-Delete": "true"})
    assert ok.status_code == 204


# ── Analytics & export ───────────────────────────────────────────

def test_analytics_summary(client):
    client.post("/sessions", json=SAMPLE_SESSION)
    res = client.get("/analytics/summary")
    assert res.status_code == 200
    assert "totalSessions" in res.json()


def test_export_csv_and_json(client):
    sid = client.post("/sessions", json=SAMPLE_SESSION).json()["id"]

    csv_res = client.get("/export/csv", params={"session_id": sid})
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]

    json_res = client.get("/export/json", params={"session_id": sid})
    assert json_res.status_code == 200


def test_export_all_returns_zip(client):
    res = client.get("/export/all")
    assert res.status_code == 200
    assert "zip" in res.headers["content-type"]
