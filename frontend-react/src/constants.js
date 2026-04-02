/** Centralized constants — no magic numbers scattered in components. */

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Throttle / timing
export const SEND_MS    = 66;     // ~15 API calls / sec — smooth real-time
export const SPEECH_GAP = 2500;   // ms between utterances
export const REST_AFTER = 12000;  // ms of no rep before rest timer starts

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

// Camera resolution
export const CAMERA_WIDTH  = 640;
export const CAMERA_HEIGHT = 480;
