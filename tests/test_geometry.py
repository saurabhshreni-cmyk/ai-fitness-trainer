"""Tests for angle calculation geometry."""

import pytest
from backend.geometry import calculate_angle
from backend.models import Point


def _pt(x: float, y: float, vis: float = 1.0) -> Point:
    return Point(x=x, y=y, z=0.0, visibility=vis)


class TestCalculateAngle:
    def test_straight_line_180(self):
        """Three points in a straight vertical line → ~180°."""
        angle = calculate_angle(
            _pt(0.5, 0.0),  # top
            _pt(0.5, 0.5),  # middle
            _pt(0.5, 1.0),  # bottom
        )
        assert abs(angle - 180.0) < 1.0

    def test_right_angle_90(self):
        """L-shape → ~90°."""
        angle = calculate_angle(
            _pt(0.5, 0.0),  # top
            _pt(0.5, 0.5),  # corner
            _pt(1.0, 0.5),  # right
        )
        assert abs(angle - 90.0) < 2.0

    def test_acute_angle(self):
        """Tight bend → angle < 90°."""
        angle = calculate_angle(
            _pt(0.5, 0.2),
            _pt(0.5, 0.5),
            _pt(0.5, 0.35),
        )
        assert angle < 90.0

    def test_zero_length_vector(self):
        """Overlapping points → 0."""
        angle = calculate_angle(
            _pt(0.5, 0.5),
            _pt(0.5, 0.5),
            _pt(0.5, 0.5),
        )
        assert angle == 0.0

    def test_typical_bicep_curl_down(self):
        """Arm extended straight down → angle near 180°."""
        angle = calculate_angle(
            _pt(0.5, 0.2),   # shoulder
            _pt(0.5, 0.5),   # elbow
            _pt(0.5, 0.8),   # wrist
        )
        assert angle > 160.0

    def test_typical_bicep_curl_up(self):
        """Arm flexed → angle < 50°."""
        angle = calculate_angle(
            _pt(0.5, 0.2),   # shoulder
            _pt(0.5, 0.5),   # elbow
            _pt(0.5, 0.3),   # wrist curled up
        )
        assert angle < 50.0
