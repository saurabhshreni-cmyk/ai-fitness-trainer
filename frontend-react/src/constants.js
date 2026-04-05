/** Centralized constants — no magic numbers scattered in components. */

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Timing
export const SPEECH_GAP = 2500;   // ms between utterances
export const REST_AFTER = 12000;  // ms of no rep before rest timer starts
export const UI_FPS     = 10;     // UI updates per second (not camera fps)

// Camera — low resolution for performance on laptops
export const CAMERA_WIDTH  = 640;
export const CAMERA_HEIGHT = 360;

// Pose detection
export const MODEL_COMPLEXITY = 0; // 0=lite(fastest), 1=full, 2=heavy
export const PROCESS_EVERY_N  = 2; // skip every other frame

// Exercise config — keys MUST match backend EXERCISE_MAP
export const EXERCISE_CONFIG = {
  bicep_curl:     "Bicep Curl",
  pushups:        "Pushups",
  squats:         "Squats",
  shoulder_press: "Shoulder Press",
  lateral_raise:  "Lateral Raise",
  lunges:         "Lunges",
  front_raise:    "Front Raise",
};

export const EXERCISES = Object.keys(EXERCISE_CONFIG);
