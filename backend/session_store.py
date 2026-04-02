"""In-memory session state manager for rep counting."""

import uuid
from typing import Optional


def _new_session() -> dict:
    """Create a fresh session state."""
    return {
        "counter": 0,
        "stage": None,
        "exercise": None,
        "angle_buffer": [],
        "last_rep_time": 0.0,
        "prev_angle": None,
        "spam_times": [],
        # Form tracking per-rep
        "rep_angles": [],          # angle samples during current rep
        "rep_start_time": None,    # when current rep phase started
        "rep_form_scores": [],     # form scores for completed reps
        "min_angle_in_rep": None,
        "max_angle_in_rep": None,
    }


class SessionStore:
    """Manages per-session exercise state."""

    def __init__(self) -> None:
        self._sessions: dict[str, dict] = {}

    def get(self, sid: Optional[str] = None) -> tuple[str, dict]:
        """Get or create a session. Returns (session_id, state)."""
        if not sid:
            sid = str(uuid.uuid4())
        if sid not in self._sessions:
            self._sessions[sid] = _new_session()
        return sid, self._sessions[sid]

    def reset(self, sid: str) -> None:
        """Reset a session's counter and state."""
        if sid in self._sessions:
            s = self._sessions[sid]
            s["counter"] = 0
            s["stage"] = None
            s["angle_buffer"] = []
            s["prev_angle"] = None
            s["last_rep_time"] = 0.0
            s["spam_times"] = []
            s["rep_angles"] = []
            s["rep_start_time"] = None
            s["rep_form_scores"] = []
            s["min_angle_in_rep"] = None
            s["max_angle_in_rep"] = None

    def remove(self, sid: str) -> None:
        """Remove a session entirely."""
        self._sessions.pop(sid, None)

    def get_form_scores(self, sid: str) -> list[float]:
        """Get accumulated form scores for a session."""
        if sid in self._sessions:
            return list(self._sessions[sid].get("rep_form_scores", []))
        return []


# Global store instance
store = SessionStore()
