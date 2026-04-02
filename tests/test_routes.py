"""Integration tests for API endpoints."""

import pytest


class TestHealthEndpoints:
    def test_root(self, client):
        res = client.get("/")
        assert res.status_code == 200
        assert "version" in res.json()

    def test_exercises_list(self, client):
        res = client.get("/exercises")
        assert res.status_code == 200
        exercises = res.json()["exercises"]
        assert len(exercises) == 7
        ids = [e["id"] for e in exercises]
        assert "bicep_curl" in ids
        assert "squats" in ids


class TestAnalyzeEndpoint:
    def test_valid_pose(self, client):
        res = client.post("/analyze?exercise=bicep_curl", json={
            "shoulder": {"x": 0.5, "y": 0.2, "z": 0, "visibility": 0.99},
            "elbow":    {"x": 0.5, "y": 0.5, "z": 0, "visibility": 0.99},
            "wrist":    {"x": 0.5, "y": 0.8, "z": 0, "visibility": 0.99},
        })
        assert res.status_code == 200
        data = res.json()
        assert "angle" in data
        assert "reps" in data
        assert data["exercise"] == "bicep_curl"

    def test_unknown_exercise(self, client):
        res = client.post("/analyze?exercise=unknown_exercise", json={
            "shoulder": {"x": 0.5, "y": 0.2, "z": 0, "visibility": 0.99},
            "elbow":    {"x": 0.5, "y": 0.5, "z": 0, "visibility": 0.99},
            "wrist":    {"x": 0.5, "y": 0.8, "z": 0, "visibility": 0.99},
        })
        assert res.status_code == 400

    def test_low_visibility(self, client):
        res = client.post("/analyze?exercise=bicep_curl", json={
            "shoulder": {"x": 0.5, "y": 0.2, "z": 0, "visibility": 0.1},
            "elbow":    {"x": 0.5, "y": 0.5, "z": 0, "visibility": 0.99},
            "wrist":    {"x": 0.5, "y": 0.8, "z": 0, "visibility": 0.99},
        })
        assert res.status_code == 200
        assert res.json()["reps"] == 0


class TestResetEndpoint:
    def test_reset(self, client):
        res = client.post("/reset?session_id=test123")
        assert res.status_code == 200
        assert res.json()["count"] == 0


class TestWorkoutEndpoints:
    def test_workout_lifecycle(self, client):
        # Start
        res = client.post("/workout/start")
        assert res.status_code == 200
        wid = res.json()["workout_id"]

        # Record set
        res = client.post(f"/workout/{wid}/set", json={
            "exercise": "bicep_curl",
            "reps": 12,
            "avg_form_score": 85.0,
        })
        assert res.status_code == 200

        # End
        res = client.post(f"/workout/{wid}/end")
        assert res.status_code == 200
        assert res.json()["total_reps"] == 12

    def test_history(self, client):
        # Create a workout first
        res = client.post("/workout/start")
        wid = res.json()["workout_id"]
        client.post(f"/workout/{wid}/set", json={
            "exercise": "squats", "reps": 10,
        })
        client.post(f"/workout/{wid}/end")

        # Fetch history
        res = client.get("/history")
        assert res.status_code == 200
        assert len(res.json()["workouts"]) >= 1

    def test_personal_bests(self, client):
        # Create workout with a set
        res = client.post("/workout/start")
        wid = res.json()["workout_id"]
        client.post(f"/workout/{wid}/set", json={
            "exercise": "bicep_curl", "reps": 20, "best_form_score": 92.0,
        })
        client.post(f"/workout/{wid}/end")

        res = client.get("/personal-bests")
        assert res.status_code == 200
        pbs = res.json()["personal_bests"]
        assert any(pb["exercise"] == "bicep_curl" and pb["best_reps"] == 20 for pb in pbs)
