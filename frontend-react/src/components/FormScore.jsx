import React from "react";
import "../styles/form-score.css";

const CIRCUMFERENCE = 2 * Math.PI * 20; // r=20

function scoreColor(score) {
  if (score >= 80) return "#4CAF50";
  if (score >= 60) return "#FF9800";
  return "#e53935";
}

const FormScore = ({ formScore, formDetails }) => {
  if (!formDetails) return null;

  const score = formDetails.last_score ?? formDetails.avg_score ?? 0;
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
  const color = scoreColor(score);

  return (
    <div className="form-score">
      <div className="form-gauge">
        <svg viewBox="0 0 52 52">
          <circle className="form-gauge__bg" cx="26" cy="26" r="20" />
          <circle
            className="form-gauge__fill"
            cx="26" cy="26" r="20"
            stroke={color}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="form-gauge__text" style={{ color }}>
          {Math.round(score)}
        </div>
      </div>

      <div className="form-score__details">
        <div className="form-score__label">Form Score</div>
        <div style={{ color, fontWeight: "bold", fontSize: "15px" }}>
          {score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Decent" : "Needs Work"}
        </div>
        {formDetails.avg_score && (
          <div className="form-score__avg">
            Avg: {formDetails.avg_score} | Best: {formDetails.best_score}
          </div>
        )}
      </div>
    </div>
  );
};

export default FormScore;
