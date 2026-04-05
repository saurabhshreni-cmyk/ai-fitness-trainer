/**
 * Client-side angle calculation + rep counting.
 * Runs at camera framerate with zero allocations in the hot path.
 */

/**
 * Calculate angle at point B (degrees) from three landmarks.
 * Pure math — no allocations, ~0.05ms per call.
 */
export function calculateAngle(a, b, c) {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;

  const dot = bax * bcx + bay * bcy;
  const magBA = Math.sqrt(bax * bax + bay * bay);
  const magBC = Math.sqrt(bcx * bcx + bcy * bcy);

  if (magBA * magBC === 0) return 0;

  const cosA = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosA) * 180) / Math.PI;
}

/**
 * Exercise thresholds — relaxed for real webcam use.
 *
 * These are ~20% more forgiving than textbook angles to account for
 * camera perspective, body proportions, and MediaPipe noise.
 */
export const EXERCISE_THRESHOLDS = {
  bicep_curl:     { down_angle: 140, up_angle: 55,  mode: "curl" },
  pushups:        { up_angle: 145,   down_angle: 100, mode: "pushup" },
  squats:         { up_angle: 155,   down_angle: 105, mode: "squat" },
  shoulder_press: { down_angle: 85,  up_angle: 150, mode: "press" },
  lateral_raise:  { down_angle: 25,  up_angle: 65,  mode: "raise" },
  lunges:         { up_angle: 155,   down_angle: 110, mode: "squat" },
  front_raise:    { down_angle: 30,  up_angle: 70,  mode: "raise" },
};

const MIN_REP_MS = 500;

/**
 * Rep counter state machine.
 * Mutates state in-place for zero allocation (hot path).
 * Returns the same object with `counted` flag set.
 */
export function countRep(angle, exercise, state) {
  const cfg = EXERCISE_THRESHOLDS[exercise];
  if (!cfg) { state.counted = false; return state; }

  const now = Date.now();
  const canCount = (now - state.lastRepTime) > MIN_REP_MS;
  state.counted = false;

  if (exercise === "pushups") {
    if (angle > cfg.up_angle) state.stage = "up";
    if (angle < cfg.down_angle && state.stage === "up") state.stage = "down";
    if (angle > cfg.up_angle && state.stage === "down" && canCount) {
      state.reps++;
      state.stage = "up";
      state.lastRepTime = now;
      state.counted = true;
    }
  } else if (cfg.mode === "squat") {
    if (angle > cfg.up_angle) state.stage = "up";
    if (angle < cfg.down_angle && state.stage === "up" && canCount) {
      state.reps++;
      state.stage = "down";
      state.lastRepTime = now;
      state.counted = true;
    }
  } else if (cfg.mode === "curl") {
    if (angle > cfg.down_angle) state.stage = "down";
    if (angle < cfg.up_angle && state.stage === "down" && canCount) {
      state.reps++;
      state.stage = "up";
      state.lastRepTime = now;
      state.counted = true;
    }
  } else if (cfg.mode === "press") {
    if (angle < cfg.down_angle) state.stage = "down";
    if (angle > cfg.up_angle && state.stage === "down" && canCount) {
      state.reps++;
      state.stage = "up";
      state.lastRepTime = now;
      state.counted = true;
    }
  } else if (cfg.mode === "raise") {
    if (angle < cfg.down_angle) state.stage = "down";
    if (angle > cfg.up_angle && state.stage === "down" && canCount) {
      state.reps++;
      state.stage = "up";
      state.lastRepTime = now;
      state.counted = true;
    }
    if (angle < cfg.down_angle && state.stage === "up") state.stage = "down";
  }

  return state;
}
