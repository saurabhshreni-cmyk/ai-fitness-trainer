import { useState, useEffect, useRef, useCallback } from "react";
import useSpeech from "./useSpeech";
import { REST_AFTER } from "../constants";

/**
 * Tracks rep state: speed, rest timer, personal bests.
 */
export default function useRepTracking(exercise) {
  const [reps,     setReps]     = useState(0);
  const [stage,    setStage]    = useState(null);
  const [feedback, setFeedback] = useState("");
  const [repSpeed, setRepSpeed] = useState(null);
  const [restSecs, setRestSecs] = useState(null);
  const [bestReps, setBestReps] = useState({});
  const [formScore, setFormScore]     = useState(null);
  const [formDetails, setFormDetails] = useState(null);
  const [isRunning, setIsRunning]     = useState(false);

  const prevReps        = useRef(0);
  const repTimestamps   = useRef([]);
  const lastRepTime     = useRef(null);
  const restTimerId     = useRef(null);
  const isRunningRef    = useRef(false);

  const { speak } = useSpeech();

  // Keep ref in sync
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  // Load best reps from localStorage
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("ai_trainer_best_reps")) || {};
    setBestReps(saved);
  }, []);

  // Update best reps
  useEffect(() => {
    if (reps > (bestReps[exercise] || 0)) {
      const nb = { ...bestReps, [exercise]: reps };
      setBestReps(nb);
      localStorage.setItem("ai_trainer_best_reps", JSON.stringify(nb));
    }
  }, [reps, exercise, bestReps]);

  // Rep detection → audio + speed
  useEffect(() => {
    if (reps > prevReps.current) {
      speak("Good rep!");
      setFeedback("Good Rep!");
      setTimeout(() => setFeedback(""), 1500);

      const now = Date.now();
      repTimestamps.current.push(now);
      if (repTimestamps.current.length > 10) repTimestamps.current.shift();
      if (repTimestamps.current.length >= 2) {
        const arr = repTimestamps.current;
        const speed = (arr[arr.length - 1] - arr[arr.length - 2]) / 1000;
        setRepSpeed(speed);
        if (speed < 0.8) setFeedback("Slow down — control the rep");
      }

      lastRepTime.current = now;
      setRestSecs(null);
    }
    prevReps.current = reps;
  }, [reps, speak]);

  // Rest timer
  useEffect(() => {
    if (isRunning) {
      lastRepTime.current = Date.now();
      restTimerId.current = setInterval(() => {
        if (!lastRepTime.current) return;
        const elapsed = Date.now() - lastRepTime.current;
        if (elapsed >= REST_AFTER) {
          const secs = Math.floor((elapsed - REST_AFTER) / 1000);
          setRestSecs(secs);
          if (secs === 0) speak("Rest period");
        } else {
          setRestSecs(null);
        }
      }, 1000);
    } else {
      clearInterval(restTimerId.current);
      setRestSecs(null);
    }
    return () => clearInterval(restTimerId.current);
  }, [isRunning, speak]);

  const resetReps = useCallback(() => {
    setReps(0);
    setStage(null);
    setRepSpeed(null);
    setFormScore(null);
    setFormDetails(null);
    setFeedback("Counter Reset");
    prevReps.current = 0;
    repTimestamps.current = [];
    lastRepTime.current = null;
  }, []);

  return {
    reps, setReps,
    stage, setStage,
    feedback, setFeedback,
    repSpeed,
    restSecs,
    bestReps,
    formScore, setFormScore,
    formDetails, setFormDetails,
    isRunning, setIsRunning,
    isRunningRef,
    resetReps,
  };
}
