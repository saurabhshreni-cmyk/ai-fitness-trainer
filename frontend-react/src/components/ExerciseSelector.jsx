import React from "react";
import { EXERCISE_CONFIG, EXERCISES } from "../constants";
import "../styles/controls.css";

const ExerciseSelector = ({ currentExercise, onSelect, disabled }) => (
  <div className="exercise-selector">
    <label htmlFor="exercise-select" className="sr-only">
      Select Exercise
    </label>
    <select
      id="exercise-select"
      className="exercise-select"
      value={currentExercise}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
    >
      {EXERCISES.map((id, i) => (
        <option key={id} value={id}>
          [{i + 1}] {EXERCISE_CONFIG[id]}
        </option>
      ))}
    </select>
  </div>
);

export default ExerciseSelector;
