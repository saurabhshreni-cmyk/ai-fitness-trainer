import React, { Suspense, lazy, useRef, useEffect, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { Link } from "react-router-dom";
import "../index.css";
import "../App.css";

import ExerciseSelector from "../components/ExerciseSelector";
import ControlPanel from "../components/ControlPanel";
import StatsDisplay from "../components/StatsDisplay";
import ScoreBoard from "../components/ScoreBoard";
import { PoseErrorBoundary, ChartErrorBoundary } from "../components/ErrorBoundary";
import usePoseDetection from "../hooks/usePoseDetection";
import useBackendStatus from "../hooks/useBackendStatus";
import { EXERCISES } from "../utils/exercises";
import { buildSessionRecord, saveSession } from "../utils/sessionStorage";
import { saveSessionToBackend, isBackendAvailable } from "../utils/api";
import { loadSettings } from "./Settings";
import config from "../config";

const GhostChart = lazy(() => import("../components/GhostChart"));
const WorkoutSummary = lazy(() => import("../components/WorkoutSummary"));

const SPEECH_GAP = 2000;
const REST_AFTER = 12000;

const REP_WORDS = [
  "", "One", "Two", "Three", "Four", "Five",
  "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
  "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty",
];

const CAM_CONSTRAINTS_SEQUENCE = [
  { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
  { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
  {},
];

const GhostChartFallback = () => (
  <div style={{
    marginTop: "10px", background: "rgba(8,15,18,0.85)",
    border: "1px solid rgba(0,255,200,0.25)", borderRadius: "10px",
    padding: "8px 8px 4px", minHeight: 183, display: "flex",
    alignItems: "center", justifyContent: "center",
    color: "rgba(180,230,220,0.78)", fontSize: "12px",
  }}>
    Loading movement chart...
  </div>
);

const SummaryFallback = () => (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  }}>
    <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: "14px", padding: "28px", width: "380px", maxWidth: "95vw", color: "rgba(220,220,220,0.85)" }}>
      Preparing workout summary...
    </div>
  </div>
);

export default function TrainerPage() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  const [camAttempt, setCamAttempt] = useState(0);
  const [camError, setCamError] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [sessionStopped, setSessionStopped] = useState(false);
  // "checking" | "online" | "waking" | "offline" — keeps the Render dyno warm.
  const backendStatus = useBackendStatus();

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
  // Voice preference: Settings toggle (localStorage) overrides the build-time config default.
  const voiceEnabledRef = useRef(loadSettings().voiceEnabled ?? config.enableVoice);

  useEffect(() => {
    const syncVoice = () => {
      voiceEnabledRef.current = loadSettings().voiceEnabled ?? config.enableVoice;
    };
    window.addEventListener("focus", syncVoice);
    window.addEventListener("storage", syncVoice);
    return () => {
      window.removeEventListener("focus", syncVoice);
      window.removeEventListener("storage", syncVoice);
    };
  }, []);

  const {
    angle, reps, stage, formScore, formFeedback,
    poseConf, modelStatus, resetPoseState, stopDetection, readSnapshot,
  } = usePoseDetection({
    webcamRef, canvasRef, cameraReady, exercise, isRunning,
    countdownActive: countdown !== null,
  });

  const feedback = uiFeedback || formFeedback;
  const liveSnapshot = readSnapshot();
  const liveTimeSeriesLog = liveSnapshot?.timeSeriesLog || [];
  const liveBaselineGhostCurve = liveSnapshot?.baselineGhostCurve || [];

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("ai_trainer_best_reps") || "{}");
    setBestReps(saved);
  }, []);

  useEffect(() => {
    if (reps > (bestReps[exercise] || 0)) {
      const next = { ...bestReps, [exercise]: reps };
      setBestReps(next);
      localStorage.setItem("ai_trainer_best_reps", JSON.stringify(next));
    }
  }, [bestReps, exercise, reps]);

  const showFeedback = useCallback((message, duration = 1500) => {
    setUiFeedback(message);
    if (!duration) return;
    window.setTimeout(() => {
      setUiFeedback(cur => (cur === message ? "" : cur));
    }, duration);
  }, []);

  const speak = useCallback((text, force = false) => {
    if (!voiceEnabledRef.current) return;
    if (!speechRef.current || typeof SpeechSynthesisUtterance === "undefined") return;
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
      const repWord = reps <= REP_WORDS.length - 1 ? REP_WORDS[reps] : String(reps);
      if (formScore >= 90) {
        speak(`${repWord}! Great form!`);
        showFeedback("Perfect Rep! 🔥");
      } else if (formScore < 60) {
        speak(`${repWord}. Watch your form.`);
        showFeedback("Watch Your Form");
      } else {
        speak(repWord);
        showFeedback("Good Rep!");
      }

      const now = Date.now();
      repTimestampsRef.current.push(now);
      if (repTimestampsRef.current.length > 10) repTimestampsRef.current.shift();

      if (repTimestampsRef.current.length >= 2) {
        const arr = repTimestampsRef.current;
        const seconds = (arr[arr.length - 1] - arr[arr.length - 2]) / 1000;
        setRepSpeed(seconds);
        if (seconds < 0.8) showFeedback("Slow down – control the rep", 1800);
      }

      lastRepTimeRef.current = now;
      setRestSecs(null);
    }
    prevRepsRef.current = reps;
  }, [reps, formScore, showFeedback, speak]);

  useEffect(() => {
    if (isRunning) {
      lastRepTimeRef.current = Date.now();
      restTimerIdRef.current = setInterval(() => {
        if (!lastRepTimeRef.current) return;
        const elapsed = Date.now() - lastRepTimeRef.current;
        if (elapsed >= REST_AFTER) {
          const seconds = Math.floor((elapsed - REST_AFTER) / 1000);
          setRestSecs(seconds);
          if (seconds === 0) { lastSpokenRef.current = 0; speak("Rest period"); }
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
    () => new Promise(resolve => {
      const steps = [3, 2, 1, "GO"];
      let i = 0;
      const tick = () => {
        setCountdown(steps[i]);
        lastSpokenRef.current = 0;
        speak(String(steps[i]), true);
        i += 1;
        if (i < steps.length) setTimeout(tick, 950);
        else setTimeout(() => { setCountdown(null); resolve(); }, 700);
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

  const resetCounter = useCallback((saveSet = true) => {
    if (saveSet && reps > 0) {
      setSets(prev => [...prev, { exercise, reps, timestamp: Date.now() }]);
    }
    resetPoseState("Counter Reset");
    setRepSpeed(null);
    showFeedback("Counter Reset");
    prevRepsRef.current = 0;
    repTimestampsRef.current = [];
    lastRepTimeRef.current = null;
  }, [exercise, reps, resetPoseState, showFeedback]);

  const handleExerciseChange = useCallback(nextExercise => {
    setExercise(nextExercise);
    setSets([]);
    setRepSpeed(null);
    prevRepsRef.current = 0;
    repTimestampsRef.current = [];
    lastRepTimeRef.current = null;
  }, []);

  // Single source of truth for persisting a session: localStorage first (always
  // succeeds, acts as the backup), then a best-effort backend sync that itself
  // falls back to an offline queue if the network fails.
  const persistSession = useCallback(() => {
    const snapshot = readSnapshot();
    const finalSets = reps > 0
      ? [...sets, { exercise, reps, timestamp: Date.now() }]
      : sets;

    setSessionTimeSeriesLog([...(snapshot?.timeSeriesLog || [])]);

    if (finalSets.length > 0) {
      const record = buildSessionRecord({
        exercise,
        sets: finalSets,
        startTime: workoutStartRef.current,
        avgFormScore: formScore,
      });
      saveSession(record); // localStorage backup — never throws fatally
      if (isBackendAvailable() !== false) {
        saveSessionToBackend(record).catch(() => {});
      }
    }
  }, [readSnapshot, reps, sets, exercise, formScore]);

  const handleEndWorkout = useCallback(() => {
    persistSession();
    resetCounter(true);
    setIsRunning(false);
    setShowSummary(true);
  }, [persistSession, resetCounter]);

  // Stop Session: save, then fully release the camera + MediaPipe pipeline.
  const handleStopSession = useCallback(() => {
    persistSession();
    resetCounter(true);
    setIsRunning(false);
    stopDetection();          // stop MediaPipe processing (guarded, cancels next frame)
    setCameraReady(false);    // triggers hook cleanup
    setSessionStopped(true);  // unmounts <Webcam> → releases all camera tracks
    setShowSummary(true);
  }, [persistSession, resetCounter, stopDetection]);

  const handleStartNewSession = useCallback(() => {
    setShowSummary(false);
    setSets([]);
    setSessionTimeSeriesLog([]);
    workoutStartRef.current = null;
    prevRepsRef.current = 0;
    repTimestampsRef.current = [];
    lastRepTimeRef.current = null;
    setCamAttempt(0);
    setCameraReady(false);
    setSessionStopped(false); // remounts <Webcam> → re-requests the camera
  }, []);

  const handleCloseSummary = useCallback(() => {
    setShowSummary(false);
    setSets([]);
    setSessionTimeSeriesLog([]);
    workoutStartRef.current = null;
  }, []);

  const handleCamError = useCallback(err => {
    const name = err?.name || err?.constraint || "Unknown";

    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      setCamError("permission_denied");
      return;
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      setCamError("not_found");
      return;
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      setCamError("in_use");
      return;
    }

    const nextAttempt = camAttempt + 1;
    if (nextAttempt < CAM_CONSTRAINTS_SEQUENCE.length) {
      setCamAttempt(nextAttempt);
    } else {
      setDemoMode(true);
    }
  }, [camAttempt]);

  useEffect(() => {
    const onKey = event => {
      if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT") return;
      if (event.code === "Space") { event.preventDefault(); handleToggle(); }
      else if (event.key === "r" || event.key === "R") resetCounter(true);
      else if (event.key >= "1" && event.key <= "9") {
        const index = parseInt(event.key, 10) - 1;
        if (EXERCISES[index]) handleExerciseChange(EXERCISES[index]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleExerciseChange, handleToggle, resetCounter]);

  const formatRest = seconds =>
    `Rest: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  const camConstraints = CAM_CONSTRAINTS_SEQUENCE[camAttempt] || {};

  const camErrorMessages = {
    permission_denied: {
      title: "Camera Permission Denied",
      body: "Please allow camera access in your browser settings, then reload the page.",
      icon: "🚫",
    },
    not_found: {
      title: "No Camera Found",
      body: "No camera was detected on this device.",
      icon: "📷",
    },
    in_use: {
      title: "Camera In Use",
      body: "Your camera is being used by another application. Close that app and reload.",
      icon: "⚠️",
    },
  };

  return (
    <div className="app-container">
      {/* Backend status badge */}
      {backendStatus === "waking" && (
        <div style={{
          position: "fixed", top: "8px", right: "8px", zIndex: 999,
          background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.4)",
          borderRadius: "20px", padding: "4px 12px",
          fontSize: "11px", color: "#00e5ff", fontWeight: "bold",
        }}>
          🔄 Waking up backend…
        </div>
      )}
      {backendStatus === "offline" && (
        <div style={{
          position: "fixed", top: "8px", right: "8px", zIndex: 999,
          background: "rgba(255,152,0,0.15)", border: "1px solid rgba(255,152,0,0.4)",
          borderRadius: "20px", padding: "4px 12px",
          fontSize: "11px", color: "#ff9800", fontWeight: "bold",
        }}>
          ⚡ Backend offline — retrying… (history saved locally)
        </div>
      )}

      {/* Camera error state */}
      {camError && (
        <div style={{
          position: "fixed", inset: 0, background: "#0d1117",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        }}>
          <div style={{
            background: "rgba(8,15,18,0.95)", border: "1px solid rgba(255,68,68,0.4)",
            borderRadius: "16px", padding: "40px", maxWidth: "400px", textAlign: "center",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>
              {camErrorMessages[camError]?.icon}
            </div>
            <h2 style={{ color: "#ff6b6b", margin: "0 0 12px" }}>
              {camErrorMessages[camError]?.title}
            </h2>
            <p style={{ color: "#888", fontSize: "14px", marginBottom: "24px" }}>
              {camErrorMessages[camError]?.body}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: "12px 28px", borderRadius: "8px", border: "none", background: "#ff6b6b", color: "#fff", fontWeight: "bold", cursor: "pointer" }}
            >
              Reload
            </button>
          </div>
        </div>
      )}

      {/* Demo mode overlay */}
      {demoMode && (
        <div style={{
          position: "fixed", inset: 0, background: "#0d1117",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        }}>
          <div style={{
            background: "rgba(8,15,18,0.95)", border: "1px solid rgba(255,152,0,0.4)",
            borderRadius: "16px", padding: "40px", maxWidth: "400px", textAlign: "center",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>📷</div>
            <h2 style={{ color: "#ff9800", margin: "0 0 12px" }}>Camera Unavailable</h2>
            <p style={{ color: "#888", fontSize: "14px", marginBottom: "8px" }}>
              Could not access any camera after 3 attempts.
            </p>
            <p style={{ color: "#555", fontSize: "13px", marginBottom: "24px" }}>
              Use the manual rep counter below, or check camera permissions and reload.
            </p>
            <button onClick={() => window.location.reload()}
              style={{ padding: "12px 28px", borderRadius: "8px", border: "none", background: "#ff9800", color: "#fff", fontWeight: "bold", cursor: "pointer" }}>
              Retry
            </button>
          </div>
        </div>
      )}

      {!camError && !demoMode && !sessionStopped && (
        <Webcam
          ref={webcamRef}
          style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
          width={640}
          height={480}
          videoConstraints={camConstraints}
          onUserMedia={() => {
            setWarmingUp(true);
            setTimeout(() => { setWarmingUp(false); setCameraReady(true); }, 1500);
          }}
          onUserMediaError={handleCamError}
        />
      )}

      {sets.length > 0 && (
        <div className="sets-strip">
          {sets.map((s, i) => (
            <span key={i} className="set-chip">
              Set {i + 1}: <strong>{s.reps}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="canvas-wrapper">
        <PoseErrorBoundary>
          <canvas ref={canvasRef} width={640} height={480} />

          {warmingUp && <div className="overlay-center warm-overlay">📷 Camera warming up…</div>}
          {!warmingUp && cameraReady && !sessionStopped && modelStatus === "loading" && (
            <div className="overlay-center warm-overlay">🧠 Loading AI model…</div>
          )}
          {!sessionStopped && modelStatus === "error" && (
            <div className="overlay-center warm-overlay" style={{ flexDirection: "column", gap: "12px", color: "#ff6b6b", borderColor: "rgba(255,107,107,0.4)", pointerEvents: "auto" }}>
              <div>⚠️ Couldn’t load the AI pose model</div>
              <div style={{ fontSize: "12px", color: "#aaa", fontWeight: 400 }}>Check your connection, then reload.</div>
              <button onClick={() => window.location.reload()}
                style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#ff6b6b", color: "#fff", fontWeight: "bold", cursor: "pointer" }}>
                Reload
              </button>
            </div>
          )}
          {countdown !== null && <div className="overlay-center countdown-overlay">{countdown}</div>}
          {restSecs !== null && <div className="overlay-center rest-overlay">{formatRest(restSecs)}</div>}
          {sessionStopped && (
            <div className="overlay-center warm-overlay" style={{ flexDirection: "column", gap: "12px", pointerEvents: "auto" }}>
              <div>⏹ Session stopped — camera off</div>
              <button onClick={handleStartNewSession}
                style={{ padding: "10px 24px", borderRadius: "8px", border: "none", background: "#43a047", color: "#fff", fontWeight: "bold", cursor: "pointer" }}>
                ▶ Start New Session
              </button>
            </div>
          )}
        </PoseErrorBoundary>

        <div className="hud">
          {/* Nav links */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "8px" }}>
            <Link to="/history" style={{ fontSize: "11px", color: "#555", textDecoration: "none", padding: "2px 6px", border: "1px solid #333", borderRadius: "4px" }}>
              📊 History
            </Link>
            <Link to="/settings" style={{ fontSize: "11px", color: "#555", textDecoration: "none", padding: "2px 6px", border: "1px solid #333", borderRadius: "4px" }}>
              ⚙️ Settings
            </Link>
          </div>

          <h1>AI Fitness Trainer</h1>

          <ExerciseSelector currentExercise={exercise} onSelect={handleExerciseChange} disabled={isRunning} />

          <StatsDisplay angle={angle} reps={reps} stage={stage} feedback={feedback}
            repSpeed={repSpeed} poseConf={poseConf} formScore={formScore} avgLatency={null} />

          <ChartErrorBoundary>
            <Suspense fallback={<GhostChartFallback />}>
              <GhostChart baselineGhostCurve={liveBaselineGhostCurve} timeSeriesLog={liveTimeSeriesLog} />
            </Suspense>
          </ChartErrorBoundary>

          <ControlPanel isRunning={isRunning} onToggle={handleToggle}
            onReset={() => resetCounter(true)} onEndWorkout={handleEndWorkout}
            onStop={handleStopSession} cameraActive={cameraReady && !sessionStopped} />

          <div className="kb-hints">
            <span>Space: Start/Pause</span>
            <span>R: Reset</span>
            <span>1-9: Exercise</span>
          </div>

          <ScoreBoard currentExercise={exercise} currentReps={reps} bestReps={bestReps} />
        </div>
      </div>

      {showSummary && (
        <Suspense fallback={<SummaryFallback />}>
          <WorkoutSummary sets={sets} bestReps={bestReps}
            sessionTimeSeriesLog={sessionTimeSeriesLog}
            startTime={workoutStartRef.current} onClose={handleCloseSummary} />
        </Suspense>
      )}
    </div>
  );
}
