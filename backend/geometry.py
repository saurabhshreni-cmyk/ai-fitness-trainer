"""Geometric calculations for pose analysis."""

import math

from .models import Point
from .config import settings


def calculate_angle(a: Point, b: Point, c: Point) -> float:
    """Calculate angle at point B (in degrees) from three joint positions.

    Inputs are normalised [0, 1]; we scale to pixel space for accurate angles.
    """
    w = settings.camera_width
    h = settings.camera_height

    ax, ay = a.x * w, a.y * h
    bx, by = b.x * w, b.y * h
    cx, cy = c.x * w, c.y * h

    ba = [ax - bx, ay - by]
    bc = [cx - bx, cy - by]

    dot = ba[0] * bc[0] + ba[1] * bc[1]
    mag_ba = math.sqrt(ba[0] ** 2 + ba[1] ** 2)
    mag_bc = math.sqrt(bc[0] ** 2 + bc[1] ** 2)

    if mag_ba * mag_bc == 0:
        return 0.0

    cos_a = max(min(dot / (mag_ba * mag_bc), 1.0), -1.0)
    return math.degrees(math.acos(cos_a))


def points_visible(*points: Point) -> bool:
    """Check if all points meet the visibility threshold."""
    return all(p.visibility >= settings.visibility_threshold for p in points)
