import React from 'react';
import { EXERCISE_LABELS } from "../utils/exercises";

const EXERCISES = Object.entries(EXERCISE_LABELS).map(([id, name]) => ({ id, name }));

const ExerciseSelector = ({ currentExercise, onSelect, disabled }) => (
    <div className="exercise-selector">
        <select
            value={currentExercise}
            onChange={(e) => onSelect(e.target.value)}
            disabled={disabled}
            style={{
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: '#2a2a2a',
                color: 'white',
                border: '1px solid #555',
                fontSize: '15px',
                width: '100%',
                marginBottom: '10px',
                cursor: disabled ? 'not-allowed' : 'pointer',
            }}
        >
            {EXERCISES.map((ex, i) => (
                <option key={ex.id} value={ex.id}>
                    [{i + 1}] {ex.name}
                </option>
            ))}
        </select>
    </div>
);

export default ExerciseSelector;
