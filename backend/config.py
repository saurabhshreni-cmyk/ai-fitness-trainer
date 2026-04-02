"""Application configuration with environment variable support."""

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    # CORS
    allowed_origins: list[str] = field(default_factory=lambda: [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ])

    # Camera / geometry
    camera_width: int = 640
    camera_height: int = 480

    # Pose detection
    visibility_threshold: float = 0.6

    # Rep counting guards
    min_rep_interval: float = 0.6       # seconds between reps (faster response)
    spam_window: float = 2.5            # seconds window for spam detection
    spam_count: int = 4                 # reps in spam_window to trigger
    angle_spike_threshold: float = 100.0 # degrees — very relaxed, only blocks truly wild jumps
    angle_buffer_size: int = 3          # median filter window

    # Form scoring weights (must sum to 1.0)
    form_weight_rom: float = 0.40
    form_weight_tempo: float = 0.20
    form_weight_symmetry: float = 0.15
    form_weight_stability: float = 0.15
    form_weight_consistency: float = 0.10

    # Database
    db_path: str = "fitness_trainer.db"

    # Logging
    log_level: str = "INFO"


def load_settings() -> Settings:
    """Load settings, overriding defaults with environment variables where set."""
    overrides: dict = {}

    if origins := os.environ.get("ALLOWED_ORIGINS"):
        overrides["allowed_origins"] = [o.strip() for o in origins.split(",")]
    if db := os.environ.get("DB_PATH"):
        overrides["db_path"] = db
    if ll := os.environ.get("LOG_LEVEL"):
        overrides["log_level"] = ll

    return Settings(**overrides)


settings = load_settings()
