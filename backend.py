"""
AI Fitness Trainer — FastAPI Backend
Sections: Config → DB → CORS → Pose Engine → Session CRUD → Analytics → Export → Error Handlers
"""
import csv
import io
import json
import math
import os
import statistics
import time
import uuid
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import (Boolean, Column, DateTime, Float, Integer, String,
                        Text, create_engine, func, select)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

load_dotenv()

# ─────────────────────────────────────────
# Config
# ─────────────────────────────────────────

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./fitness.db")
FRONTEND_URL = os.getenv("FRONTEND_URL", "*")
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")
DEBUG = os.getenv("DEBUG", "true").lower() == "true"
START_TIME = time.time()

# ─────────────────────────────────────────
# Database
# ─────────────────────────────────────────

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String, unique=True, index=True, default=lambda: str(uuid.uuid4()))
    exercise = Column(String, nullable=False, index=True)
    sets = Column(Integer, default=0)
    reps = Column(Integer, default=0)
    duration_seconds = Column(Integer, default=0)
    avg_form_score = Column(Float, default=0.0)
    best_form_score = Column(Float, default=0.0)
    fatigue_onset_rep = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    rep_log_json = Column(Text, default="[]")
    summary_json = Column(Text, default="{}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ DB ready")
    except Exception as exc:
        print(f"❌ DB init failed: {exc}")
        raise


# ─────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────

@asynccontextmanager
async def lifespan(application: FastAPI):
    init_db()
    origins = [FRONTEND_URL] if FRONTEND_URL != "*" else ["*"]
    print(f"🌐 CORS origins: {origins}")
    print(f"🚀 Server starting — version {APP_VERSION}")
    yield
    print("👋 Shutdown complete")


# ─────────────────────────────────────────
# Rate limiting
# ─────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

# ─────────────────────────────────────────
# App
# ─────────────────────────────────────────

app = FastAPI(title="AI Fitness Trainer API", version=APP_VERSION, lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_cors_origins = [FRONTEND_URL] if FRONTEND_URL != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=FRONTEND_URL != "*",
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-Confirm-Delete"],
)


# ─────────────────────────────────────────
# Request size limit
# ─────────────────────────────────────────

@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > 1_048_576:
        return JSONResponse(status_code=413, content={"detail": "Request too large (max 1 MB)"})
    return await call_next(request)


# ─────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────

class PointSchema(BaseModel):
    x: float
    y: float
    z: float = 0.0
    visibility: float = 1.0


class PoseDataSchema(BaseModel):
    shoulder: PointSchema
    elbow: PointSchema
    wrist: PointSchema
    session_id: Optional[str] = None


class RepLogEntry(BaseModel):
    rep_number: int = 0
    set_number: int = 0
    form_score: float = Field(default=100.0, ge=0, le=100)
    peak_angle: float = Field(default=0.0, ge=0, le=360)
    min_angle: float = Field(default=0.0, ge=0, le=360)
    range_of_motion: float = Field(default=0.0, ge=0, le=360)
    tempo_seconds: float = Field(default=0.0, ge=0)
    avg_velocity: float = Field(default=0.0, ge=0)
    fatigue_flag: bool = False
    symmetry_score: float = Field(default=100.0, ge=0, le=100)
    partial_rep: bool = False


class SessionCreateSchema(BaseModel):
    exercise: str
    sets: int = Field(default=0, ge=0, le=9999)
    reps: int = Field(default=0, ge=0, le=9999)
    duration_seconds: int = Field(default=0, ge=0)
    avg_form_score: float = Field(default=0.0, ge=0, le=100)
    best_form_score: float = Field(default=0.0, ge=0, le=100)
    fatigue_onset_rep: Optional[int] = None
    rep_log: List[RepLogEntry] = []
    summary: dict = {}

    @field_validator("exercise")
    @classmethod
    def exercise_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("exercise cannot be empty")
        return v[:64]


# ─────────────────────────────────────────
# Pose engine — in-memory state
# ─────────────────────────────────────────

EXERCISE_MAP_POSE = {
    "bicep_curl":       {"down_angle": 160, "up_angle":  35, "mode": "curl"},
    "pushups":          {"up_angle":   155, "down_angle": 90, "mode": "pushup"},
    "squats":           {"up_angle":   165, "down_angle": 95, "mode": "squat"},
    "shoulder_press":   {"down_angle":  80, "up_angle":  165, "mode": "press"},
    "lateral_raise":    {"down_angle":  20, "up_angle":   75, "mode": "raise"},
    "lunges":           {"up_angle":   165, "down_angle": 100, "mode": "squat"},
    "front_raise":      {"down_angle":  25, "up_angle":   80, "mode": "raise"},
    "deadlift":         {"down_angle":  60, "up_angle":  165, "mode": "hinge"},
    "tricep_extension": {"down_angle":  60, "up_angle":  155, "mode": "press"},
}

VISIBILITY_THRESHOLD = 0.6
SESSIONS_MEMORY: dict[str, dict] = {}


def new_session_state() -> dict:
    return {
        "counter": 0, "stage": None, "exercise": None,
        "angle_buffer": [], "last_rep_time": 0.0,
        "prev_angle": None, "spam_times": [],
    }


def get_session_state(sid: Optional[str]) -> dict:
    if not sid:
        sid = str(uuid.uuid4())
    if sid not in SESSIONS_MEMORY:
        SESSIONS_MEMORY[sid] = new_session_state()
    return SESSIONS_MEMORY[sid]


def calculate_angle(a: PointSchema, b: PointSchema, c: PointSchema) -> float:
    W, H = 640, 480
    ba = [a.x * W - b.x * W, a.y * H - b.y * H]
    bc = [c.x * W - b.x * W, c.y * H - b.y * H]
    dot = ba[0] * bc[0] + ba[1] * bc[1]
    mag_ba = math.sqrt(ba[0] ** 2 + ba[1] ** 2)
    mag_bc = math.sqrt(bc[0] ** 2 + bc[1] ** 2)
    if mag_ba * mag_bc == 0:
        return 0.0
    return math.degrees(math.acos(max(min(dot / (mag_ba * mag_bc), 1.0), -1.0)))


# ─────────────────────────────────────────
# Exception handlers
# ─────────────────────────────────────────

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    if DEBUG:
        import traceback
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc), "trace": traceback.format_exc()},
        )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ─────────────────────────────────────────
# Health & Meta
# ─────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "AI Fitness Trainer API", "version": APP_VERSION}


@app.get("/ping")
@limiter.limit("300/minute")
def ping(request: Request):
    return {"pong": True}


@app.get("/health")
@limiter.limit("120/minute")
def health(request: Request, db: Session = Depends(get_db)):
    db_status = "connected"
    try:
        db.execute(select(func.count()).select_from(SessionModel))
    except Exception:
        db_status = "error"
    return {
        "status": "ok",
        "version": APP_VERSION,
        "db": db_status,
        "uptime_seconds": round(time.time() - START_TIME, 1),
    }


# ─────────────────────────────────────────
# Pose analysis (stateless, in-memory)
# ─────────────────────────────────────────

@app.post("/analyze")
@limiter.limit("300/minute")
def analyze_pose(request: Request, data: PoseDataSchema, exercise: str = "bicep_curl"):
    exercise_key = exercise.strip().lower()
    STATE = get_session_state(data.session_id)

    if exercise_key not in EXERCISE_MAP_POSE:
        raise HTTPException(status_code=400, detail=f"Unknown exercise: '{exercise_key}'")

    if STATE["exercise"] != exercise_key:
        STATE.update({
            "counter": 0, "stage": None, "angle_buffer": [],
            "prev_angle": None, "last_rep_time": 0.0,
            "spam_times": [], "exercise": exercise_key,
        })

    if (data.shoulder.visibility < VISIBILITY_THRESHOLD or
            data.elbow.visibility < VISIBILITY_THRESHOLD or
            data.wrist.visibility < VISIBILITY_THRESHOLD):
        return {"angle": 0, "reps": STATE["counter"], "stage": STATE["stage"],
                "form_feedback": "Move into frame", "exercise": exercise_key}

    raw_angle = calculate_angle(data.shoulder, data.elbow, data.wrist)

    if STATE["prev_angle"] is not None and abs(raw_angle - STATE["prev_angle"]) > 60:
        STATE["prev_angle"] = raw_angle
        return {"angle": round(raw_angle, 1), "reps": STATE["counter"],
                "stage": STATE["stage"], "form_feedback": "Stabilizing...",
                "exercise": exercise_key}
    STATE["prev_angle"] = raw_angle

    STATE["angle_buffer"].append(raw_angle)
    if len(STATE["angle_buffer"]) > 3:
        STATE["angle_buffer"] = STATE["angle_buffer"][-3:]
    angle = statistics.median(STATE["angle_buffer"])

    cfg = EXERCISE_MAP_POSE[exercise_key]
    mode = cfg["mode"]
    form_feedback = ""

    def can_count():
        return (time.time() - STATE["last_rep_time"]) > 0.8

    def spam_detected():
        t = STATE["spam_times"]
        return len(t) >= 3 and (t[-1] - t[-3]) < 3.0

    def register_rep():
        STATE["counter"] += 1
        now = time.time()
        STATE["last_rep_time"] = now
        STATE["spam_times"].append(now)
        if len(STATE["spam_times"]) > 5:
            STATE["spam_times"] = STATE["spam_times"][-5:]

    if exercise_key == "pushups":
        if abs(data.shoulder.y - data.wrist.y) < 0.05:
            form_feedback = "Get into pushup position"
        else:
            if angle > cfg["up_angle"]:
                STATE["stage"] = "up"
            if angle < cfg["down_angle"] and STATE["stage"] == "up":
                STATE["stage"] = "down"
            if angle > cfg["up_angle"] and STATE["stage"] == "down":
                if can_count():
                    if spam_detected():
                        STATE["stage"] = None
                        form_feedback = "Slow down"
                    else:
                        register_rep()
                        STATE["stage"] = "up"
    elif mode in ("squat", "hinge"):
        if angle > cfg["up_angle"]:
            STATE["stage"] = "up"
        if angle < cfg["down_angle"] and STATE["stage"] == "up":
            STATE["stage"] = "down"
            if can_count():
                if spam_detected():
                    STATE["stage"] = None
                    form_feedback = "Slow down"
                else:
                    register_rep()
    elif mode == "curl":
        if angle > cfg["down_angle"]:
            STATE["stage"] = "down"
        if angle < cfg["up_angle"] and STATE["stage"] == "down":
            STATE["stage"] = "up"
            if can_count():
                if spam_detected():
                    STATE["stage"] = None
                    form_feedback = "Slow down"
                else:
                    register_rep()
    elif mode == "press":
        if angle < cfg["down_angle"]:
            STATE["stage"] = "down"
        if angle > cfg["up_angle"] and STATE["stage"] == "down":
            STATE["stage"] = "up"
            if can_count():
                if spam_detected():
                    STATE["stage"] = None
                    form_feedback = "Slow down"
                else:
                    register_rep()
    elif mode == "raise":
        if angle < cfg["down_angle"]:
            STATE["stage"] = "down"
        if angle > cfg["up_angle"] and STATE["stage"] == "down":
            STATE["stage"] = "up"
            if can_count():
                if spam_detected():
                    STATE["stage"] = None
                    form_feedback = "Slow down"
                else:
                    register_rep()
        if angle < cfg["down_angle"] and STATE["stage"] == "up":
            STATE["stage"] = "down"

    return {"angle": round(angle, 1), "reps": STATE["counter"],
            "stage": STATE["stage"], "form_feedback": form_feedback,
            "exercise": exercise_key}


@app.post("/reset")
def reset_counter(session_id: Optional[str] = None):
    if session_id and session_id in SESSIONS_MEMORY:
        SESSIONS_MEMORY[session_id] = new_session_state()
    return {"message": "Counter reset", "count": 0}


# ─────────────────────────────────────────
# Sessions CRUD
# ─────────────────────────────────────────

def _session_to_dict(s: SessionModel, include_rep_log: bool = False) -> dict:
    d = {
        "id": s.id,
        "external_id": s.external_id,
        "exercise": s.exercise,
        "sets": s.sets,
        "reps": s.reps,
        "duration_seconds": s.duration_seconds,
        "avg_form_score": s.avg_form_score,
        "best_form_score": s.best_form_score,
        "fatigue_onset_rep": s.fatigue_onset_rep,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }
    if include_rep_log:
        try:
            d["rep_log"] = json.loads(s.rep_log_json or "[]")
        except Exception:
            d["rep_log"] = []
        try:
            d["summary"] = json.loads(s.summary_json or "{}")
        except Exception:
            d["summary"] = {}
    return d


@app.post("/sessions", status_code=201)
@limiter.limit("60/minute")
def create_session(request: Request, data: SessionCreateSchema, db: Session = Depends(get_db)):
    session = SessionModel(
        exercise=data.exercise,
        sets=data.sets,
        reps=data.reps,
        duration_seconds=data.duration_seconds,
        avg_form_score=data.avg_form_score,
        best_form_score=data.best_form_score,
        fatigue_onset_rep=data.fatigue_onset_rep,
        rep_log_json=json.dumps([r.model_dump() for r in data.rep_log]),
        summary_json=json.dumps(data.summary),
    )
    try:
        db.add(session)
        db.commit()
        db.refresh(session)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc
    return _session_to_dict(session)


@app.get("/sessions")
@limiter.limit("100/minute")
def list_sessions(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    exercise: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(SessionModel).order_by(SessionModel.created_at.desc())
    if exercise:
        query = query.filter(SessionModel.exercise == exercise.strip().lower())
    total = query.count()
    sessions = query.offset(offset).limit(limit).all()
    return {
        "total": total, "limit": limit, "offset": offset,
        "sessions": [_session_to_dict(s) for s in sessions],
    }


@app.get("/sessions/{session_id}")
@limiter.limit("100/minute")
def get_session(request: Request, session_id: int, db: Session = Depends(get_db)):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return _session_to_dict(s, include_rep_log=True)


@app.delete("/sessions/{session_id}", status_code=204)
@limiter.limit("60/minute")
def delete_session(request: Request, session_id: int, db: Session = Depends(get_db)):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    try:
        db.delete(s)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc
    return Response(status_code=204)


@app.delete("/sessions", status_code=204)
@limiter.limit("10/minute")
def delete_all_sessions(request: Request, db: Session = Depends(get_db)):
    confirm = request.headers.get("x-confirm-delete")
    if confirm != "true":
        raise HTTPException(status_code=400, detail="Missing header X-Confirm-Delete: true")
    try:
        db.query(SessionModel).delete()
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc
    return Response(status_code=204)


# ─────────────────────────────────────────
# Analytics
# ─────────────────────────────────────────

@app.get("/analytics/summary")
@limiter.limit("60/minute")
def analytics_summary(request: Request, db: Session = Depends(get_db)):
    sessions = db.query(SessionModel).all()
    if not sessions:
        return {
            "totalSessions": 0, "totalReps": 0, "avgFormScore": 0,
            "bestFormScore": 0, "mostFrequentExercise": None,
            "currentStreak_days": 0, "personalRecords": {},
        }

    total_reps = sum(s.reps for s in sessions)
    avg_form = sum(s.avg_form_score for s in sessions) / len(sessions)
    best_form = max(s.best_form_score for s in sessions)

    exercise_counts: dict = {}
    personal_records: dict = {}
    for s in sessions:
        exercise_counts[s.exercise] = exercise_counts.get(s.exercise, 0) + 1
        if s.exercise not in personal_records or s.best_form_score > personal_records[s.exercise]:
            personal_records[s.exercise] = s.best_form_score

    most_frequent = max(exercise_counts, key=exercise_counts.get) if exercise_counts else None

    today = datetime.utcnow().date()
    streak, day = 0, today
    session_dates = {s.created_at.date() for s in sessions if s.created_at}
    while day in session_dates:
        streak += 1
        day -= timedelta(days=1)

    return {
        "totalSessions": len(sessions),
        "totalReps": total_reps,
        "avgFormScore": round(avg_form, 1),
        "bestFormScore": round(best_form, 1),
        "mostFrequentExercise": most_frequent,
        "currentStreak_days": streak,
        "personalRecords": personal_records,
    }


@app.get("/analytics/trends")
@limiter.limit("60/minute")
def analytics_trends(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
    exercise: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    query = db.query(SessionModel).filter(SessionModel.created_at >= since)
    if exercise:
        query = query.filter(SessionModel.exercise == exercise.strip().lower())
    sessions = query.order_by(SessionModel.created_at).all()

    trends: dict = {}
    for s in sessions:
        if not s.created_at:
            continue
        date_str = s.created_at.date().isoformat()
        if date_str not in trends:
            trends[date_str] = {"date": date_str, "totalReps": 0, "avgFormScore": 0, "count": 0}
        trends[date_str]["totalReps"] += s.reps
        trends[date_str]["avgFormScore"] += s.avg_form_score
        trends[date_str]["count"] += 1

    result = []
    for v in trends.values():
        v["avgFormScore"] = round(v["avgFormScore"] / v["count"], 1) if v["count"] else 0
        del v["count"]
        result.append(v)

    return {"days": days, "exercise": exercise, "data": sorted(result, key=lambda x: x["date"])}


# ─────────────────────────────────────────
# Export
# ─────────────────────────────────────────

@app.get("/export/csv")
@limiter.limit("20/minute")
def export_csv(request: Request, session_id: int = Query(...), db: Session = Depends(get_db)):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["session_id", "exercise", "sets", "reps", "duration_seconds",
                     "avg_form_score", "best_form_score", "created_at"])
    writer.writerow([s.id, s.exercise, s.sets, s.reps, s.duration_seconds,
                     s.avg_form_score, s.best_form_score, s.created_at])
    try:
        rep_log = json.loads(s.rep_log_json or "[]")
        if rep_log:
            writer.writerow([])
            writer.writerow(["rep_number", "set_number", "form_score", "peak_angle",
                             "min_angle", "range_of_motion", "tempo_seconds"])
            for rep in rep_log:
                writer.writerow([rep.get("rep_number"), rep.get("set_number"),
                                  rep.get("form_score"), rep.get("peak_angle"),
                                  rep.get("min_angle"), rep.get("range_of_motion"),
                                  rep.get("tempo_seconds")])
    except Exception:
        pass

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=session_{session_id}.csv"},
    )


@app.get("/export/json")
@limiter.limit("20/minute")
def export_json_endpoint(
    request: Request, session_id: int = Query(...), db: Session = Depends(get_db)
):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return _session_to_dict(s, include_rep_log=True)


@app.get("/export/all")
@limiter.limit("5/minute")
def export_all(request: Request, db: Session = Depends(get_db)):
    sessions = db.query(SessionModel).order_by(SessionModel.created_at.desc()).all()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for s in sessions:
            zf.writestr(f"session_{s.id}.json",
                        json.dumps(_session_to_dict(s, include_rep_log=True), indent=2))
        zf.writestr("summary.json", json.dumps({
            "exportedAt": datetime.utcnow().isoformat(),
            "totalSessions": len(sessions),
        }, indent=2))
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=all_sessions.zip"},
    )
