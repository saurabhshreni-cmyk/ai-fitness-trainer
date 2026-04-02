import React from 'react';

const ScoreBoard = ({ currentExercise, currentReps, bestReps }) => {
    // Calculate progress towards next milestone (e.g. every 10 reps)
    const goal = Math.ceil((currentReps + 1) / 10) * 10;
    const progress = (currentReps / goal) * 100;

    return (
        <div className="scoreboard" style={{ marginTop: '15px', borderTop: '1px solid #444', paddingTop: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#ccc', marginBottom: '5px' }}>
                <span>Personal Best</span>
                <span style={{ color: '#FFD700', fontWeight: 'bold' }}>{bestReps[currentExercise] || 0}</span>
            </div>

            <div style={{ fontSize: '12px', color: '#888', marginBottom: '5px' }}>
                Next Goal: {goal} reps
            </div>

            <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #FF9800, #F44336)',
                    transition: 'width 0.3s ease'
                }} />
            </div>
        </div>
    );
};

export default ScoreBoard;
