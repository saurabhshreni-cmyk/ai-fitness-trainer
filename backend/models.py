"""Pydantic models for request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional


class Point(BaseModel):
    x: float
    y: float
    z: float = 0.0
    visibility: float = 1.0


class PoseData(BaseModel):
    shoulder: Point
    elbow: Point
    wrist: Point
    session_id: Optional[str] = None
    # Optional extra joints for form analysis
    hip: Optional[Point] = None
    knee: Optional[Point] = None
    ankle: Optional[Point] = None


class AnalyzeResponse(BaseModel):
    angle: float
    reps: int
    stage: Optional[str]
    form_feedback: str = ""
    exercise: str
    form_score: Optional[float] = None
    form_details: Optional[dict] = None


class WorkoutCreate(BaseModel):
    session_id: Optional[str] = None


class SetRecord(BaseModel):
    exercise: str
    reps: int
    avg_form_score: Optional[float] = None
    best_form_score: Optional[float] = None
    avg_rep_speed: Optional[float] = None


class WorkoutSummary(BaseModel):
    id: str
    started_at: str
    ended_at: Optional[str] = None
    duration_seconds: Optional[int] = None
    sets: list[SetRecord] = Field(default_factory=list)
    total_reps: int = 0


class PersonalBest(BaseModel):
    exercise: str
    best_reps: int = 0
    best_form_score: Optional[float] = None
    achieved_at: Optional[str] = None


class ExerciseStats(BaseModel):
    exercise: str
    total_sessions: int = 0
    total_reps: int = 0
    avg_form_score: Optional[float] = None
    best_reps: int = 0
    history: list[dict] = Field(default_factory=list)
