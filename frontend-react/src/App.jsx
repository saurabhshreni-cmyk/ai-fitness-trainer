import React, { useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";

import "./styles/variables.css";
import "./index.css";
import "./App.css";

import useCountdown from "./hooks/useCountdown";
import useRepTracking from "./hooks/useRepTracking";
import useWorkout from "./hooks/useWorkout";
import useKeyboard from "./hooks/useKeyboard";
import usePoseDetection from "./hooks/usePoseDetection";

import { CAMERA_WIDTH, CAMERA_HEIGHT } from "./constants";
import ExerciseSelector from "./components/ExerciseSelector";
import ControlPanel from "./components/ControlPanel";
import StatsDisplay from "./components/StatsDisplay";
import ScoreBoard from "./components/ScoreBoard";
import FormScore from "./components/FormScore";
import WorkoutSummary from "./components/WorkoutSummary";
import Onboarding from "./components/Onboarding";

function genUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const sessionId = useRef(genUUID());

  const [cameraReady, setCameraReady] = useState(false);
  const [warmingUp,   setWarmingUp]   = useState(false);
  const [angle,       setAngle]       = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem("ai_trainer_onboarded")
  );

  // Canvas stays at camera resolution; CSS stretches it to fill the wrapper.

  // ── Hooks ─────────────────────────────────────────────────────────────

  const {
    exercise, sets, showSummary, workoutStartRef,
    startWorkout, recordSet, endWorkout, closeSummary, changeExercise,
  } = useWorkout("bicep_curl");

  const {
    reps, setReps, stage, setStage, feedback, setFeedback,
    repSpeed, restSecs, bestReps, isRunning, setIsRunning, isRunningRef,
    formScore, setFormScore, formDetails, setFormDetails, resetReps,
  } = useRepTracking(exercise);

  const { countdown, runCountdown, isCountdownActive } = useCountdown();

  // ── Pose detection result handler (client-side, no HTTP) ──────────

  const handlePoseResult = useCallback((data) => {
    if (data.angle !== undefined)     setAngle(data.angle);
    if (data.reps !== undefined)      setReps(data.reps);
    if (data.stage)                   setStage(data.stage);
    if (data.feedback !== undefined)  setFeedback(data.feedback);
    if (data.formScore !== undefined) setFormScore(data.formScore);
    if (data.formDetails)             setFormDetails(data.formDetails);
  }, [setReps, setStage, setFeedback, setFormScore, setFormDetails]);

  const { poseConf, resetRepState } = usePoseDetection({
    webcamRef, canvasRef, cameraReady, exercise,
    isRunningRef, isCountdownActive,
    onResult: handlePoseResult,
  });

  // ── Actions ───────────────────────────────────────────────────────

  const handleToggle = useCallback(async () => {
    if (!isRunning) {
      await runCountdown();
      await startWorkout();
      setIsRunning(true);
    } else {
      setIsRunning(false);
    }
  }, [isRunning, runCountdown, startWorkout, setIsRunning]);

  const handleReset = useCallback(async () => {
    if (reps > 0) await recordSet(exercise, reps);
    resetReps();
    resetRepState();
  }, [exercise, reps, recordSet, resetReps, resetRepState]);

  const handleEndWorkout = useCallback(async () => {
    if (reps > 0) await recordSet(exercise, reps);
    resetReps();
    resetRepState();
    setIsRunning(false);
    await endWorkout();
  }, [exercise, reps, recordSet, resetReps, resetRepState, setIsRunning, endWorkout]);

  const handleExerciseChange = useCallback((newEx) => {
    changeExercise(newEx);
    resetReps();
    resetRepState();
  }, [changeExercise, resetReps, resetRepState]);

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

      {/* VIDEO — fills all available space */}
      <div className="canvas-wrapper">
        {/* Webcam video shown directly — never goes black */}
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
        {/* Transparent canvas on top for skeleton overlay only */}
        <canvas ref={canvasRef} className="skeleton-canvas" width={CAMERA_WIDTH} height={CAMERA_HEIGHT} />

        {sets.length > 0 && (
          <div className="sets-strip">
            {sets.map((s, i) => (
              <span key={i} className="set-chip">
                Set {i + 1}: <strong>{s.reps}</strong>
                {s.avgFormScore && <span className="set-score"> ({Math.round(s.avgFormScore)})</span>}
              </span>
            ))}
          </div>
        )}

        {warmingUp && <div className="overlay-center warm-overlay">Camera warming up...</div>}
        {countdown !== null && <div className="overlay-center countdown-overlay">{countdown}</div>}
        {restSecs !== null && <div className="overlay-center rest-overlay">{fmtRest(restSecs)}</div>}
      </div>

      {/* HUD SIDEBAR — slim right panel */}
      <div className="hud">
        <h1>AI Fitness Trainer</h1>

        <ExerciseSelector
          currentExercise={exercise}
          onSelect={handleExerciseChange}
          disabled={isRunning}
        />

        <StatsDisplay
          angle={angle}
          reps={reps}
          stage={stage}
          feedback={feedback}
          repSpeed={repSpeed}
          poseConf={poseConf}
          avgLatency={null}
        />

        <FormScore formScore={formScore} formDetails={formDetails} />

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
          currentReps={reps}
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
