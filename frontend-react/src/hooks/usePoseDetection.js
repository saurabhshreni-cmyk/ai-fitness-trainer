import { useEffect, useRef, useCallback, useState } from "react";
import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
import { CAMERA_WIDTH, CAMERA_HEIGHT } from "../constants";
import { LANDMARK_INDEX, EXERCISE_LANDMARKS } from "../utils/landmarks";
import { detectSide, remapTriplet } from "../utils/sideDetection";
import { calculateAngle, countRep } from "../utils/angleCalculator";

/**
 * MediaPipe Pose detection hook.
 *
 * Angle calculation + rep counting run ENTIRELY client-side at camera framerate.
 * No HTTP calls in the hot path — zero network lag.
 */
export default function usePoseDetection({
  webcamRef,
  canvasRef,
  cameraReady,
  exercise,
  isRunningRef,
  isCountdownActive,
  onResult,
}) {
  const [poseConf, setPoseConf] = useState(null);

  // Rep counter state (client-side, no network)
  const repState = useRef({ reps: 0, stage: null, lastRepTime: 0 });

  // Reset rep state when exercise changes
  useEffect(() => {
    repState.current = { reps: 0, stage: null, lastRepTime: 0 };
  }, [exercise]);

  const onResults = useCallback((results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    // Clear previous skeleton — canvas is transparent, video shows through
    ctx.clearRect(0, 0, W, H);

    if (!results.poseLandmarks) return;

    // Draw skeleton overlay
    ctx.save();
    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS,
      { color: "#00FF00", lineWidth: 4 });
    drawLandmarks(ctx, results.poseLandmarks,
      { color: "#FF0000", lineWidth: 2 });
    ctx.restore();

    if (!isRunningRef.current || isCountdownActive()) return;

    // ── Extract joints ──────────────────────────────────────────────
    const lm = results.poseLandmarks;
    const getLM = (name) => lm[LANDMARK_INDEX[name]];

    const baseTriplet = EXERCISE_LANDMARKS[exercise] || EXERCISE_LANDMARKS.bicep_curl;
    const side = detectSide(lm, exercise);
    const activeTriplet = remapTriplet(baseTriplet, side);
    const [p1, p2, p3] = activeTriplet.map(n => getLM(n));

    // Pose confidence
    const allStrong = p1.visibility > 0.7 && p2.visibility > 0.7 && p3.visibility > 0.7;
    const anyWeak = p1.visibility < 0.5 || p2.visibility < 0.5 || p3.visibility < 0.5;
    setPoseConf(allStrong ? "STRONG" : anyWeak ? "WEAK" : null);

    if (anyWeak) {
      onResult({ feedback: "Adjust position — ensure joints are visible" });
      return;
    }

    // ── CLIENT-SIDE angle calculation (instant, no HTTP) ─────────────
    const angle = calculateAngle(p1, p2, p3);

    // ── CLIENT-SIDE rep counting (instant, no HTTP) ──────────────────
    const newState = countRep(angle, exercise, repState.current);
    repState.current = newState;

    let feedback = "";
    if (newState.counted) {
      feedback = "Good Rep!";
    }

    onResult({
      angle: Math.round(angle * 10) / 10,
      reps: newState.reps,
      stage: newState.stage,
      feedback,
    });
  }, [exercise, canvasRef, isRunningRef, isCountdownActive, onResult]);

  // ── MediaPipe setup ───────────────────────────────────────────────
  useEffect(() => {
    if (!cameraReady) return;
    const video = webcamRef.current?.video;
    if (!video) return;

    const pose = new Pose({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    pose.onResults(onResults);

    const camera = new Camera(video, {
      onFrame: async () => { await pose.send({ image: video }); },
      width: CAMERA_WIDTH,
      height: CAMERA_HEIGHT,
    });
    camera.start();

    return () => { camera.stop(); pose.close(); };
  }, [cameraReady, onResults, webcamRef]);

  // Expose a reset function for exercise changes
  const resetRepState = useCallback(() => {
    repState.current = { reps: 0, stage: null, lastRepTime: 0 };
  }, []);

  return { poseConf, resetRepState };
}
