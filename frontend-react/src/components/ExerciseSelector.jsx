import React from 'react';

const EXERCISES = [
    { id: 'bicep_curl',     name: 'Bicep Curl'      },  // key 1
    { id: 'pushups',        name: 'Pushups'          },  // key 2
    { id: 'squats',         name: 'Squats'           },  // key 3
    { id: 'shoulder_press', name: 'Shoulder Press'   },  // key 4
    { id: 'lateral_raise',  name: 'Lateral Raise'    },  // key 5
    { id: 'lunges',         name: 'Lunges'           },  // key 6
    { id: 'front_raise',    name: 'Front Raise'      },  // key 7
];

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
