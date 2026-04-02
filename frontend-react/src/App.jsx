import React, { useRef, useEffect, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
import axios from "axios";
import "./index.css";
import "./App.css";

import ExerciseSelector from "./components/ExerciseSelector";
import ControlPanel from "./components/ControlPanel";
import StatsDisplay from "./components/StatsDisplay";
import ScoreBoard from "./components/ScoreBoard";
import WorkoutSummary from "./components/WorkoutSummary";

// ─── Config ─────────────────────────────────────────────────────────────────

const API_BASE   = import.meta.env.VITE_API_URL || "http://localhost:8000";
const SEND_MS    = 200;    // max 5 API calls / sec
const SPEECH_GAP = 2500;   // ms between utterances
const REST_AFTER = 12000;  // ms of no rep before rest timer

// ─── MediaPipe named landmark indices ───────────────────────────────────────

const LANDMARK_INDEX = {
  nose:           0,
  left_shoulder: 11, right_shoulder: 12,
  left_elbow:    13, right_elbow:    14,
  left_wrist:    15, right_wrist:    16,
  left_hip:      23, right_hip:      24,
  left_knee:     25, right_knee:     26,
  left_ankle:    27, right_ankle:    28,
};

// ─── Per-exercise joint triplets (always "left_" as default side) ───────────
// Keys MUST match backend EXERCISE_MAP exactly (plural where required)

const EXERCISE_LANDMARKS = {
  bicep_curl:     ["left_shoulder", "left_elbow",    "left_wrist"],
  pushups:        ["left_shoulder", "left_elbow",    "left_wrist"],
  shoulder_press: ["left_shoulder", "left_elbow",    "left_wrist"],
  squats:         ["left_hip",      "left_knee",     "left_ankle"],
  lunges:         ["left_hip",      "left_knee",     "left_ankle"],
  lateral_raise:  ["left_hip",      "left_shoulder", "left_elbow"],
  front_raise:    ["left_hip",      "left_shoulder", "left_elbow"],
};

// Exercise display names — order defines keyboard keys 1-7
const EXERCISE_CONFIG = {
  bicep_curl:     "Bicep Curl",
  pushups:        "Pushups",
  squats:         "Squats",
  shoulder_press: "Shoulder Press",
  lateral_raise:  "Lateral Raise",
  lunges:         "Lunges",
  front_raise:    "Front Raise",
};
const EXERCISES = Object.keys(EXERCISE_CONFIG);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [warmingUp,   setWarmingUp]   = useState(false);

  // Session — stable for lifetime of the page
  const sessionId = useRef(genUUID());

  // Exercise / run state
  const [exercise,  setExercise]  = useState("bicep_curl");
  const [isRunning, setIsRunning] = useState(false);

  // Live stats
  const [angle,      setAngle]      = useState(0);
  const [reps,       setReps]       = useState(0);
  const [stage,      setStage]      = useState(null);
  const [feedback,   setFeedback]   = useState("");
  const [poseConf,   setPoseConf]   = useState(null);   // "STRONG" | "WEAK" | null
  const [avgLatency, setAvgLatency] = useState(null);

  // Gamification
  const [bestReps, setBestReps] = useState({});

  // Sets + workout summary
  const [sets,        setSets]        = useState([]);
  const [showSummary, setShowSummary] = useState(false);
  const workoutStartRef = useRef(null);

  // Overlays
  const [countdown, setCountdown] = useState(null);  // null | 3 | 2 | 1 | "GO"
  const [restSecs,  setRestSecs]  = useState(null);  // null = hidden

  // Rep velocity
  const [repSpeed, setRepSpeed] = useState(null);

  // ── Internal refs (don't trigger re-renders) ─────────────────────────────

  const lastSentRef       = useRef(0);
  const prevRepsRef       = useRef(0);
  const emaRef            = useRef(0);
  const speechRef         = useRef(window.speechSynthesis);
  const lastSpokenRef     = useRef(0);
  const lastRepTimeRef    = useRef(null);
  const repTimestampsRef  = useRef([]);
  const restTimerIdRef    = useRef(null);
  const isRequestInFlight = useRef(false);
  const frameTimestamp    = useRef(0);
  const latencyBuffer     = useRef([]);
  const isRunningRef      = useRef(false);
  const countdownActive   = useRef(false);

  // Keep ref in sync so onResults (memoised below) can read current value
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  // ── localStorage ─────────────────────────────────────────────────────────

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("ai_trainer_best_reps")) || {};
    setBestReps(saved);
  }, []);

  useEffect(() => {
    if (reps > (bestReps[exercise] || 0)) {
      const nb = { ...bestReps, [exercise]: reps };
      setBestReps(nb);
      localStorage.setItem("ai_trainer_best_reps", JSON.stringify(nb));
    }
  }, [reps, exercise, bestReps]);

  // ── Speech helper ─────────────────────────────────────────────────────────

  const speak = useCallback((text, force = false) => {
    const now = Date.now();
    if (force || now - lastSpokenRef.current > SPEECH_GAP) {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.2;
      speechRef.current.speak(u);
      lastSpokenRef.current = now;
    }
  }, []);

  // ── Rep detection → audio + velocity + rest reset ────────────────────────

  useEffect(() => {
    if (reps > prevRepsRef.current) {
      speak("Good rep!");
      setFeedback("Good Rep!");
      setTimeout(() => setFeedback(""), 1500);

      const now = Date.now();
      repTimestampsRef.current.push(now);
      if (repTimestampsRef.current.length > 10) repTimestampsRef.current.shift();
      if (repTimestampsRef.current.length >= 2) {
        const arr   = repTimestampsRef.current;
        const speed = (arr[arr.length - 1] - arr[arr.length - 2]) / 1000;
        setRepSpeed(speed);
        if (speed < 0.8) setFeedback("Slow down — control the rep");
      }

      lastRepTimeRef.current = now;
      setRestSecs(null);
    }
    prevRepsRef.current = reps;
  }, [reps, speak]);

  // ── Rest timer ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isRunning) {
      lastRepTimeRef.current = Date.now();
      restTimerIdRef.current = setInterval(() => {
        if (!lastRepTimeRef.current) return;
        const elapsed = Date.now() - lastRepTimeRef.current;
        if (elapsed >= REST_AFTER) {
          const secs = Math.floor((elapsed - REST_AFTER) / 1000);
          setRestSecs(secs);
          if (secs === 0) { lastSpokenRef.current = 0; speak("Rest period"); }
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

  // ── Drift-safe countdown ──────────────────────────────────────────────────

  const runCountdown = useCallback(() => new Promise((resolve) => {
    const steps = [3, 2, 1, "GO"];
    let i = 0;
    countdownActive.current = true;
    const tick = () => {
      setCountdown(steps[i]);
      lastSpokenRef.current = 0;   // force speech through cooldown
      speak(String(steps[i]));
      i++;
      if (i < steps.length) {
        setTimeout(tick, 950);     // 950ms compensates timer jitter
      } else {
        setTimeout(() => {
          setCountdown(null);
          countdownActive.current = false;
          resolve();
        }, 700);
      }
    };
    tick();
  }), [speak]);

  // ── Toggle start / pause ──────────────────────────────────────────────────

  const handleToggle = useCallback(async () => {
    if (!isRunning) {
      await runCountdown();
      workoutStartRef.current = workoutStartRef.current || Date.now();
      setIsRunning(true);
    } else {
      setIsRunning(false);
    }
  }, [isRunning, runCountdown]);

  // ── Reset counter ─────────────────────────────────────────────────────────

  const resetCounter = useCallback(async (saveSet = true) => {
    try {
      await axios.post(`${API_BASE}/reset?session_id=${sessionId.current}`);
      if (saveSet && reps > 0) {
        setSets(prev => [...prev, { exercise, reps, timestamp: Date.now() }]);
      }
      setReps(0); setStage(null); setAngle(0);
      setRepSpeed(null); setFeedback("Counter Reset");
      prevRepsRef.current  = 0;
      emaRef.current       = 0;
      repTimestampsRef.current  = [];
      lastRepTimeRef.current    = null;
    } catch (err) { console.error("Reset failed", err); }
  }, [exercise, reps]);

  // ── Exercise change ───────────────────────────────────────────────────────

  const handleExerciseChange = useCallback((newEx) => {
    setExercise(newEx);
    setSets([]);
    resetCounter(false);
  }, [resetCounter]);

  // ── End workout ───────────────────────────────────────────────────────────

  const handleEndWorkout = useCallback(async () => {
    await resetCounter(true);
    setIsRunning(false);
    setShowSummary(true);
  }, [resetCounter]);

  const handleCloseSummary = useCallback(() => {
    setShowSummary(false);
    setSets([]);
    workoutStartRef.current = null;
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); handleToggle(); }
      else if (e.key === "r" || e.key === "R") resetCounter(true);
      else if (e.key >= "1" && e.key <= "7") {
        const idx = parseInt(e.key, 10) - 1;
        if (EXERCISES[idx]) handleExerciseChange(EXERCISES[idx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleToggle, resetCounter, handleExerciseChange]);

  // ── MediaPipe onResults ───────────────────────────────────────────────────

  const onResults = useCallback(async (results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx  = canvas.getContext("2d");
    const W    = canvas.width;
    const H    = canvas.height;
    const videoEl = webcamRef.current?.video;

    try {
      ctx.save();
      ctx.clearRect(0, 0, W, H);

      // ── ALWAYS draw video frame first — never go black ──────────
      const src = (videoEl && videoEl.readyState >= 2) ? videoEl : results.image;
      if (src) ctx.drawImage(src, 0, 0, W, H);

      if (!results.poseLandmarks) {
        ctx.restore();
        return; // raw video shown, we're done
      }

      // Draw skeleton
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS,
        { color: "#00FF00", lineWidth: 4 });
      drawLandmarks(ctx, results.poseLandmarks,
        { color: "#FF0000", lineWidth: 2 });

      ctx.restore();

      // Only process detections when running & not in countdown
      if (!isRunningRef.current || countdownActive.current) return;

      // ── Brightness check ─────────────────────────────────────────
      try {
        const imgD = ctx.getImageData(0, 0, 32, 32);
        const brightness = imgD.data
          .filter((_, i) => i % 4 !== 3)
          .reduce((a, b) => a + b, 0) / (32 * 32 * 3);
        if (brightness < 15) {
          setFeedback("Too dark — improve lighting");
          setTimeout(() => setFeedback(""), 2000);
          return;
        }
      } catch (_) { /* cross-origin canvas errors silently ignored */ }

      // ── Extract joints using correct landmark indices ────────────
      const lm = results.poseLandmarks;
      const getLM = (name) => lm[LANDMARK_INDEX[name]];

      const baseTriplet = EXERCISE_LANDMARKS[exercise] || EXERCISE_LANDMARKS.bicep_curl;

      // Smart side detection
      let side = "left";
      if (["squats", "lunges"].includes(exercise)) {
        // Lower body: side with higher knee visibility
        const lKV = getLM("left_knee").visibility;
        const rKV = getLM("right_knee").visibility;
        side = rKV > lKV ? "right" : "left";
      } else if (exercise === "pushups") {
        // Pushups: side with lower Z shoulder (closer to camera)
        const lSZ = getLM("left_shoulder").z;
        const rSZ = getLM("right_shoulder").z;
        side = rSZ < lSZ ? "right" : "left";
      } else {
        // Upper body: side whose wrist is higher (lower Y) in frame
        const lWY = getLM("left_wrist").y;
        const rWY = getLM("right_wrist").y;
        if (rWY < lWY - 0.05)       side = "right";
        else if (lWY < rWY - 0.05)  side = "left";
        else {
          // Fallback: shoulder visibility
          side = getLM("left_shoulder").visibility >= getLM("right_shoulder").visibility
            ? "left" : "right";
        }
      }

      // Remap left_ → right_ if needed
      const activeTriplet = baseTriplet.map(n =>
        side === "right" ? n.replace("left_", "right_") : n
      );
      const [p1, p2, p3] = activeTriplet.map(n => getLM(n));

      // Pose confidence indicator
      const allStrong = p1.visibility > 0.7 && p2.visibility > 0.7 && p3.visibility > 0.7;
      const anyWeak   = p1.visibility < 0.5 || p2.visibility < 0.5 || p3.visibility < 0.5;
      setPoseConf(allStrong ? "STRONG" : anyWeak ? "WEAK" : null);

      if (anyWeak) {
        setFeedback("Adjust Camera");
        return;
      }

      // ── Throttle + in-flight guard ───────────────────────────────
      const now = Date.now();
      if (now - lastSentRef.current < SEND_MS) return;
      if (isRequestInFlight.current) return;

      lastSentRef.current      = now;
      isRequestInFlight.current = true;
      frameTimestamp.current   = performance.now();

      try {
        const payload = {
          shoulder:   { x: p1.x, y: p1.y, z: p1.z ?? 0, visibility: p1.visibility },
          elbow:      { x: p2.x, y: p2.y, z: p2.z ?? 0, visibility: p2.visibility },
          wrist:      { x: p3.x, y: p3.y, z: p3.z ?? 0, visibility: p3.visibility },
          session_id: sessionId.current,
        };

        const t0  = performance.now();
        const res = await axios.post(`${API_BASE}/analyze?exercise=${exercise}`, payload);
        const latency = Math.round(performance.now() - t0);

        // Discard stale responses
        if (performance.now() - frameTimestamp.current > 350) return;

        // Rolling latency average (last 5)
        latencyBuffer.current.push(latency);
        if (latencyBuffer.current.length > 5) latencyBuffer.current.shift();
        const avg = Math.round(
          latencyBuffer.current.reduce((a, b) => a + b, 0) / latencyBuffer.current.length
        );
        setAvgLatency(avg);

        if (res.data) {
          // Adaptive EMA α based on measured latency
          const alpha = avg > 200 ? 0.15 : avg > 100 ? 0.25 : 0.35;
          emaRef.current = alpha * res.data.angle + (1 - alpha) * emaRef.current;
          setAngle(emaRef.current);
          setReps(res.data.reps);
          if (res.data.stage)         setStage(res.data.stage);
          if (res.data.form_feedback) setFeedback(res.data.form_feedback);
        }
      } catch (apiErr) {
        console.error("API Error", apiErr);
      } finally {
        isRequestInFlight.current = false;
      }

    } catch (renderErr) {
      console.error("Canvas/render error", renderErr);
      try { canvasRef.current?.getContext("2d")?.restore(); } catch (_) {}
    }
  }, [exercise]); // exercise is the only reactive dep needed

  // ── MediaPipe Pose setup ──────────────────────────────────────────────────

  useEffect(() => {
    if (!cameraReady) return;
    const video = webcamRef.current?.video;
    if (!video) return;

    const pose = new Pose({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
    });
    pose.setOptions({
      modelComplexity:        1,
      smoothLandmarks:        true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence:  0.5,
    });
    pose.onResults(onResults);

    const camera = new Camera(video, {
      onFrame: async () => { await pose.send({ image: video }); },
      width: 640,
      height: 480,
    });
    camera.start();

    return () => { camera.stop(); pose.close(); };
  }, [cameraReady, onResults]);

  // ── Render ────────────────────────────────────────────────────────────────

  const fmtRest = (s) =>
    `Rest: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="app-container">
      {/* Hidden webcam — react-webcam manages the <video> element */}
      <Webcam
        ref={webcamRef}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        width={640}
        height={480}
        onUserMedia={() => {
          setWarmingUp(true);
          // 1500ms warm-up prevents bad first frames from corrupting backend
          setTimeout(() => { setWarmingUp(false); setCameraReady(true); }, 1500);
        }}
      />

      {/* Sets history strip */}
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
        <canvas ref={canvasRef} width={640} height={480} />

        {/* Camera warm-up overlay */}
        {warmingUp && (
          <div className="overlay-center warm-overlay">
            📷 Camera warming up…
          </div>
        )}

        {/* 3-2-1 countdown overlay */}
        {countdown !== null && (
          <div className="overlay-center countdown-overlay">
            {countdown}
          </div>
        )}

        {/* Rest timer overlay */}
        {restSecs !== null && (
          <div className="overlay-center rest-overlay">
            {fmtRest(restSecs)}
          </div>
        )}

        {/* HUD panel */}
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
            avgLatency={avgLatency}
          />

          <ControlPanel
            isRunning={isRunning}
            onToggle={handleToggle}
            onReset={() => resetCounter(true)}
            onEndWorkout={handleEndWorkout}
          />

          {/* Keyboard shortcut hints */}
          <div className="kb-hints">
            <span>Space: Start/Pause</span>
            <span>R: Reset</span>
            <span>1–7: Exercise</span>
          </div>

          <ScoreBoard
            currentExercise={exercise}
            currentReps={reps}
            bestReps={bestReps}
          />
        </div>
      </div>

      {/* Workout summary modal */}
      {showSummary && (
        <WorkoutSummary
          sets={sets}
          bestReps={bestReps}
          startTime={workoutStartRef.current}
          onClose={handleCloseSummary}
        />
      )}
    </div>
  );
}
