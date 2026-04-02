"""Tests for the form scoring engine."""

import pytest
from backend.form_analyzer import FormAnalyzer


@pytest.fixture
def analyzer():
    return FormAnalyzer()


class TestFormScoring:
    def test_insufficient_data_returns_neutral(self, analyzer):
        """Less than 3 angle samples → 50.0 neutral score."""
        state = {
            "rep_angles": [90.0],
            "min_angle_in_rep": 90.0,
            "max_angle_in_rep": 90.0,
            "rep_start_time": None,
            "rep_form_scores": [],
            "exercise": "bicep_curl",
        }
        score = analyzer.score_rep(state)
        assert score == 50.0

    def test_good_rom_scores_high(self, analyzer):
        """Full range of motion → high ROM score component."""
        state = {
            "rep_angles": list(range(35, 161, 5)),  # full curl range
            "min_angle_in_rep": 35.0,
            "max_angle_in_rep": 160.0,
            "rep_start_time": None,
            "rep_form_scores": [],
            "exercise": "bicep_curl",
        }
        score = analyzer.score_rep(state)
        assert score > 60.0  # should be decent with good ROM

    def test_half_rep_scores_low(self, analyzer):
        """Partial range → lower score."""
        state = {
            "rep_angles": list(range(100, 161, 5)),  # only top half
            "min_angle_in_rep": 100.0,
            "max_angle_in_rep": 160.0,
            "rep_start_time": None,
            "rep_form_scores": [],
            "exercise": "bicep_curl",
        }
        score = analyzer.score_rep(state)
        # Half ROM should score lower than full ROM
        full_state = {
            "rep_angles": list(range(35, 161, 5)),
            "min_angle_in_rep": 35.0,
            "max_angle_in_rep": 160.0,
            "rep_start_time": None,
            "rep_form_scores": [],
            "exercise": "bicep_curl",
        }
        full_score = analyzer.score_rep(full_state)
        assert score < full_score

    def test_score_bounded_0_100(self, analyzer):
        """Score is always in [0, 100]."""
        for angles in [
            [10, 20, 30],
            [170, 175, 180],
            list(range(0, 180, 1)),
        ]:
            state = {
                "rep_angles": angles,
                "min_angle_in_rep": min(angles),
                "max_angle_in_rep": max(angles),
                "rep_start_time": None,
                "rep_form_scores": [],
                "exercise": "bicep_curl",
            }
            score = analyzer.score_rep(state)
            assert 0 <= score <= 100
