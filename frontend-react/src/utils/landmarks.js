const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const subtract = (a, b) => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: (a.z ?? 0) - (b.z ?? 0),
});

const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const magnitude = (v) => Math.hypot(v.x, v.y, v.z);
const VECTOR_EPSILON = 1e-6;

const midpoint = (a, b) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
});

export const EXERCISE_LANDMARKS = {
  bicep_curl: {
    primary: ["left_shoulder", "left_elbow", "left_wrist"],
    secondary: ["left_hip", "left_shoulder", "left_elbow"],
    bilateral: {
      left_arm: ["left_shoulder", "left_elbow", "left_wrist"],
      right_arm: ["right_shoulder", "right_elbow", "right_wrist"],
      imbalance_threshold_pct: 10,
    },
    spine: {
      shoulders: ["left_shoulder", "right_shoulder"],
      hips: ["left_hip", "right_hip"],
      lean_limit: 35,
    },
    movingJoint: {
      type: "single",
      left: "left_wrist",
      right: "right_wrist",
    },
  },
  pushups: {
    primary: ["left_shoulder", "left_elbow", "left_wrist"],
    secondary: ["left_shoulder", "left_hip", "left_ankle"],
    bilateral: {
      left_arm: ["left_shoulder", "left_elbow", "left_wrist"],
      right_arm: ["right_shoulder", "right_elbow", "right_wrist"],
      imbalance_threshold_pct: 10,
    },
    spine: {
      shoulders: ["left_shoulder", "right_shoulder"],
      hips: ["left_hip", "right_hip"],
      lean_limit: 35,
    },
    movingJoint: {
      type: "midpoint",
      left: "left_shoulder",
      right: "right_shoulder",
    },
  },
  shoulder_press: {
    primary: ["left_shoulder", "left_elbow", "left_wrist"],
    secondary: ["left_hip", "left_shoulder", "left_elbow"],
    bilateral: {
      left_arm: ["left_shoulder", "left_elbow", "left_wrist"],
      right_arm: ["right_shoulder", "right_elbow", "right_wrist"],
      imbalance_threshold_pct: 10,
    },
    spine: {
      shoulders: ["left_shoulder", "right_shoulder"],
      hips: ["left_hip", "right_hip"],
      lean_limit: 35,
    },
    movingJoint: {
      type: "single",
      left: "left_wrist",
      right: "right_wrist",
    },
  },
  squats: {
    primary: ["left_hip", "left_knee", "left_ankle"],
    secondary: ["left_shoulder", "left_hip", "left_knee"],
    bilateral: {
      left_leg: ["left_hip", "left_knee", "left_ankle"],
      right_leg: ["right_hip", "right_knee", "right_ankle"],
      imbalance_threshold_pct: 10,
    },
    spine: {
      shoulders: ["left_shoulder", "right_shoulder"],
      hips: ["left_hip", "right_hip"],
      lean_limit: 45,
    },
    movingJoint: {
      type: "midpoint",
      left: "left_shoulder",
      right: "right_shoulder",
    },
  },
  lunges: {
    primary: ["left_hip", "left_knee", "left_ankle"],
    secondary: ["left_shoulder", "left_hip", "left_knee"],
    bilateral: {
      left_leg: ["left_hip", "left_knee", "left_ankle"],
      right_leg: ["right_hip", "right_knee", "right_ankle"],
      imbalance_threshold_pct: 10,
    },
    spine: {
      shoulders: ["left_shoulder", "right_shoulder"],
      hips: ["left_hip", "right_hip"],
      lean_limit: 45,
    },
    movingJoint: {
      type: "midpoint",
      left: "left_shoulder",
      right: "right_shoulder",
    },
  },
  lateral_raise: {
    primary: ["left_hip", "left_shoulder", "left_elbow"],
    secondary: ["left_shoulder", "left_elbow", "left_wrist"],
    bilateral: {
      left_arm: ["left_hip", "left_shoulder", "left_elbow"],
      right_arm: ["right_hip", "right_shoulder", "right_elbow"],
      imbalance_threshold_pct: 10,
    },
    spine: {
      shoulders: ["left_shoulder", "right_shoulder"],
      hips: ["left_hip", "right_hip"],
      lean_limit: 35,
    },
    movingJoint: {
      type: "single",
      left: "left_elbow",
      right: "right_elbow",
    },
  },
  front_raise: {
    primary: ["left_hip", "left_shoulder", "left_elbow"],
    secondary: ["left_shoulder", "left_elbow", "left_wrist"],
    bilateral: {
      left_arm: ["left_hip", "left_shoulder", "left_elbow"],
      right_arm: ["right_hip", "right_shoulder", "right_elbow"],
      imbalance_threshold_pct: 10,
    },
    spine: {
      shoulders: ["left_shoulder", "right_shoulder"],
      hips: ["left_hip", "right_hip"],
      lean_limit: 35,
    },
    movingJoint: {
      type: "single",
      left: "left_elbow",
      right: "right_elbow",
    },
  },
};

export const LANDMARK_INDEX = {
  nose: 0,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
};

/**
 * Calculates torso-plane orientation by comparing torso-plane normal to the world Y-axis.
 * Returns null for degenerate inputs (missing points, near-collinear torso points).
 */
export const calculateSpineAngle = (shoulders, hips) => {
  if (!shoulders?.left || !shoulders?.right || !hips?.left || !hips?.right) {
    return null;
  }

  const shoulderLine = subtract(shoulders.right, shoulders.left);
  const hipMid = midpoint(hips.left, hips.right);
  const shoulderMid = midpoint(shoulders.left, shoulders.right);
  const torsoVector = subtract(hipMid, shoulderMid);
  const shoulderLineMag = magnitude(shoulderLine);
  const torsoVectorMag = magnitude(torsoVector);
  if (shoulderLineMag < VECTOR_EPSILON || torsoVectorMag < VECTOR_EPSILON) return null;

  const normal = cross(shoulderLine, torsoVector);
  const normalMag = magnitude(normal);
  if (normalMag < VECTOR_EPSILON) return null;

  const normalized = {
    x: normal.x / normalMag,
    y: normal.y / normalMag,
    z: normal.z / normalMag,
  };
  const yAxis = { x: 0, y: 1, z: 0 };
  const dot = normalized.x * yAxis.x + normalized.y * yAxis.y + normalized.z * yAxis.z;
  return (Math.acos(clamp(dot, -1, 1)) * 180) / Math.PI;
};

export const resolveMovingJointPoint = (movingJointConfig, getLM, side) => {
  if (!movingJointConfig) return null;

  if (movingJointConfig.type === "midpoint") {
    const left = getLM(movingJointConfig.left);
    const right = getLM(movingJointConfig.right);
    if (!left || !right) return null;
    return midpoint(left, right);
  }

  const jointName = side === "right" ? movingJointConfig.right : movingJointConfig.left;
  return jointName ? getLM(jointName) : null;
};
