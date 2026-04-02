"""SQLite persistence for workout history and personal bests."""

import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Optional

from .config import settings
from .models import WorkoutSummary, SetRecord, PersonalBest, ExerciseStats


_shared_conn: sqlite3.Connection | None = None
_is_memory: bool = False


def _get_conn() -> sqlite3.Connection:
    global _shared_conn, _is_memory
    _is_memory = settings.db_path == ":memory:"

    if _is_memory:
        if _shared_conn is None:
            _shared_conn = sqlite3.connect(":memory:", check_same_thread=False)
            _shared_conn.row_factory = sqlite3.Row
            _shared_conn.execute("PRAGMA foreign_keys=ON")
        return _shared_conn

    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _close_conn(conn: sqlite3.Connection) -> None:
    """Close connection, but never close shared in-memory connections."""
    if not _is_memory:
        conn.close()


def init_db() -> None:
    """Create tables if they don't exist."""
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS workouts (
            id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            duration_seconds INTEGER
        );

        CREATE TABLE IF NOT EXISTS sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workout_id TEXT NOT NULL REFERENCES workouts(id),
            exercise TEXT NOT NULL,
            reps INTEGER NOT NULL,
            avg_form_score REAL,
            best_form_score REAL,
            avg_rep_speed REAL,
            completed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS personal_bests (
            exercise TEXT PRIMARY KEY,
            best_reps INTEGER DEFAULT 0,
            best_form_score REAL,
            achieved_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_sets_workout ON sets(workout_id);
        CREATE INDEX IF NOT EXISTS idx_sets_exercise ON sets(exercise);
    """)
    conn.commit()
    _close_conn(conn)


# ── Workout lifecycle ────────────────────────────────────────────────────────

def create_workout(workout_id: Optional[str] = None) -> str:
    """Start a new workout session. Returns workout ID."""
    wid = workout_id or str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    conn.execute(
        "INSERT INTO workouts (id, started_at) VALUES (?, ?)",
        (wid, now),
    )
    conn.commit()
    _close_conn(conn)
    return wid


def end_workout(workout_id: str) -> Optional[WorkoutSummary]:
    """Close a workout and compute duration."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM workouts WHERE id = ?", (workout_id,)
    ).fetchone()
    if not row:
        _close_conn(conn)
        return None

    now = datetime.now(timezone.utc)
    started = datetime.fromisoformat(row["started_at"])
    duration = int((now - started).total_seconds())

    conn.execute(
        "UPDATE workouts SET ended_at = ?, duration_seconds = ? WHERE id = ?",
        (now.isoformat(), duration, workout_id),
    )
    conn.commit()

    summary = get_workout(workout_id)
    _close_conn(conn)
    return summary


def save_set(
    workout_id: str,
    exercise: str,
    reps: int,
    avg_form_score: Optional[float] = None,
    best_form_score: Optional[float] = None,
    avg_rep_speed: Optional[float] = None,
) -> None:
    """Record a completed set."""
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    conn.execute(
        """INSERT INTO sets
           (workout_id, exercise, reps, avg_form_score, best_form_score, avg_rep_speed, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (workout_id, exercise, reps, avg_form_score, best_form_score, avg_rep_speed, now),
    )
    conn.commit()

    # Update personal bests
    _update_personal_best(conn, exercise, reps, best_form_score)
    _close_conn(conn)


def _update_personal_best(
    conn: sqlite3.Connection,
    exercise: str,
    reps: int,
    form_score: Optional[float],
) -> None:
    """Update personal bests if this set is a new record."""
    row = conn.execute(
        "SELECT * FROM personal_bests WHERE exercise = ?", (exercise,)
    ).fetchone()
    now = datetime.now(timezone.utc).isoformat()

    if not row:
        conn.execute(
            "INSERT INTO personal_bests (exercise, best_reps, best_form_score, achieved_at) VALUES (?, ?, ?, ?)",
            (exercise, reps, form_score, now),
        )
    else:
        updates = []
        if reps > (row["best_reps"] or 0):
            updates.append(("best_reps", reps))
        if form_score and (not row["best_form_score"] or form_score > row["best_form_score"]):
            updates.append(("best_form_score", form_score))
        if updates:
            for col, val in updates:
                conn.execute(
                    f"UPDATE personal_bests SET {col} = ?, achieved_at = ? WHERE exercise = ?",
                    (val, now, exercise),
                )
    conn.commit()


# ── Queries ──────────────────────────────────────────────────────────────────

def get_workout(workout_id: str) -> Optional[WorkoutSummary]:
    """Get a workout with all its sets."""
    conn = _get_conn()
    w = conn.execute("SELECT * FROM workouts WHERE id = ?", (workout_id,)).fetchone()
    if not w:
        _close_conn(conn)
        return None

    sets_rows = conn.execute(
        "SELECT * FROM sets WHERE workout_id = ? ORDER BY completed_at", (workout_id,)
    ).fetchall()
    _close_conn(conn)

    sets = [
        SetRecord(
            exercise=s["exercise"],
            reps=s["reps"],
            avg_form_score=s["avg_form_score"],
            best_form_score=s["best_form_score"],
            avg_rep_speed=s["avg_rep_speed"],
        )
        for s in sets_rows
    ]
    total = sum(s.reps for s in sets)

    return WorkoutSummary(
        id=w["id"],
        started_at=w["started_at"],
        ended_at=w["ended_at"],
        duration_seconds=w["duration_seconds"],
        sets=sets,
        total_reps=total,
    )


def get_history(limit: int = 30) -> list[WorkoutSummary]:
    """Get recent workout summaries."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id FROM workouts ORDER BY started_at DESC LIMIT ?", (limit,)
    ).fetchall()
    _close_conn(conn)

    return [get_workout(r["id"]) for r in rows if get_workout(r["id"])]


def get_personal_bests() -> list[PersonalBest]:
    """Get all personal bests."""
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM personal_bests ORDER BY exercise").fetchall()
    _close_conn(conn)

    return [
        PersonalBest(
            exercise=r["exercise"],
            best_reps=r["best_reps"] or 0,
            best_form_score=r["best_form_score"],
            achieved_at=r["achieved_at"],
        )
        for r in rows
    ]


def get_exercise_stats(exercise: str) -> ExerciseStats:
    """Get aggregate stats for a specific exercise."""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT s.reps, s.avg_form_score, s.completed_at
           FROM sets s
           WHERE s.exercise = ?
           ORDER BY s.completed_at DESC
           LIMIT 100""",
        (exercise,),
    ).fetchall()
    _close_conn(conn)

    if not rows:
        return ExerciseStats(exercise=exercise)

    total_reps = sum(r["reps"] for r in rows)
    scores = [r["avg_form_score"] for r in rows if r["avg_form_score"] is not None]
    avg_score = sum(scores) / len(scores) if scores else None

    history = [
        {
            "reps": r["reps"],
            "form_score": r["avg_form_score"],
            "date": r["completed_at"],
        }
        for r in rows
    ]

    return ExerciseStats(
        exercise=exercise,
        total_sessions=len(set(r["completed_at"][:10] for r in rows)),
        total_reps=total_reps,
        avg_form_score=round(avg_score, 1) if avg_score else None,
        best_reps=max(r["reps"] for r in rows),
        history=history,
    )
