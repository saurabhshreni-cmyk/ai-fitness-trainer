/** MediaPipe landmark indices and per-exercise joint triplets. */

export const LANDMARK_INDEX = {
  nose:            0,
  left_shoulder:  11, right_shoulder: 12,
  left_elbow:     13, right_elbow:    14,
  left_wrist:     15, right_wrist:    16,
  left_hip:       23, right_hip:      24,
  left_knee:      25, right_knee:     26,
  left_ankle:     27, right_ankle:    28,
};

/**
 * Per-exercise joint triplets (default = left side).
 * Keys MUST match backend EXERCISE_MAP exactly.
 */
export const EXERCISE_LANDMARKS = {
  bicep_curl:     ["left_shoulder", "left_elbow",    "left_wrist"],
  pushups:        ["left_shoulder", "left_elbow",    "left_wrist"],
  shoulder_press: ["left_shoulder", "left_elbow",    "left_wrist"],
  squats:         ["left_hip",      "left_knee",     "left_ankle"],
  lunges:         ["left_hip",      "left_knee",     "left_ankle"],
  lateral_raise:  ["left_hip",      "left_shoulder", "left_elbow"],
  front_raise:    ["left_hip",      "left_shoulder", "left_elbow"],
};
