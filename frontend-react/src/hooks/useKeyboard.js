import { useEffect } from "react";
import { EXERCISES } from "../constants";

/**
 * Keyboard shortcut handler.
 * Space = start/pause, R = reset, 1-7 = exercise select.
 */
export default function useKeyboard({ onToggle, onReset, onExerciseChange }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

      if (e.code === "Space") {
        e.preventDefault();
        onToggle();
      } else if (e.key === "r" || e.key === "R") {
        onReset();
      } else if (e.key >= "1" && e.key <= "7") {
        const idx = parseInt(e.key, 10) - 1;
        if (EXERCISES[idx]) onExerciseChange(EXERCISES[idx]);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle, onReset, onExerciseChange]);
}
