import React from "react";
import "../styles/stats.css";

const StatsDisplay = ({ angle, reps, stage, feedback, repSpeed, poseConf, avgLatency }) => {
  const speedWarning = repSpeed !== null && repSpeed < 0.8;

  let latencyClass = null;
  let latencyLabel = null;
  if (avgLatency !== null) {
    if (avgLatency < 100)       { latencyLabel = "FAST"; latencyClass = "badge--fast"; }
    else if (avgLatency <= 250) { latencyLabel = "OK";   latencyClass = "badge--ok"; }
    else                        { latencyLabel = "LAG";  latencyClass = "badge--lag"; }
  }

  return (
    <div className="stats-display">
      {/* Reps + Angle */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Reps</div>
          <div className="stat-value stat-value--reps">{reps}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Angle</div>
          <div className="stat-value stat-value--angle">
            {typeof angle === "number" ? angle.toFixed(0) : "--"}&deg;
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="badges-row">
        {poseConf && (
          <div className={`badge ${poseConf === "STRONG" ? "badge--strong" : "badge--weak"}`}>
            Pose: <strong>{poseConf}</strong>
          </div>
        )}
        {latencyLabel && (
          <div className={`badge ${latencyClass}`}>
            {latencyLabel} <span style={{ color: "#666" }}>({avgLatency}ms)</span>
          </div>
        )}
      </div>

      {/* Rep speed */}
      {repSpeed !== null && (
        <div className={`rep-speed ${speedWarning ? "rep-speed--warning" : "rep-speed--normal"}`}>
          <span>Rep speed</span>
          <strong>{repSpeed.toFixed(1)}s</strong>
        </div>
      )}

      {/* Stage */}
      {stage && (
        <div className={`stage-badge ${stage === "up" ? "stage-badge--up" : "stage-badge--down"}`}>
          STAGE: {stage}
        </div>
      )}

      {/* Feedback */}
      {feedback && <div className="feedback-toast">{feedback}</div>}
    </div>
  );
};

export default StatsDisplay;
