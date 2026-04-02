"""Form scoring engine — rates each rep on a 0-100 scale.

Scoring dimensions:
  - ROM (Range of Motion): 40% — did the user complete the full movement?
  - Tempo: 20% — was the rep speed controlled (not too fast/slow)?
  - Stability: 15% — was the movement smooth (low angle variance)?
  - Consistency: 15% — how similar was this rep to previous reps?
  - Bonus: 10% — extra credit for exceptional execution
"""

import math
import statistics
import time

from .config import settings


class FormAnalyzer:
    """Scores individual reps based on angle data collected during the rep."""

    def score_rep(self, state: dict) -> float:
        """Compute a 0-100 form score for a just-completed rep."""
        angles = state.get("rep_angles", [])
        if len(angles) < 3:
            return 50.0  # insufficient data — neutral score

        min_angle = state.get("min_angle_in_rep", min(angles))
        max_angle = state.get("max_angle_in_rep", max(angles))
        rep_start = state.get("rep_start_time")
        prev_scores = state.get("rep_form_scores", [])

        rom_score = self._score_rom(min_angle, max_angle, state)
        tempo_score = self._score_tempo(rep_start, state)
        stability_score = self._score_stability(angles)
        consistency_score = self._score_consistency(
            min_angle, max_angle, prev_scores, state
        )
        bonus_score = self._score_bonus(rom_score, tempo_score, stability_score)

        total = (
            rom_score * settings.form_weight_rom
            + tempo_score * settings.form_weight_tempo
            + stability_score * settings.form_weight_stability
            + consistency_score * settings.form_weight_consistency
            + bonus_score * settings.form_weight_consistency  # bonus uses consistency weight
        )

        return max(0.0, min(100.0, total))

    def _score_rom(
        self, min_angle: float, max_angle: float, state: dict
    ) -> float:
        """Score based on range of motion achieved vs ideal."""
        actual_rom = abs(max_angle - min_angle)

        # Use exercise config ideal ROM if available, else estimate
        exercise = state.get("exercise", "")
        from .exercises import EXERCISE_MAP

        cfg = EXERCISE_MAP.get(exercise)
        ideal_rom = cfg.ideal_rom if cfg else 90.0

        if ideal_rom <= 0:
            return 75.0

        ratio = actual_rom / ideal_rom
        if ratio >= 0.95:
            return 100.0
        elif ratio >= 0.85:
            return 90.0
        elif ratio >= 0.70:
            return 70.0 + (ratio - 0.70) * (20.0 / 0.15)
        elif ratio >= 0.50:
            return 40.0 + (ratio - 0.50) * (30.0 / 0.20)
        else:
            return max(10.0, ratio * 80.0)

    def _score_tempo(self, rep_start: float | None, state: dict) -> float:
        """Score based on rep duration vs ideal tempo."""
        if rep_start is None:
            return 60.0

        duration = time.time() - rep_start
        exercise = state.get("exercise", "")

        from .exercises import EXERCISE_MAP

        cfg = EXERCISE_MAP.get(exercise)
        ideal = cfg.ideal_tempo if cfg else 2.5

        if duration <= 0.3:
            return 10.0  # way too fast, likely noise

        ratio = duration / ideal
        if 0.7 <= ratio <= 1.5:
            return 100.0  # good tempo range
        elif 0.5 <= ratio < 0.7:
            return 60.0 + (ratio - 0.5) * (40.0 / 0.2)  # a bit fast
        elif 1.5 < ratio <= 2.5:
            return 60.0 + (2.5 - ratio) * (40.0 / 1.0)  # a bit slow
        elif ratio < 0.5:
            return 30.0  # too fast
        else:
            return 30.0  # too slow

    def _score_stability(self, angles: list[float]) -> float:
        """Score based on smoothness of movement (low jitter = high score)."""
        if len(angles) < 3:
            return 70.0

        # Calculate successive differences
        diffs = [abs(angles[i] - angles[i - 1]) for i in range(1, len(angles))]
        if not diffs:
            return 70.0

        avg_diff = sum(diffs) / len(diffs)
        std_diff = statistics.stdev(diffs) if len(diffs) > 1 else 0.0

        # High jitter (std > 15) = unstable, low jitter (std < 3) = smooth
        if std_diff < 2.0:
            return 100.0
        elif std_diff < 5.0:
            return 85.0
        elif std_diff < 10.0:
            return 65.0
        elif std_diff < 20.0:
            return 40.0
        else:
            return 20.0

    def _score_consistency(
        self,
        min_angle: float,
        max_angle: float,
        prev_scores: list[float],
        state: dict,
    ) -> float:
        """Score based on similarity to previous reps."""
        if len(prev_scores) < 2:
            return 75.0  # not enough history, neutral score

        recent = prev_scores[-5:]  # last 5 reps
        avg = sum(recent) / len(recent)

        # How close is current ROM pattern to average previous scores
        deviation = abs(avg - 75.0)  # deviation from "good" average
        if deviation < 10:
            return 90.0
        elif deviation < 20:
            return 70.0
        else:
            return 50.0

    def _score_bonus(
        self, rom: float, tempo: float, stability: float
    ) -> float:
        """Bonus points for exceptional execution across all dimensions."""
        if rom >= 90 and tempo >= 80 and stability >= 85:
            return 100.0
        elif rom >= 80 and tempo >= 70 and stability >= 70:
            return 70.0
        else:
            return 40.0
