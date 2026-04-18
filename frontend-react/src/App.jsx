import React, { Suspense, lazy, useRef, useEffect, useState, useCallback } from "react";
import Webcam from "react-webcam";
import "./index.css";
import "./App.css";

import ExerciseSelector from "./components/ExerciseSelector";
import ControlPanel from "./components/ControlPanel";
import StatsDisplay from "./components/StatsDisplay";
import ScoreBoard from "./components/ScoreBoard";
import usePoseDetection from "./hooks/usePoseDetection";
import { EXERCISES } from "./utils/exercises";

const GhostChart = lazy(() => import("./components/GhostChart"));
const WorkoutSummary = lazy(() => import("./components/WorkoutSummary"));

const SPEECH_GAP = 2500;
const REST_AFTER = 12000;

const GhostChartFallback = () => (
  <div
    style={{
      marginTop: "10px",
      background: "rgba(8, 15, 18, 0.85)",
      border: "1px solid rgba(0, 255, 200, 0.25)",
      borderRadius: "10px",
      padding: "8px 8px 4px",
      minHeight: 183,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(180, 230, 220, 0.78)",
      fontSize: "12px",
      letterSpacing: "0.2px",
    }}
  >
    Loading movement chart...
  </div>
);

const SummaryFallback = () => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.85)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}
  >
    <div
      style={{
        background: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: "14px",
        padding: "28px",
        width: "380px",
        maxWidth: "95vw",
        color: "rgba(220,220,220,0.85)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
      }}
    >
      Preparing workout summary...
    </div>
  </div>
);

export default function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);

  const [exercise, setExercise] = useState("bicep_curl");
  const [isRunning, setIsRunning] = useState(false);

  const [bestReps, setBestReps] = useState({});

  const [sets, setSets] = useState([]);
  const [showSummary, setShowSummary] = useState(false);
  const [sessionTimeSeriesLog, setSessionTimeSeriesLog] = useState([]);
  const workoutStartRef = useRef(null);

  const [countdown, setCountdown] = useState(null);
  const [restSecs, setRestSecs] = useState(null);
  const [repSpeed, setRepSpeed] = useState(null);
  const [uiFeedback, setUiFeedback] = useState("");

  const prevRepsRef = useRef(0);
  const speechRef = useRef(window.speechSynthesis);
  const lastSpokenRef = useRef(0);
  const lastRepTimeRef = useRef(null);
  const repTimestampsRef = useRef([]);
  const restTimerIdRef = useRef(null);

  const {
    angle,
    reps,
    stage,
    formScore,
    formFeedback,
    poseConf,
    resetPoseState,
    readSnapshot,
  } = usePoseDetection({
    webcamRef,
    canvasRef,
    cameraReady,
    exercise,
    isRunning,
    countdownActive: countdown !== null,
  });

  const feedback = uiFeedback || formFeedback;
  const liveSnapshot = readSnapshot();
  const liveTimeSeriesLog = liveSnapshot?.timeSeriesLog || [];
  const liveBaselineGhostCurve = liveSnapshot?.baselineGhostCurve || [];

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("ai_trainer_best_reps")) || {};
    setBestReps(saved);
  }, []);

  useEffect(() => {
    if (reps > (bestReps[exercise] || 0)) {
      const nextBest = { ...bestReps, [exercise]: reps };
      setBestReps(nextBest);
      localStorage.setItem("ai_trainer_best_reps", JSON.stringify(nextBest));
    }
  }, [bestReps, exercise, reps]);

  const showFeedback = useCallback((message, duration = 1500) => {
    setUiFeedback(message);
    if (!duration) return;
    window.setTimeout(() => {
      setUiFeedback((current) => (current === message ? "" : current));
    }, duration);
  }, []);

  const speak = useCallback((text, force = false) => {
    const now = Date.now();
    if (force || now - lastSpokenRef.current > SPEECH_GAP) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.2;
      speechRef.current.speak(utterance);
      lastSpokenRef.current = now;
    }
  }, []);

  useEffect(() => {
    if (reps > prevRepsRef.current) {
      speak("Good rep!");
      showFeedback("Good Rep!");

      const now = Date.now();
      repTimestampsRef.current.push(now);
      if (repTimestampsRef.current.length > 10) repTimestampsRef.current.shift();

      if (repTimestampsRef.current.length >= 2) {
        const arr = repTimestampsRef.current;
        const seconds = (arr[arr.length - 1] - arr[arr.length - 2]) / 1000;
        setRepSpeed(seconds);
        if (seconds < 0.8) showFeedback("Slow down - control the rep", 1800);
      }

      lastRepTimeRef.current = now;
      setRestSecs(null);
    }
    prevRepsRef.current = reps;
  }, [reps, showFeedback, speak]);

  useEffect(() => {
    if (isRunning) {
      lastRepTimeRef.current = Date.now();
      restTimerIdRef.current = setInterval(() => {
        if (!lastRepTimeRef.current) return;
        const elapsed = Date.now() - lastRepTimeRef.current;
        if (elapsed >= REST_AFTER) {
          const seconds = Math.floor((elapsed - REST_AFTER) / 1000);
          setRestSecs(seconds);
          if (seconds === 0) {
            lastSpokenRef.current = 0;
            speak("Rest period");
          }
        } else {
          setRestSecs(null);
        }
      }, 1000);
    } else {
      clearInterval(restTimerIdRef.current);
      setRestSecs(null);
    }

    return () => clearInterval(restTimerIdRef.current);
  }, [isRunning, speak]);

  const runCountdown = useCallback(
    () =>
      new Promise((resolve) => {
        const steps = [3, 2, 1, "GO"];
        let i = 0;

        const tick = () => {
          setCountdown(steps[i]);
          lastSpokenRef.current = 0;
          speak(String(steps[i]), true);
          i += 1;
          if (i < steps.length) {
            setTimeout(tick, 950);
          } else {
            setTimeout(() => {
              setCountdown(null);
              resolve();
            }, 700);
          }
        };
        tick();
      }),
    [speak]
  );

  const handleToggle = useCallback(async () => {
    if (!isRunning) {
      await runCountdown();
      workoutStartRef.current = workoutStartRef.current || Date.now();
      setIsRunning(true);
      return;
    }
    setIsRunning(false);
  }, [isRunning, runCountdown]);

  const resetCounter = useCallback(
    (saveSet = true) => {
      if (saveSet && reps > 0) {
        setSets((prev) => [...prev, { exercise, reps, timestamp: Date.now() }]);
      }
      resetPoseState("Counter Reset");
      setRepSpeed(null);
      showFeedback("Counter Reset");
      prevRepsRef.current = 0;
      repTimestampsRef.current = [];
      lastRepTimeRef.current = null;
    },
    [exercise, reps, resetPoseState, showFeedback]
  );

  const handleExerciseChange = useCallback(
    (nextExercise) => {
      setExercise(nextExercise);
      setSets([]);
      setRepSpeed(null);
      prevRepsRef.current = 0;
      repTimestampsRef.current = [];
      lastRepTimeRef.current = null;
    },
    []
  );

  const handleEndWorkout = useCallback(() => {
    const snapshot = readSnapshot();
    setSessionTimeSeriesLog([...(snapshot?.timeSeriesLog || [])]);
    resetCounter(true);
    setIsRunning(false);
    setShowSummary(true);
  }, [readSnapshot, resetCounter]);

  const handleCloseSummary = useCallback(() => {
    setShowSummary(false);
    setSets([]);
    setSessionTimeSeriesLog([]);
    workoutStartRef.current = null;
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT") return;

      if (event.code === "Space") {
        event.preventDefault();
        handleToggle();
      } else if (event.key === "r" || event.key === "R") {
        resetCounter(true);
      } else if (event.key >= "1" && event.key <= "7") {
        const index = parseInt(event.key, 10) - 1;
        if (EXERCISES[index]) handleExerciseChange(EXERCISES[index]);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleExerciseChange, handleToggle, resetCounter]);

  const formatRest = (seconds) =>
    `Rest: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="app-container">
      <Webcam
        ref={webcamRef}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        width={640}
        height={480}
        onUserMedia={() => {
          setWarmingUp(true);
          setTimeout(() => {
            setWarmingUp(false);
            setCameraReady(true);
          }, 1500);
        }}
      />

      {sets.length > 0 && (
        <div className="sets-strip">
          {sets.map((setItem, i) => (
            <span key={i} className="set-chip">
              Set {i + 1}: <strong>{setItem.reps}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="canvas-wrapper">
        <canvas ref={canvasRef} width={640} height={480} />

        {warmingUp && <div className="overlay-center warm-overlay">📷 Camera warming up...</div>}

        {countdown !== null && <div className="overlay-center countdown-overlay">{countdown}</div>}

        {restSecs !== null && <div className="overlay-center rest-overlay">{formatRest(restSecs)}</div>}

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
            formScore={formScore}
            avgLatency={null}
          />

          <Suspense fallback={<GhostChartFallback />}>
            <GhostChart
              baselineGhostCurve={liveBaselineGhostCurve}
              timeSeriesLog={liveTimeSeriesLog}
            />
          </Suspense>

          <ControlPanel
            isRunning={isRunning}
            onToggle={handleToggle}
            onReset={() => resetCounter(true)}
            onEndWorkout={handleEndWorkout}
          />

          <div className="kb-hints">
            <span>Space: Start/Pause</span>
            <span>R: Reset</span>
            <span>1-7: Exercise</span>
          </div>

          <ScoreBoard currentExercise={exercise} currentReps={reps} bestReps={bestReps} />
        </div>
      </div>

      {showSummary && (
        <Suspense fallback={<SummaryFallback />}>
          <WorkoutSummary
            sets={sets}
            bestReps={bestReps}
            sessionTimeSeriesLog={sessionTimeSeriesLog}
            startTime={workoutStartRef.current}
            onClose={handleCloseSummary}
          />
        </Suspense>
      )}
    </div>
  );
}
