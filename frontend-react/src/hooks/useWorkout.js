import { useState, useCallback, useRef } from "react";
import api from "../utils/api";

/**
 * Manages workout lifecycle: sets, summary, exercise selection.
 */
export default function useWorkout(initialExercise = "bicep_curl") {
  const [exercise,    setExercise]    = useState(initialExercise);
  const [sets,        setSets]        = useState([]);
  const [showSummary, setShowSummary] = useState(false);

  const workoutStartRef = useRef(null);
  const workoutIdRef    = useRef(null);

  const startWorkout = useCallback(async () => {
    workoutStartRef.current = Date.now();
    try {
      const res = await api.post("/workout/start");
      workoutIdRef.current = res.data.workout_id;
    } catch (_) {
      // Continue without persistence if DB unavailable
    }
  }, []);

  const recordSet = useCallback(async (ex, reps, formScores = []) => {
    if (reps <= 0) return;
    const avgScore = formScores.length
      ? formScores.reduce((a, b) => a + b, 0) / formScores.length
      : null;
    const bestScore = formScores.length ? Math.max(...formScores) : null;

    setSets(prev => [...prev, {
      exercise: ex, reps,
      avgFormScore: avgScore,
      timestamp: Date.now(),
    }]);

    if (workoutIdRef.current) {
      try {
        await api.post(`/workout/${workoutIdRef.current}/set`, {
          exercise: ex,
          reps,
          avg_form_score: avgScore,
          best_form_score: bestScore,
        });
      } catch (_) { /* best effort */ }
    }
  }, []);

  const endWorkout = useCallback(async () => {
    if (workoutIdRef.current) {
      try {
        await api.post(`/workout/${workoutIdRef.current}/end`);
      } catch (_) { /* best effort */ }
    }
    setShowSummary(true);
  }, []);

  const closeSummary = useCallback(() => {
    setShowSummary(false);
    setSets([]);
    workoutStartRef.current = null;
    workoutIdRef.current = null;
  }, []);

  const changeExercise = useCallback((newEx) => {
    setExercise(newEx);
    setSets([]);
  }, []);

  return {
    exercise, setExercise,
    sets,
    showSummary,
    workoutStartRef,
    startWorkout,
    recordSet,
    endWorkout,
    closeSummary,
    changeExercise,
  };
}
