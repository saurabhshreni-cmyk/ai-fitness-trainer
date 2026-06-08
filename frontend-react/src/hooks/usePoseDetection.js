import { useCallback, useEffect, useRef, useState } from "react";
import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
import {
  calculateAngle,
  countRep,
  createInitialRepState,
  readSnapshot as readRepSnapshot,
} from "../utils/angleCalculator";
import { MODEL_COMPLEXITY } from "../constants";
import { VISIBILITY_THRESHOLD } from "../utils/exercises";
import {
  EXERCISE_LANDMARKS,
  LANDMARK_INDEX,
  calculateSpineAngle,
  resolveMovingJointPoint,
} from "../utils/landmarks";

/**
 * Draws a short-lived neon trajectory trail for the tracked moving joint.
 * Uses ref-backed data only to keep the render hot path outside React state.
 */
const drawTrajectoryPath = (ctx, barPath, width, height, warningActive) => {
  if (!Array.isArray(barPath) || barPath.length < 2) return;

  const baseColor = warningActive ? "255,112,67" : "0,255,200";

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = warningActive ? 18 : 22;
  ctx.shadowColor = `rgba(${baseColor},0.85)`;

  for (let i = 1; i < barPath.length; i += 1) {
    const prev = barPath[i - 1];
    const next = barPath[i];
    if (!prev || !next) continue;

    const progress = i / (barPath.length - 1);
    const alpha = 0.15 + progress * 0.85;
    ctx.strokeStyle = `rgba(${baseColor},${alpha.toFixed(3)})`;
    ctx.lineWidth = 1.5 + progress * 2.5;

    ctx.beginPath();
    ctx.moveTo(prev.x * width, prev.y * height);
    ctx.lineTo(next.x * width, next.y * height);
    ctx.stroke();
  }

  ctx.restore();
};

const DISPLAY_DEFAULTS = {
  angle: 0,
  reps: 0,
  stage: null,
  formScore: 100,
  formFeedback: "",
  formWarnings: [],
  poseConf: null,
  fatigueWarning: false,
};

const snapEquals = (a, b) =>
  a.angle === b.angle &&
  a.reps === b.reps &&
  a.stage === b.stage &&
  a.formScore === b.formScore &&
  a.formFeedback === b.formFeedback &&
  a.poseConf === b.poseConf &&
  a.fatigueWarning === b.fatigueWarning &&
  a.formWarnings.length === b.formWarnings.length &&
  a.formWarnings.every((v, i) => v === b.formWarnings[i]);

export default function usePoseDetection({
  webcamRef,
  canvasRef,
  cameraReady,
  exercise,
  isRunning,
  countdownActive,
}) {
  const [poseState, setPoseState] = useState(DISPLAY_DEFAULTS);
  // Model lifecycle: "loading" (fetching WASM) → "ready" (first frame in) → "error".
  const [modelStatus, setModelStatus] = useState("loading");

  const displayRef = useRef(DISPLAY_DEFAULTS);
  const repState = useRef(createInitialRepState());
  const currentStateRef = useRef(DISPLAY_DEFAULTS);

  // Instances + flags for safe teardown (Stop Session).
  const cameraRef = useRef(null);
  const poseRef = useRef(null);
  const stoppedRef = useRef(false);
  const gotResultsRef = useRef(false);

  const exerciseRef = useRef(exercise);
  const isRunningRef = useRef(isRunning);
  const countdownRef = useRef(countdownActive);

  useEffect(() => {
    exerciseRef.current = exercise;
  }, [exercise]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    countdownRef.current = countdownActive;
  }, [countdownActive]);

  const updateDisplay = useCallback((patch) => {
    displayRef.current = { ...displayRef.current, ...patch };
  }, []);

  const resetPoseState = useCallback((feedback = "") => {
    repState.current = createInitialRepState();
    displayRef.current = {
      ...DISPLAY_DEFAULTS,
      formFeedback: feedback,
    };
  }, []);

  /**
   * Fully tears down the camera + MediaPipe pipeline. Safe to call repeatedly
   * and even if things are already stopped (all teardown is guarded).
   */
  const stopDetection = useCallback(() => {
    stoppedRef.current = true;
    try {
      cameraRef.current?.stop();
    } catch {
      /* camera already stopped */
    }
    try {
      poseRef.current?.close();
    } catch {
      /* pose already closed */
    }
    cameraRef.current = null;
    poseRef.current = null;
  }, []);

  const onResults = useCallback(
    (results) => {
      if (stoppedRef.current) return; // session stopped — ignore any in-flight frame

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const videoEl = webcamRef.current?.video;
      // Keep the canvas drawing buffer matched to the live camera resolution so
      // the skeleton overlay stays aligned and the feed isn't distorted.
      if (videoEl && videoEl.videoWidth && canvas.width !== videoEl.videoWidth) {
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
      }
      const width = canvas.width;
      const height = canvas.height;

      if (!gotResultsRef.current) {
        gotResultsRef.current = true;
        setModelStatus("ready");
      }

      try {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const src = videoEl && videoEl.readyState >= 2 ? videoEl : results.image;
        if (src) ctx.drawImage(src, 0, 0, width, height);

        if (!results.poseLandmarks) {
          ctx.restore();
          return;
        }

        const liveSnapshot = readRepSnapshot(repState.current);
        const warningActive =
          Boolean(liveSnapshot?.fatigueWarning) ||
          Boolean(liveSnapshot?.formWarnings?.length);
        const connectorColor = warningActive ? "#FF7043" : "#00FF88";
        const landmarkColor = warningActive ? "#FFD180" : "#00E5FF";

        drawTrajectoryPath(ctx, liveSnapshot?.barPath || [], width, height, warningActive);

        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: connectorColor,
          lineWidth: 4,
        });
        drawLandmarks(ctx, results.poseLandmarks, {
          color: landmarkColor,
          lineWidth: 2,
        });

        ctx.restore();

        if (!isRunningRef.current || countdownRef.current) return;

        try {
          const imgData = ctx.getImageData(0, 0, 32, 32);
          const brightness =
            imgData.data
              .filter((_, index) => index % 4 !== 3)
              .reduce((sum, value) => sum + value, 0) /
            (32 * 32 * 3);
          if (brightness < 15) {
            updateDisplay({ formFeedback: "Too dark - improve lighting" });
            return;
          }
        } catch {
          // Ignore getImageData issues from browser/canvas permissions.
        }

        const lm = results.poseLandmarks;
        const getLM = (name) => lm[LANDMARK_INDEX[name]];
        const angleLandmarks =
          EXERCISE_LANDMARKS[exerciseRef.current] || EXERCISE_LANDMARKS.bicep_curl;
        const basePrimaryTriplet = angleLandmarks.primary;
        const baseSecondaryTriplet = angleLandmarks.secondary;

        let side = "left";
        if (["squats", "lunges"].includes(exerciseRef.current)) {
          const leftKnee = getLM("left_knee").visibility;
          const rightKnee = getLM("right_knee").visibility;
          side = rightKnee > leftKnee ? "right" : "left";
        } else if (exerciseRef.current === "pushups") {
          const leftShoulderZ = getLM("left_shoulder").z;
          const rightShoulderZ = getLM("right_shoulder").z;
          side = rightShoulderZ < leftShoulderZ ? "right" : "left";
        } else {
          const leftWristY = getLM("left_wrist").y;
          const rightWristY = getLM("right_wrist").y;
          if (rightWristY < leftWristY - 0.05) side = "right";
          else if (leftWristY < rightWristY - 0.05) side = "left";
          else {
            side =
              getLM("left_shoulder").visibility >= getLM("right_shoulder").visibility
                ? "left"
                : "right";
          }
        }

        const activePrimaryTriplet = basePrimaryTriplet.map((name) =>
          side === "right" ? name.replace("left_", "right_") : name
        );
        const activeSecondaryTriplet = baseSecondaryTriplet.map((name) =>
          side === "right" ? name.replace("left_", "right_") : name
        );
        const [p1, p2, p3] = activePrimaryTriplet.map((name) => getLM(name));
        const [s1, s2, s3] = activeSecondaryTriplet.map((name) => getLM(name));
        const spineShoulderNames = angleLandmarks.spine?.shoulders || [];
        const spineHipNames = angleLandmarks.spine?.hips || [];
        const spineShoulders = {
          left: spineShoulderNames[0] ? getLM(spineShoulderNames[0]) : null,
          right: spineShoulderNames[1] ? getLM(spineShoulderNames[1]) : null,
        };
        const spineHips = {
          left: spineHipNames[0] ? getLM(spineHipNames[0]) : null,
          right: spineHipNames[1] ? getLM(spineHipNames[1]) : null,
        };

        const requiredLandmarks = [
          p1,
          p2,
          p3,
          s1,
          s2,
          s3,
          spineShoulders.left,
          spineShoulders.right,
          spineHips.left,
          spineHips.right,
        ].filter(Boolean);

        const allStrong =
          requiredLandmarks.length > 0 &&
          requiredLandmarks.every((point) => (point.visibility ?? 0) > 0.7);
        const anyWeak = requiredLandmarks.some(
          (point) => (point.visibility ?? 0) < VISIBILITY_THRESHOLD
        );

        updateDisplay({ poseConf: allStrong ? "STRONG" : anyWeak ? "WEAK" : null });

        if (anyWeak) {
          updateDisplay({ formFeedback: "Adjust Camera" });
          return;
        }

        const primaryAngle = calculateAngle(p1, p2, p3);
        const secondaryAngle = calculateAngle(s1, s2, s3);
        const spineAngle = calculateSpineAngle(spineShoulders, spineHips);

        const bilateralConfig = angleLandmarks.bilateral || {};
        const bilateralAngles = {};
        Object.entries(bilateralConfig).forEach(([key, triplet]) => {
          if (!Array.isArray(triplet) || triplet.length !== 3) return;
          const [b1, b2, b3] = triplet.map((name) => getLM(name));
          if (!b1 || !b2 || !b3) return;
          bilateralAngles[key] = calculateAngle(b1, b2, b3);
        });

        const movingJointPoint = resolveMovingJointPoint(
          angleLandmarks.movingJoint,
          getLM,
          side
        );

        const repResult = countRep({
          exerciseKey: exerciseRef.current,
          angle: primaryAngle,
          secondaryAngle,
          bilateralAngles,
          bilateralThresholdPct: bilateralConfig.imbalance_threshold_pct ?? 10,
          spineAngle,
          spineLeanLimit: angleLandmarks.spine?.lean_limit ?? 45,
          movingJointPoint,
          shoulderY: p1.y,
          wristY: p3.y,
          repState: repState.current,
        });

        updateDisplay({
          angle: repResult.angle,
          reps: repResult.reps,
          stage: repResult.stage,
          formScore: repResult.formScore,
          formFeedback: repResult.formFeedback,
          formWarnings: repResult.formWarnings,
          fatigueWarning: repResult.fatigueWarning,
        });
      } catch {
        try {
          canvasRef.current?.getContext("2d")?.restore();
        } catch {
          // noop
        }
      }
    },
    [canvasRef, updateDisplay, webcamRef]
  );

  useEffect(() => {
    if (!cameraReady) return undefined;
    const video = webcamRef.current?.video;
    if (!video) return undefined;

    const CDN_SOURCES = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/pose',
      'https://unpkg.com/@mediapipe/pose',
    ];

    let pose = null;
    let camera = null;
    let cancelled = false;

    // Fresh start: clear stop flags and surface the loading state.
    stoppedRef.current = false;
    gotResultsRef.current = false;
    setModelStatus("loading");

    // If no frame is processed within the window, treat the model as failed
    // (CDN unreachable / WASM blocked) so the UI can show a clear message.
    const loadTimer = setTimeout(() => {
      if (!cancelled && !gotResultsRef.current) setModelStatus("error");
    }, 15000);

    const tryLoadPose = async () => {
      let workingCdn = null;

      for (let i = 0; i < CDN_SOURCES.length; i++) {
        if (cancelled) return;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 6000);
          const res = await fetch(
            `${CDN_SOURCES[i]}/pose_solution_packed_assets_loader.js`,
            { method: 'HEAD', signal: ctrl.signal }
          );
          clearTimeout(timer);
          if (res.ok) { workingCdn = CDN_SOURCES[i]; break; }
        } catch {
          // try next CDN
        }
      }

      if (cancelled) return;

      const locateCdn = workingCdn || CDN_SOURCES[0];
      pose = new Pose({
        locateFile: (file) => `${locateCdn}/${file}`,
      });
      poseRef.current = pose;

      pose.setOptions({
        modelComplexity: MODEL_COMPLEXITY,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      pose.onResults(onResults);

      if (cancelled) { pose.close(); poseRef.current = null; return; }

      camera = new Camera(video, {
        onFrame: async () => {
          if (cancelled || stoppedRef.current || !poseRef.current) return;
          try {
            await pose.send({ image: video });
          } catch {
            /* transient send failure — next frame retries */
          }
        },
        width: 640,
        height: 480,
      });
      cameraRef.current = camera;
      camera.start();
    };

    tryLoadPose().catch(() => {
      if (!cancelled) setModelStatus("error");
    });

    return () => {
      cancelled = true;
      clearTimeout(loadTimer);
      try { camera?.stop(); } catch { /* already stopped */ }
      try { pose?.close(); } catch { /* already closed */ }
      cameraRef.current = null;
      poseRef.current = null;
    };
  }, [cameraReady, onResults, webcamRef]);

  useEffect(() => {
    let rafId = null;
    let lastFlush = 0;

    const syncToReact = (timestamp) => {
      if (timestamp - lastFlush >= 33) {
        lastFlush = timestamp;
        const next = displayRef.current;
        const prev = currentStateRef.current;
        if (!snapEquals(prev, next)) {
          const snapshot = {
            ...next,
            formWarnings: [...next.formWarnings],
          };
          currentStateRef.current = snapshot;
          setPoseState(snapshot);
        }
      }
      rafId = requestAnimationFrame(syncToReact);
    };

    rafId = requestAnimationFrame(syncToReact);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    resetPoseState();
  }, [exercise, resetPoseState]);

  const readSnapshot = useCallback(() => readRepSnapshot(repState.current), []);

  return {
    ...poseState,
    modelStatus,
    repState,
    resetPoseState,
    stopDetection,
    readSnapshot,
  };
}
