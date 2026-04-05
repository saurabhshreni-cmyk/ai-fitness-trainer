import React, { useRef, useState, useCallback, useEffect } from "react";
import Webcam from "react-webcam";

import "./styles/variables.css";
import "./index.css";
import "./App.css";

import useCountdown from "./hooks/useCountdown";
import useWorkout from "./hooks/useWorkout";
import useKeyboard from "./hooks/useKeyboard";
import usePoseDetection from "./hooks/usePoseDetection";
import useSpeech from "./hooks/useSpeech";

import { CAMERA_WIDTH, CAMERA_HEIGHT, UI_FPS, REST_AFTER } from "./constants";
import ExerciseSelector from "./components/ExerciseSelector";
import ControlPanel from "./components/ControlPanel";
import StatsDisplay from "./components/StatsDisplay";
import ScoreBoard from "./components/ScoreBoard";
import WorkoutSummary from "./components/WorkoutSummary";
import Onboarding from "./components/Onboarding";

function genUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * PERFORMANCE ARCHITECTURE:
 *
 * Hot path (30fps): Camera → MediaPipe → onResults → useRef (zero renders)
 * UI path (10fps):  rAF loop reads refs → single batched setState → render
 *
 * This means pose detection NEVER causes React re-renders.
 * UI updates at a controlled 10fps — smooth enough for human eyes,
 * 3x less CPU than updating every frame.
 */
export default function App() {
  const webcamRef  = useRef(null);
  const canvasRef  = useRef(null);
  const exerciseRef = useRef("bicep_curl");

  const [cameraReady, setCameraReady] = useState(false);
  const [warmingUp,   setWarmingUp]   = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem("ai_trainer_onboarded")
  );

  // ── Single batched UI state (updated at UI_FPS, not 30fps) ────────
  const [ui, setUi] = useState({
    angle: 0, reps: 0, stage: null, poseConf: null,
    feedback: "", restSecs: null, repSpeed: null,
  });

  // Refs for hot-path tracking (no renders)
  const isRunningRef     = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const prevRepsRef      = useRef(0);
  const lastRepTimeRef   = useRef(null);
  const repTimestampsRef = useRef([]);
  const bestRepsRef      = useRef(
    JSON.parse(localStorage.getItem("ai_trainer_best_reps")) || {}
  );
  const [bestReps, setBestReps] = useState(bestRepsRef.current);

  // Keep ref in sync
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  const { speak } = useSpeech();

  // ── Hooks ─────────────────────────────────────────────────────────

  const {
    exercise, sets, showSummary, workoutStartRef,
    startWorkout, recordSet, endWorkout, closeSummary, changeExercise,
  } = useWorkout("bicep_curl");

  // Keep exerciseRef in sync (so pose detection callback never recreates)
  useEffect(() => { exerciseRef.current = exercise; }, [exercise]);

  const { countdown, runCountdown, isCountdownActive } = useCountdown();

  const { readSnapshot, resetRepState } = usePoseDetection({
    webcamRef, canvasRef, cameraReady,
    exerciseRef, isRunningRef, isCountdownActive,
  });

  // ── Controlled UI update loop (rAF capped at UI_FPS) ──────────────
  // This is THE ONLY place React state gets updated from pose data.
  // Runs at 10fps instead of 30fps = 3x fewer renders.
  useEffect(() => {
    const interval = 1000 / UI_FPS;
    let lastTick = 0;
    let rafId;

    const tick = (now) => {
      rafId = requestAnimationFrame(tick);
      if (now - lastTick < interval) return;
      lastTick = now;

      if (!isRunningRef.current) return;

      const snap = readSnapshot();
      let feedback = "";
      let repSpeed = null;

      // Rep detection
      if (snap.reps > prevRepsRef.current) {
        speak("Good rep!");
        feedback = "Good Rep!";

        const t = Date.now();
        repTimestampsRef.current.push(t);
        if (repTimestampsRef.current.length > 10) repTimestampsRef.current.shift();
        if (repTimestampsRef.current.length >= 2) {
          const arr = repTimestampsRef.current;
          repSpeed = (arr[arr.length - 1] - arr[arr.length - 2]) / 1000;
        }

        lastRepTimeRef.current = t;

        // Update best reps
        if (snap.reps > (bestRepsRef.current[exercise] || 0)) {
          bestRepsRef.current = { ...bestRepsRef.current, [exercise]: snap.reps };
          localStorage.setItem("ai_trainer_best_reps", JSON.stringify(bestRepsRef.current));
          setBestReps(bestRepsRef.current);
        }
      }
      prevRepsRef.current = snap.reps;

      // Rest timer
      let restSecs = null;
      if (lastRepTimeRef.current) {
        const elapsed = Date.now() - lastRepTimeRef.current;
        if (elapsed >= REST_AFTER) {
          restSecs = Math.floor((elapsed - REST_AFTER) / 1000);
        }
      }

      // Weak pose feedback
      if (snap.poseConf === "WEAK") {
        feedback = "Adjust position — ensure joints are visible";
      }

      // SINGLE batched state update (not 6 separate ones)
      setUi({
        angle:    snap.angle,
        reps:     snap.reps,
        stage:    snap.stage,
        poseConf: snap.poseConf,
        feedback,
        restSecs,
        repSpeed,
      });
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [exercise, readSnapshot, speak]);

  // ── Actions ───────────────────────────────────────────────────────

  const handleToggle = useCallback(async () => {
    if (!isRunning) {
      await runCountdown();
      await startWorkout();
      lastRepTimeRef.current = Date.now();
      setIsRunning(true);
    } else {
      setIsRunning(false);
    }
  }, [isRunning, runCountdown, startWorkout]);

  const handleReset = useCallback(async () => {
    if (prevRepsRef.current > 0) await recordSet(exercise, prevRepsRef.current);
    resetRepState();
    prevRepsRef.current = 0;
    repTimestampsRef.current = [];
    lastRepTimeRef.current = null;
    setUi(prev => ({ ...prev, reps: 0, stage: null, angle: 0, feedback: "Counter Reset" }));
  }, [exercise, recordSet, resetRepState]);

  const handleEndWorkout = useCallback(async () => {
    if (prevRepsRef.current > 0) await recordSet(exercise, prevRepsRef.current);
    resetRepState();
    prevRepsRef.current = 0;
    repTimestampsRef.current = [];
    lastRepTimeRef.current = null;
    setIsRunning(false);
    setUi(prev => ({ ...prev, reps: 0, stage: null, angle: 0 }));
    await endWorkout();
  }, [exercise, recordSet, resetRepState, endWorkout]);

  const handleExerciseChange = useCallback((newEx) => {
    changeExercise(newEx);
    resetRepState();
    prevRepsRef.current = 0;
    repTimestampsRef.current = [];
    lastRepTimeRef.current = null;
    setUi(prev => ({ ...prev, reps: 0, stage: null, angle: 0, feedback: "" }));
  }, [changeExercise, resetRepState]);

  useKeyboard({
    onToggle: handleToggle,
    onReset: handleReset,
    onExerciseChange: handleExerciseChange,
  });

  // ── Render ────────────────────────────────────────────────────────

  const fmtRest = (s) => `Rest: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="app-container">
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}

      <div className="canvas-wrapper">
        <Webcam
          ref={webcamRef}
          className="webcam-video"
          width={CAMERA_WIDTH}
          height={CAMERA_HEIGHT}
          mirrored={false}
          onUserMedia={() => {
            setWarmingUp(true);
            setTimeout(() => { setWarmingUp(false); setCameraReady(true); }, 1500);
          }}
        />
        <canvas ref={canvasRef} className="skeleton-canvas"
          width={CAMERA_WIDTH} height={CAMERA_HEIGHT} />

        {sets.length > 0 && (
          <div className="sets-strip">
            {sets.map((s, i) => (
              <span key={i} className="set-chip">
                Set {i + 1}: <strong>{s.reps}</strong>
              </span>
            ))}
          </div>
        )}

        {warmingUp && <div className="overlay-center warm-overlay">Camera warming up...</div>}
        {countdown !== null && <div className="overlay-center countdown-overlay">{countdown}</div>}
        {ui.restSecs !== null && (
          <div className="overlay-center rest-overlay">{fmtRest(ui.restSecs)}</div>
        )}
      </div>

      <div className="hud">
        <h1>AI Fitness Trainer</h1>

        <ExerciseSelector
          currentExercise={exercise}
          onSelect={handleExerciseChange}
          disabled={isRunning}
        />

        <StatsDisplay
          angle={ui.angle}
          reps={ui.reps}
          stage={ui.stage}
          feedback={ui.feedback}
          repSpeed={ui.repSpeed}
          poseConf={ui.poseConf}
        />

        <ControlPanel
          isRunning={isRunning}
          onToggle={handleToggle}
          onReset={handleReset}
          onEndWorkout={handleEndWorkout}
        />

        <div className="kb-hints">
          <span>Space: Start/Pause</span>
          <span>R: Reset</span>
          <span>1-7: Exercise</span>
        </div>

        <ScoreBoard
          currentExercise={exercise}
          currentReps={ui.reps}
          bestReps={bestReps}
        />
      </div>

      {showSummary && (
        <WorkoutSummary
          sets={sets}
          bestReps={bestReps}
          startTime={workoutStartRef.current}
          onClose={closeSummary}
        />
      )}
    </div>
  );
}
