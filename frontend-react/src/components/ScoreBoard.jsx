import React from "react";
import "../styles/scoreboard.css";

const ScoreBoard = React.memo(({ currentExercise, currentReps, bestReps }) => {
  const goal = Math.ceil((currentReps + 1) / 10) * 10;
  const progress = (currentReps / goal) * 100;

  return (
    <div className="scoreboard">
      <div className="scoreboard__header">
        <span>Personal Best</span>
        <span className="scoreboard__best">{bestReps[currentExercise] || 0}</span>
      </div>
      <div className="scoreboard__goal">Next Goal: {goal} reps</div>
      <div className="progress-bar">
        <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
});

ScoreBoard.displayName = "ScoreBoard";
export default ScoreBoard;
