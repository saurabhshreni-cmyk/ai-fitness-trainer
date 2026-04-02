/**
 * Client-side angle calculation — eliminates HTTP round-trip lag.
 * Runs at camera framerate (~30fps) with zero network delay.
 */

/**
 * Calculate angle at point B (in degrees) from three landmark positions.
 * Coordinates are normalized [0,1].
 */
export function calculateAngle(a, b, c) {
  const ba = [a.x - b.x, a.y - b.y];
  const bc = [c.x - b.x, c.y - b.y];

  const dot = ba[0] * bc[0] + ba[1] * bc[1];
  const magBA = Math.sqrt(ba[0] ** 2 + ba[1] ** 2);
  const magBC = Math.sqrt(bc[0] ** 2 + bc[1] ** 2);

  if (magBA * magBC === 0) return 0;

  const cosA = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosA) * 180) / Math.PI;
}

/**
 * Exercise configs with RELAXED thresholds for real webcam use.
 * down/up thresholds are ~20% more forgiving than ideal to account
 * for camera angle, body proportions, and MediaPipe noise.
 */
export const EXERCISE_THRESHOLDS = {
  bicep_curl: {
    down_angle: 140,   // was 160 — arm mostly extended
    up_angle: 55,      // was 35 — arm well curled (not fully)
    mode: "curl",
  },
  pushups: {
    up_angle: 145,     // was 155
    down_angle: 100,   // was 90
    mode: "pushup",
  },
  squats: {
    up_angle: 155,     // was 165
    down_angle: 105,   // was 95
    mode: "squat",
  },
  shoulder_press: {
    down_angle: 85,    // was 80
    up_angle: 150,     // was 165
    mode: "press",
  },
  lateral_raise: {
    down_angle: 25,    // was 20
    up_angle: 65,      // was 75
    mode: "raise",
  },
  lunges: {
    up_angle: 155,     // was 165
    down_angle: 110,   // was 100
    mode: "squat",
  },
  front_raise: {
    down_angle: 30,    // was 25
    up_angle: 70,      // was 80
    mode: "raise",
  },
};

/**
 * Rep counter state machine — runs entirely client-side.
 * Returns { reps, stage, counted } where counted=true if a new rep was just detected.
 */
export function countRep(angle, exercise, state) {
  const cfg = EXERCISE_THRESHOLDS[exercise];
  if (!cfg) return { ...state, counted: false };

  const now = Date.now();
  const MIN_REP_MS = 500; // minimum time between reps
  let counted = false;
  let { reps = 0, stage = null, lastRepTime = 0 } = state;

  const canCount = () => (now - lastRepTime) > MIN_REP_MS;

  if (exercise === "pushups") {
    if (angle > cfg.up_angle) stage = "up";
    if (angle < cfg.down_angle && stage === "up") stage = "down";
    if (angle > cfg.up_angle && stage === "down" && canCount()) {
      reps++;
      stage = "up";
      lastRepTime = now;
      counted = true;
    }
  } else if (cfg.mode === "squat") {
    if (angle > cfg.up_angle) stage = "up";
    if (angle < cfg.down_angle && stage === "up" && canCount()) {
      reps++;
      stage = "down";
      lastRepTime = now;
      counted = true;
    }
  } else if (cfg.mode === "curl") {
    if (angle > cfg.down_angle) stage = "down";
    if (angle < cfg.up_angle && stage === "down" && canCount()) {
      reps++;
      stage = "up";
      lastRepTime = now;
      counted = true;
    }
  } else if (cfg.mode === "press") {
    if (angle < cfg.down_angle) stage = "down";
    if (angle > cfg.up_angle && stage === "down" && canCount()) {
      reps++;
      stage = "up";
      lastRepTime = now;
      counted = true;
    }
  } else if (cfg.mode === "raise") {
    if (angle < cfg.down_angle) stage = "down";
    if (angle > cfg.up_angle && stage === "down" && canCount()) {
      reps++;
      stage = "up";
      lastRepTime = now;
      counted = true;
    }
    if (angle < cfg.down_angle && stage === "up") stage = "down";
  }

  return { reps, stage, lastRepTime, counted };
}
