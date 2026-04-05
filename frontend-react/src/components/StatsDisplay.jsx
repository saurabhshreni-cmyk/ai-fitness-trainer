import React from "react";
import "../styles/stats.css";

const StatsDisplay = React.memo(({ angle, reps, stage, feedback, repSpeed, poseConf }) => {
  const speedWarning = repSpeed !== null && repSpeed < 0.8;

  return (
    <div className="stats-display">
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Reps</div>
          <div className="stat-value stat-value--reps">{reps}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Angle</div>
          <div className="stat-value stat-value--angle">
            {typeof angle === "number" ? angle : "--"}&deg;
          </div>
        </div>
      </div>

      {poseConf && (
        <div className="badges-row">
          <div className={`badge ${poseConf === "STRONG" ? "badge--strong" : "badge--weak"}`}>
            Pose: <strong>{poseConf}</strong>
          </div>
        </div>
      )}

      {repSpeed !== null && (
        <div className={`rep-speed ${speedWarning ? "rep-speed--warning" : "rep-speed--normal"}`}>
          <span>Rep speed</span>
          <strong>{repSpeed.toFixed(1)}s</strong>
        </div>
      )}

      {stage && (
        <div className={`stage-badge ${stage === "up" ? "stage-badge--up" : "stage-badge--down"}`}>
          STAGE: {stage}
        </div>
      )}

      {feedback && <div className="feedback-toast">{feedback}</div>}
    </div>
  );
});

StatsDisplay.displayName = "StatsDisplay";
export default StatsDisplay;
