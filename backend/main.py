"""FastAPI application entry point."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .routes import health, analyze, sessions

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("fitness_trainer")

# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Fitness Trainer",
    version="2.0.0",
    description="Real-time exercise rep counting and form analysis API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ───────────────────────────────────────────────────────────────────

app.include_router(health.router)
app.include_router(analyze.router)
app.include_router(sessions.router)

# ── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    logger.info("Initializing database at %s", settings.db_path)
    init_db()
    logger.info("AI Fitness Trainer v2.0.0 ready")
    logger.info("CORS origins: %s", settings.allowed_origins)
