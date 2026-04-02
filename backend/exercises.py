"""Exercise configuration and metadata."""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ExerciseConfig:
    """Configuration for a single exercise type."""
    down_angle: float
    up_angle: float
    mode: str  # curl, pushup, squat, press, raise
    display_name: str
    # Ideal ROM for form scoring
    ideal_rom: float = 0.0  # computed as abs(up_angle - down_angle)
    # Ideal rep tempo in seconds (eccentric + concentric)
    ideal_tempo: float = 2.5
    # Form-specific thresholds
    min_rom_ratio: float = 0.7  # below this = "half rep"


EXERCISE_MAP: dict[str, ExerciseConfig] = {
    "bicep_curl": ExerciseConfig(
        down_angle=140, up_angle=55, mode="curl",
        display_name="Bicep Curl",
        ideal_rom=85, ideal_tempo=2.5,
    ),
    "pushups": ExerciseConfig(
        up_angle=145, down_angle=100, mode="pushup",
        display_name="Pushups",
        ideal_rom=45, ideal_tempo=3.0,
    ),
    "squats": ExerciseConfig(
        up_angle=155, down_angle=105, mode="squat",
        display_name="Squats",
        ideal_rom=50, ideal_tempo=3.0,
    ),
    "shoulder_press": ExerciseConfig(
        down_angle=85, up_angle=150, mode="press",
        display_name="Shoulder Press",
        ideal_rom=65, ideal_tempo=2.5,
    ),
    "lateral_raise": ExerciseConfig(
        down_angle=25, up_angle=65, mode="raise",
        display_name="Lateral Raise",
        ideal_rom=40, ideal_tempo=3.0,
    ),
    "lunges": ExerciseConfig(
        up_angle=155, down_angle=110, mode="squat",
        display_name="Lunges",
        ideal_rom=45, ideal_tempo=3.0,
    ),
    "front_raise": ExerciseConfig(
        down_angle=30, up_angle=70, mode="raise",
        display_name="Front Raise",
        ideal_rom=40, ideal_tempo=3.0,
    ),
}


def get_exercise(key: str) -> Optional[ExerciseConfig]:
    """Look up exercise config by key (case-insensitive, stripped)."""
    return EXERCISE_MAP.get(key.strip().lower())


def list_exercises() -> list[dict]:
    """Return list of available exercises with metadata."""
    return [
        {"id": k, "name": v.display_name, "mode": v.mode}
        for k, v in EXERCISE_MAP.items()
    ]
