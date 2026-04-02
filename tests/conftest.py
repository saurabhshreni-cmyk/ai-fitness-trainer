"""Shared test fixtures."""

import os
import pytest
from fastapi.testclient import TestClient

# Use in-memory or temp DB for tests
os.environ["DB_PATH"] = ":memory:"

from backend.main import app
from backend.database import init_db


@pytest.fixture(autouse=True)
def setup_db():
    """Ensure clean DB for each test."""
    init_db()
    yield


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)
