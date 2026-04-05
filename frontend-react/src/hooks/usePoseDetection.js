import { useEffect, useRef, useCallback } from "react";
import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
import {
  CAMERA_WIDTH, CAMERA_HEIGHT, MODEL_COMPLEXITY, PROCESS_EVERY_N,
} from "../constants";
import { LANDMARK_INDEX, EXERCISE_LANDMARKS } from "../utils/landmarks";
import { detectSide, remapTriplet } from "../utils/sideDetection";
import { calculateAngle, countRep } from "../utils/angleCalculator";

/**
 * High-performance pose detection hook.
 *
 * KEY DESIGN: The hot path (30fps) uses ONLY refs — zero React state updates.
 * A separate rAF loop reads refs and pushes to React state at a capped UI_FPS.
 * This eliminates the #1 bottleneck: 30fps × 6 setState = 180 re-renders/sec.
 *
 * Architecture:
 *   Camera (30fps) → MediaPipe → onResults → refs (instant, no render)
 *                                                ↓
 *   rAF loop (10fps) reads refs → single batched setState → UI renders
 */
export default function usePoseDetection({
  webcamRef,
  canvasRef,
  cameraReady,
  exerciseRef,    // useRef — NOT state, so callback never recreates
  isRunningRef,
  isCountdownActive,
  onSnapshot,     // called at UI_FPS rate with batched data
}) {
  // ── Hot-path refs (NEVER trigger renders) ─────────────────────────
  const repState   = useRef({ reps: 0, stage: null, lastRepTime: 0 });
  const poseConf   = useRef(null);
  const lastAngle  = useRef(0);
  const frameCount = useRef(0);
  const ctxRef     = useRef(null); // cache canvas context

  // Reset rep state when exercise changes (driven by parent via ref)
  const lastExercise = useRef(null);

  const onResults = useCallback((results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cache context — don't call getContext every frame
    if (!ctxRef.current) ctxRef.current = canvas.getContext("2d");
    const ctx = ctxRef.current;
    const W = canvas.width;
    const H = canvas.height;

    // Clear previous skeleton
    ctx.clearRect(0, 0, W, H);

    if (!results.poseLandmarks) {
      poseConf.current = null;
      return;
    }

    // Draw skeleton (this is cheap — ~0.5ms)
    ctx.save();
    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS,
      { color: "#00FF00", lineWidth: 3 });
    drawLandmarks(ctx, results.poseLandmarks,
      { color: "#FF0000", lineWidth: 1, radius: 3 });
    ctx.restore();

    if (!isRunningRef.current || isCountdownActive()) return;

    const exercise = exerciseRef.current;

    // Reset if exercise changed
    if (lastExercise.current !== exercise) {
      repState.current = { reps: 0, stage: null, lastRepTime: 0 };
      lastExercise.current = exercise;
    }

    // ── Frame skipping: process every Nth frame for CPU savings ────
    frameCount.current++;
    if (frameCount.current % PROCESS_EVERY_N !== 0) return;

    // ── Extract joints ──────────────────────────────────────────────
    const lm = results.poseLandmarks;
    const getLM = (name) => lm[LANDMARK_INDEX[name]];

    const baseTriplet = EXERCISE_LANDMARKS[exercise] || EXERCISE_LANDMARKS.bicep_curl;
    const side = detectSide(lm, exercise);
    const activeTriplet = remapTriplet(baseTriplet, side);
    const [p1, p2, p3] = activeTriplet.map(n => getLM(n));

    // Pose confidence
    const allStrong = p1.visibility > 0.65 && p2.visibility > 0.65 && p3.visibility > 0.65;
    const anyWeak = p1.visibility < 0.45 || p2.visibility < 0.45 || p3.visibility < 0.45;
    poseConf.current = allStrong ? "STRONG" : anyWeak ? "WEAK" : null;

    if (anyWeak) return; // skip angle calc if joints are weak

    // ── Angle + rep counting (pure math, ~0.1ms) ────────────────────
    const angle = calculateAngle(p1, p2, p3);
    lastAngle.current = Math.round(angle);

    const newState = countRep(angle, exercise, repState.current);
    repState.current = newState;
  }, [canvasRef, isRunningRef, isCountdownActive, exerciseRef]);

  // ── MediaPipe setup ───────────────────────────────────────────────
  useEffect(() => {
    if (!cameraReady) return;
    const video = webcamRef.current?.video;
    if (!video) return;

    const pose = new Pose({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
    });
    pose.setOptions({
      modelComplexity: MODEL_COMPLEXITY,  // 0 = lite = fastest
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

    return () => { camera.stop(); pose.close(); ctxRef.current = null; };
  }, [cameraReady, onResults, webcamRef]);

  // ── Snapshot reader: called by parent's rAF loop ──────────────────
  // Returns current ref values without triggering any renders
  const readSnapshot = useCallback(() => ({
    angle:    lastAngle.current,
    reps:     repState.current.reps,
    stage:    repState.current.stage,
    poseConf: poseConf.current,
    counted:  repState.current.counted,
  }), []);

  const resetRepState = useCallback(() => {
    repState.current = { reps: 0, stage: null, lastRepTime: 0 };
    lastAngle.current = 0;
  }, []);

  return { readSnapshot, resetRepState };
}
