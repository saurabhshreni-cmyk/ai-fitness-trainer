"""Health and info endpoints."""

from fastapi import APIRouter

from ..exercises import list_exercises

router = APIRouter()


@router.get("/")
def root():
    return {"message": "AI Fitness Trainer Backend Running", "version": "2.0.0"}


@router.get("/exercises")
def get_exercises():
    """List available exercises with metadata."""
    return {"exercises": list_exercises()}
