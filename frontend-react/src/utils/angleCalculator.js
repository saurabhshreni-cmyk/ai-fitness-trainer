import { EXERCISE_MAP } from "./exercises";

const ANGLE_SPIKE_THRESHOLD = 60;
const REP_COOLDOWN_MS = 800;
const SPAM_WINDOW_MS = 3000;
const MAX_SPAM_TIMES = 5;
const ANGLE_EMA_ALPHA = 0.3;
const SECONDARY_EMA_ALPHA = 0.3;
const FATIGUE_WARNING_RATIO = 0.4;
const DEFAULT_TEMPO_SECONDS = 1.0;
const BAR_PATH_WINDOW_MS = 3000;
const MAX_BAR_PATH_POINTS = 90;
const MAX_TIME_SERIES_POINTS = 18000;
const DEFAULT_VBT_WORKING_LOAD_KG = 50;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const round = (value, decimals = 2) => {
  const power = 10 ** decimals;
  return Math.round(value * power) / power;
};

/**
 * Estimates theoretical 1RM from observed concentric velocity.
 * Uses a normalized velocity ratio against baseline to infer load percentage.
 */
const estimate1RMFromVelocity = (peakVelocity, baselineVelocity) => {
  if (!peakVelocity || peakVelocity <= 0) return null;

  const normalized = baselineVelocity ? peakVelocity / baselineVelocity : 1;
  const inferredLoadPct = clamp(1.05 - normalized * 0.35, 0.55, 1.0);
  return round(DEFAULT_VBT_WORKING_LOAD_KG / inferredLoadPct, 1);
};

const computeFormScore = (actualRom, idealRom, tolerance) => {
  if (!idealRom || idealRom <= 0) return 100;
  if (actualRom <= 0) return 0;

  const diff = Math.abs(actualRom - idealRom);
  if (diff <= tolerance) return 100;

  const penalty = ((diff - tolerance) / idealRom) * 100;
  return clamp(Math.round(100 - penalty), 0, 100);
};

/**
 * Computes angular velocity in degrees/second from smoothed angles.
 */
const calculateAngularVelocity = (currentSmoothedAngle, previousSmoothedAngle, deltaTimeSeconds) => {
  if (
    !Number.isFinite(currentSmoothedAngle) ||
    !Number.isFinite(previousSmoothedAngle) ||
    !Number.isFinite(deltaTimeSeconds)
  ) {
    return 0;
  }

  const safeDt = Math.max(deltaTimeSeconds, 0.001);
  return (currentSmoothedAngle - previousSmoothedAngle) / safeDt;
};

const updateRomWindow = (state, angle) => {
  state.romMin = state.romMin === null ? angle : Math.min(state.romMin, angle);
  state.romMax = state.romMax === null ? angle : Math.max(state.romMax, angle);
};

const resetRomWindow = (state, angle) => {
  state.romMin = angle;
  state.romMax = angle;
};

const repSpamDetected = (spamTimes) => {
  if (spamTimes.length < 3) return false;
  return spamTimes[spamTimes.length - 1] - spamTimes[spamTimes.length - 3] < SPAM_WINDOW_MS;
};

const isConcentricMotion = (mode, deltaAngle) => {
  if (!Number.isFinite(deltaAngle)) return false;
  if (mode === "curl") return deltaAngle < 0;
  return deltaAngle > 0;
};

const classifyPhase = (mode, previousStage, nextStage) => {
  if (!previousStage || !nextStage || previousStage === nextStage) return null;

  if (mode === "pushup" || mode === "squat") {
    if (previousStage === "up" && nextStage === "down") return "eccentric";
    if (previousStage === "down" && nextStage === "up") return "concentric";
    return null;
  }

  if (previousStage === "down" && nextStage === "up") return "concentric";
  if (previousStage === "up" && nextStage === "down") return "eccentric";
  return null;
};

const resolveThresholds = (cfg, repState) => {
  if (
    !repState.isCalibrating &&
    typeof repState.calibratedUpAngle === "number" &&
    typeof repState.calibratedDownAngle === "number"
  ) {
    return {
      up_angle: repState.calibratedUpAngle,
      down_angle: repState.calibratedDownAngle,
    };
  }

  return {
    up_angle: cfg.up_angle,
    down_angle: cfg.down_angle,
  };
};

const applyCalibration = (cfg, repState) => {
  const margin = cfg.calibration_margin ?? 4;
  const min = repState.romMin;
  const max = repState.romMax;

  if (typeof min !== "number" || typeof max !== "number") {
    repState.isCalibrating = false;
    return;
  }

  let calibratedUp = cfg.up_angle;
  let calibratedDown = cfg.down_angle;

  if (cfg.mode === "curl") {
    calibratedDown = max - margin;
    calibratedUp = min + margin;
  } else {
    calibratedUp = max - margin;
    calibratedDown = min + margin;
  }

  if (Number.isFinite(calibratedUp) && Number.isFinite(calibratedDown)) {
    repState.calibratedUpAngle = calibratedUp;
    repState.calibratedDownAngle = calibratedDown;
  }

  if (
    repState.calibratedSecondaryNeutral === null &&
    typeof repState.smoothedSecondaryAngle === "number"
  ) {
    repState.calibratedSecondaryNeutral = repState.smoothedSecondaryAngle;
  }

  repState.isCalibrating = false;
};

const processStageTransition = ({ repState, mode, previousStage, nextStage, now, cfg, warnings }) => {
  if (previousStage === nextStage) return "";

  if (!previousStage || repState.lastStageTransitionTime === null) {
    repState.lastStageTransitionTime = now;
    repState.phaseVelocitySum = 0;
    repState.phaseVelocityCount = 0;
    return "";
  }

  const phaseDuration = (now - repState.lastStageTransitionTime) / 1000;
  const phaseType = classifyPhase(mode, previousStage, nextStage);
  const avgPhaseVelocity =
    repState.phaseVelocityCount > 0
      ? repState.phaseVelocitySum / repState.phaseVelocityCount
      : Math.abs(repState.lastVelocity);

  let feedback = "";

  if (phaseType === "eccentric") {
    repState.lastEccentricDuration = phaseDuration;
    const idealTempo = cfg.ideal_tempo ?? DEFAULT_TEMPO_SECONDS;
    if (phaseDuration < idealTempo) {
      warnings.push("tempo");
      feedback = "Control the descent!";
    }
  }

  if (phaseType === "concentric") {
    repState.lastConcentricDuration = phaseDuration;
    if (avgPhaseVelocity > 0) {
      if (repState.baselineConcentricVelocity === null) {
        repState.baselineConcentricVelocity = avgPhaseVelocity;
      } else if (avgPhaseVelocity < repState.baselineConcentricVelocity * FATIGUE_WARNING_RATIO) {
        repState.fatigueWarning = true;
        warnings.push("fatigue");
        feedback = feedback || "Fatigue detected - reduce load";
      }
    }
  }

  repState.lastStageTransitionTime = now;
  repState.phaseVelocitySum = 0;
  repState.phaseVelocityCount = 0;
  return feedback;
};

const updateBilateralSmoothedAngles = (repState, bilateralAngles) => {
  const source = bilateralAngles || {};
  const result = {};

  Object.entries(source).forEach(([key, value]) => {
    if (!Number.isFinite(value)) return;
    const prev = repState.bilateralSmoothedAngles[key];
    const next = prev === undefined ? value : value * ANGLE_EMA_ALPHA + prev * (1 - ANGLE_EMA_ALPHA);
    repState.bilateralSmoothedAngles[key] = next;
    result[key] = next;
  });

  return result;
};

const evaluateBilateralImbalance = (
  repState,
  bilateralSmoothedAngles,
  thresholdPct,
  warnings
) => {
  const keys = Object.keys(bilateralSmoothedAngles);
  if (keys.length < 2) return { feedback: "", triggered: false };

  const leftKey = keys.find((key) => key.toLowerCase().includes("left")) ?? keys[0];
  const rightKey =
    keys.find((key) => key.toLowerCase().includes("right") && key !== leftKey) ??
    keys.find((key) => key !== leftKey);

  if (!rightKey) return { feedback: "", triggered: false };

  const left = bilateralSmoothedAngles[leftKey];
  const right = bilateralSmoothedAngles[rightKey];
  if (!Number.isFinite(left) || !Number.isFinite(right)) return { feedback: "", triggered: false };

  const deltaPct = (Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1)) * 100;
  if (deltaPct > thresholdPct && !repState.bilateralPenaltyApplied) {
    repState.formScore = clamp(repState.formScore - 10, 0, 100);
    repState.bilateralPenaltyApplied = true;
    warnings.push("imbalance");
    return { feedback: "Imbalance detected, push evenly!", triggered: true };
  }

  return { feedback: "", triggered: false };
};

const updateBarPath = (repState, now, movingJointPoint) => {
  if (movingJointPoint && Number.isFinite(movingJointPoint.x) && Number.isFinite(movingJointPoint.y)) {
    repState.barPath.push({
      timestamp: now,
      x: movingJointPoint.x,
      y: movingJointPoint.y,
    });
  }

  while (
    repState.barPath.length > 0 &&
    now - repState.barPath[0].timestamp > BAR_PATH_WINDOW_MS
  ) {
    repState.barPath.shift();
  }
  if (repState.barPath.length > MAX_BAR_PATH_POINTS) {
    repState.barPath.splice(0, repState.barPath.length - MAX_BAR_PATH_POINTS);
  }
};

const appendTimeSeries = (repState, now) => {
  repState.timeSeriesLog.push({
    timestamp: now,
    smoothedAngle: round(repState.smoothedAngle ?? 0, 2),
    velocity: round(repState.lastVelocity, 2),
    stage: repState.stage,
  });

  if (repState.timeSeriesLog.length > MAX_TIME_SERIES_POINTS) {
    repState.timeSeriesLog.splice(0, repState.timeSeriesLog.length - MAX_TIME_SERIES_POINTS);
  }
};

export const createInitialRepState = () => ({
  reps: 0,
  stage: null,
  prevAngle: null,
  smoothedAngle: null,
  smoothedSecondaryAngle: null,
  smoothedSpineAngle: null,
  lastRepTime: 0,
  spamTimes: [],
  formFeedback: "",
  formScore: 100,
  formWarnings: [],
  romMin: null,
  romMax: null,
  isCalibrating: true,
  calibratedUpAngle: null,
  calibratedDownAngle: null,
  calibratedSecondaryNeutral: null,
  strictPenaltyApplied: false,
  bilateralPenaltyApplied: false,
  lastStageTransitionTime: null,
  lastFrameTimestamp: null,
  lastVelocity: 0,
  phaseVelocitySum: 0,
  phaseVelocityCount: 0,
  lastEccentricDuration: null,
  lastConcentricDuration: null,
  baselineConcentricVelocity: null,
  currentRepPeakConcentricVelocity: 0,
  peakConcentricVelocities: [],
  estimated1RM: null,
  bilateralSmoothedAngles: {},
  fatigueWarning: false,
  timeSeriesLog: [],
  barPath: [],
  baselineGhostCurve: [],
  currentCalibrationCurve: [],
});

export const calculateAngle = (a, b, c) => {
  const vecA = {
    x: a.x - b.x,
    y: a.y - b.y,
    z: (a.z ?? 0) - (b.z ?? 0),
  };
  const vecB = {
    x: c.x - b.x,
    y: c.y - b.y,
    z: (c.z ?? 0) - (b.z ?? 0),
  };

  const dot = vecA.x * vecB.x + vecA.y * vecB.y + vecA.z * vecB.z;
  const magA = Math.hypot(vecA.x, vecA.y, vecA.z);
  const magB = Math.hypot(vecB.x, vecB.y, vecB.z);

  if (!magA || !magB) return 0;

  const cosA = clamp(dot / (magA * magB), -1, 1);
  return (Math.acos(cosA) * 180) / Math.PI;
};

export const readSnapshot = (repState) => ({
  angle: round(repState.smoothedAngle ?? 0, 1),
  secondaryAngle: round(repState.smoothedSecondaryAngle ?? 0, 1),
  spineAngle: round(repState.smoothedSpineAngle ?? 0, 1),
  reps: repState.reps,
  stage: repState.stage,
  formScore: repState.formScore,
  formFeedback: repState.formFeedback,
  formWarnings: [...repState.formWarnings],
  fatigueWarning: repState.fatigueWarning,
  velocity: round(repState.lastVelocity, 3),
  isCalibrating: repState.isCalibrating,
  lastEccentricDuration: repState.lastEccentricDuration,
  lastConcentricDuration: repState.lastConcentricDuration,
  estimated1RM: repState.estimated1RM,
  bilateralAngles: { ...repState.bilateralSmoothedAngles },
  timeSeriesLog: repState.timeSeriesLog,
  barPath: repState.barPath,
  baselineGhostCurve: repState.baselineGhostCurve,
});

export const countRep = ({
  exerciseKey,
  angle,
  secondaryAngle = null,
  bilateralAngles = {},
  bilateralThresholdPct = 10,
  spineAngle = null,
  spineLeanLimit = 45,
  movingJointPoint = null,
  shoulderY,
  wristY,
  repState,
}) => {
  const cfg = EXERCISE_MAP[exerciseKey] || EXERCISE_MAP.bicep_curl;
  const now = Date.now();
  const warnings = [];
  let formFeedback = "";
  let repCounted = false;
  let strictPenaltyAppliedThisFrame = false;
  let bilateralPenaltyAppliedThisFrame = false;

  updateBarPath(repState, now, movingJointPoint);

  if (repState.prevAngle !== null) {
    const delta = Math.abs(angle - repState.prevAngle);
    if (delta > ANGLE_SPIKE_THRESHOLD) {
      repState.prevAngle = angle;
      repState.formFeedback = "Stabilizing...";
      repState.formWarnings = ["stabilizing"];
      appendTimeSeries(repState, now);
      return {
        ...readSnapshot(repState),
        repCounted: false,
      };
    }
  }
  repState.prevAngle = angle;

  const previousSmoothedAngle = repState.smoothedAngle;
  repState.smoothedAngle =
    repState.smoothedAngle === null
      ? angle
      : angle * ANGLE_EMA_ALPHA + repState.smoothedAngle * (1 - ANGLE_EMA_ALPHA);
  const smoothedAngle = repState.smoothedAngle;
  if (repState.isCalibrating) {
    repState.currentCalibrationCurve.push(smoothedAngle);
  }

  if (typeof secondaryAngle === "number") {
    repState.smoothedSecondaryAngle =
      repState.smoothedSecondaryAngle === null
        ? secondaryAngle
        : secondaryAngle * SECONDARY_EMA_ALPHA +
          repState.smoothedSecondaryAngle * (1 - SECONDARY_EMA_ALPHA);
  }

  if (typeof spineAngle === "number") {
    repState.smoothedSpineAngle =
      repState.smoothedSpineAngle === null
        ? spineAngle
        : spineAngle * SECONDARY_EMA_ALPHA + repState.smoothedSpineAngle * (1 - SECONDARY_EMA_ALPHA);
  }

  const smoothedBilateralAngles = updateBilateralSmoothedAngles(repState, bilateralAngles);

  if (repState.lastFrameTimestamp !== null && previousSmoothedAngle !== null) {
    const dt = (now - repState.lastFrameTimestamp) / 1000;
    repState.lastVelocity = calculateAngularVelocity(smoothedAngle, previousSmoothedAngle, dt);
  } else {
    repState.lastVelocity = 0;
  }
  repState.lastFrameTimestamp = now;

  const deltaSmoothedAngle =
    previousSmoothedAngle === null ? 0 : smoothedAngle - previousSmoothedAngle;
  if (isConcentricMotion(cfg.mode, deltaSmoothedAngle)) {
    repState.currentRepPeakConcentricVelocity = Math.max(
      repState.currentRepPeakConcentricVelocity,
      Math.abs(repState.lastVelocity)
    );
  }

  if (repState.stage) {
    repState.phaseVelocitySum += Math.abs(repState.lastVelocity);
    repState.phaseVelocityCount += 1;
  }

  updateRomWindow(repState, smoothedAngle);

  if (typeof repState.smoothedSecondaryAngle === "number") {
    if (repState.calibratedSecondaryNeutral === null) {
      repState.calibratedSecondaryNeutral = repState.smoothedSecondaryAngle;
    } else if (repState.isCalibrating) {
      repState.calibratedSecondaryNeutral =
        repState.smoothedSecondaryAngle * 0.12 + repState.calibratedSecondaryNeutral * 0.88;
    }

    const strictDeviation = cfg.strict_form_max_deviation ?? 15;
    const deviation = Math.abs(repState.smoothedSecondaryAngle - repState.calibratedSecondaryNeutral);
    const curlSwingLimit = cfg.mode === "curl" ? 15 : strictDeviation;
    if (deviation > curlSwingLimit && !repState.strictPenaltyApplied) {
      const penalty = cfg.strict_form_penalty ?? 12;
      repState.formScore = clamp(repState.formScore - penalty, 0, 100);
      repState.strictPenaltyApplied = true;
      strictPenaltyAppliedThisFrame = true;
      warnings.push("strict_form");
      formFeedback = cfg.mode === "curl" ? "Keep your elbows tucked!" : "Strict form violation";
    }
  }

  if (
    cfg.mode === "squat" &&
    Number.isFinite(repState.smoothedSpineAngle) &&
    repState.smoothedSpineAngle > spineLeanLimit &&
    !repState.strictPenaltyApplied
  ) {
    const penalty = cfg.strict_form_penalty ?? 12;
    repState.formScore = clamp(repState.formScore - penalty, 0, 100);
    repState.strictPenaltyApplied = true;
    strictPenaltyAppliedThisFrame = true;
    warnings.push("strict_form");
    formFeedback = formFeedback || "Torso lean too high!";
  }

  const imbalanceResult = evaluateBilateralImbalance(
    repState,
    smoothedBilateralAngles,
    bilateralThresholdPct,
    warnings
  );
  if (imbalanceResult.triggered) {
    bilateralPenaltyAppliedThisFrame = true;
    formFeedback = formFeedback || imbalanceResult.feedback;
  }

  const thresholds = resolveThresholds(cfg, repState);
  const canCountRep = () => now - repState.lastRepTime > REP_COOLDOWN_MS;

  const setStage = (nextStage) => {
    const previousStage = repState.stage;
    if (previousStage === nextStage) return;

    const transitionFeedback = processStageTransition({
      repState,
      mode: cfg.mode,
      previousStage,
      nextStage,
      now,
      cfg,
      warnings,
    });
    if (!formFeedback && transitionFeedback) formFeedback = transitionFeedback;
    repState.stage = nextStage;
  };

  const registerRep = () => {
    repState.reps += 1;
    repState.lastRepTime = now;
    repState.spamTimes.push(now);
    if (repState.spamTimes.length > MAX_SPAM_TIMES) {
      repState.spamTimes = repState.spamTimes.slice(-MAX_SPAM_TIMES);
    }

    const actualRom = Math.max(
      0,
      (repState.romMax ?? smoothedAngle) - (repState.romMin ?? smoothedAngle)
    );
    repState.formScore = computeFormScore(actualRom, cfg.ideal_rom, cfg.rom_tolerance ?? 15);

    if (repState.strictPenaltyApplied || strictPenaltyAppliedThisFrame) {
      repState.formScore = clamp(
        repState.formScore - (cfg.strict_form_penalty ?? 12),
        0,
        100
      );
    }
    if (repState.bilateralPenaltyApplied || bilateralPenaltyAppliedThisFrame) {
      repState.formScore = clamp(repState.formScore - 10, 0, 100);
    }

    const repPeakVelocity = repState.currentRepPeakConcentricVelocity;
    if (repPeakVelocity > 0) {
      repState.peakConcentricVelocities.push(repPeakVelocity);
      if (repState.baselineConcentricVelocity === null) {
        repState.baselineConcentricVelocity = repPeakVelocity;
      } else if (repPeakVelocity < repState.baselineConcentricVelocity * FATIGUE_WARNING_RATIO) {
        repState.fatigueWarning = true;
        warnings.push("fatigue");
      }

      repState.estimated1RM = estimate1RMFromVelocity(
        repPeakVelocity,
        repState.baselineConcentricVelocity ?? repPeakVelocity
      );
    }

    if (repState.isCalibrating) {
      repState.baselineGhostCurve = [...repState.currentCalibrationCurve];
      applyCalibration(cfg, repState);
    }
    repState.currentCalibrationCurve = [];

    resetRomWindow(repState, smoothedAngle);
    repState.strictPenaltyApplied = false;
    repState.bilateralPenaltyApplied = false;
    repState.currentRepPeakConcentricVelocity = 0;
    repCounted = true;
  };

  const maybeCount = () => {
    if (!canCountRep()) return;
    if (repSpamDetected(repState.spamTimes)) {
      repState.stage = null;
      formFeedback = "Slow down - checking form";
      warnings.push("pace");
      return;
    }
    registerRep();
  };

  if (exerciseKey === "pushups") {
    if (Math.abs(shoulderY - wristY) < 0.05) {
      formFeedback = formFeedback || "Get into pushup position";
      warnings.push("position");
    } else {
      if (smoothedAngle > thresholds.up_angle) setStage("up");
      if (smoothedAngle < thresholds.down_angle && repState.stage === "up") setStage("down");
      if (smoothedAngle > thresholds.up_angle && repState.stage === "down") {
        maybeCount();
        if (repCounted) setStage("up");
      }
    }
  } else if (cfg.mode === "squat") {
    if (smoothedAngle > thresholds.up_angle) setStage("up");
    if (smoothedAngle < thresholds.down_angle && repState.stage === "up") {
      setStage("down");
      maybeCount();
    }
  } else if (cfg.mode === "curl") {
    if (smoothedAngle > thresholds.down_angle) setStage("down");
    if (smoothedAngle < thresholds.up_angle && repState.stage === "down") {
      setStage("up");
      maybeCount();
    }
  } else if (cfg.mode === "press") {
    if (smoothedAngle < thresholds.down_angle) setStage("down");
    if (smoothedAngle > thresholds.up_angle && repState.stage === "down") {
      setStage("up");
      maybeCount();
    }
  } else if (cfg.mode === "raise") {
    if (smoothedAngle < thresholds.down_angle) setStage("down");
    if (smoothedAngle > thresholds.up_angle && repState.stage === "down") {
      setStage("up");
      maybeCount();
    }
    if (smoothedAngle < thresholds.down_angle && repState.stage === "up") setStage("down");
  } else if (cfg.mode === "hinge") {
    // Deadlift: straight = up (>up_angle), bent forward = down (<down_angle)
    if (smoothedAngle > thresholds.up_angle) setStage("up");
    if (smoothedAngle < thresholds.down_angle && repState.stage === "up") {
      setStage("down");
      maybeCount();
    }
  }

  if (!formFeedback) {
    if (repState.formScore < 65) {
      formFeedback = "Increase range of motion";
      warnings.push("rom");
    } else if (repState.formScore < 80) {
      formFeedback = "Go a bit deeper";
      warnings.push("rom");
    } else if (repState.fatigueWarning) {
      formFeedback = "Fatigue detected - reduce load";
      warnings.push("fatigue");
    }
  }

  repState.formFeedback = formFeedback;
  repState.formWarnings = [...new Set(warnings)];

  appendTimeSeries(repState, now);

  return {
    ...readSnapshot(repState),
    repCounted,
  };
};
