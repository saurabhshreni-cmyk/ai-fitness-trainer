/**
 * Smart left/right side detection based on joint visibility and position.
 */

import { LANDMARK_INDEX } from "./landmarks";

/**
 * Determine which body side (left/right) to track for a given exercise.
 * @param {object[]} landmarks - MediaPipe pose landmarks array
 * @param {string} exercise - Exercise key
 * @returns {"left" | "right"}
 */
export function detectSide(landmarks, exercise) {
  const getLM = (name) => landmarks[LANDMARK_INDEX[name]];

  if (["squats", "lunges"].includes(exercise)) {
    const lKV = getLM("left_knee").visibility;
    const rKV = getLM("right_knee").visibility;
    return rKV > lKV ? "right" : "left";
  }

  if (exercise === "pushups") {
    const lSZ = getLM("left_shoulder").z;
    const rSZ = getLM("right_shoulder").z;
    return rSZ < lSZ ? "right" : "left";
  }

  // Upper body: side whose wrist is higher (lower Y) in frame
  const lWY = getLM("left_wrist").y;
  const rWY = getLM("right_wrist").y;
  if (rWY < lWY - 0.05) return "right";
  if (lWY < rWY - 0.05) return "left";

  // Fallback: shoulder visibility
  return getLM("left_shoulder").visibility >= getLM("right_shoulder").visibility
    ? "left" : "right";
}

/**
 * Remap a "left_" joint triplet to the active side.
 */
export function remapTriplet(baseTriplet, side) {
  if (side === "right") {
    return baseTriplet.map(n => n.replace("left_", "right_"));
  }
  return baseTriplet;
}
