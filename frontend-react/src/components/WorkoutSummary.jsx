import React, { useMemo } from "react";
import "../styles/summary.css";

const WorkoutSummary = ({ sets, bestReps, startTime, onClose }) => {
  const now = Date.now();
  const durationMs = startTime ? now - startTime : 0;
  const dMin = Math.floor(durationMs / 60000);
  const dSec = Math.floor((durationMs % 60000) / 1000);

  const byExercise = useMemo(() => {
    const map = {};
    for (const s of sets) {
      if (!map[s.exercise]) {
        map[s.exercise] = { reps: 0, formScores: [] };
      }
      map[s.exercise].reps += s.reps;
      if (s.avgFormScore) map[s.exercise].formScores.push(s.avgFormScore);
    }
    return map;
  }, [sets]);

  const totalReps = sets.reduce((acc, s) => acc + s.reps, 0);

  const handleExport = () => {
    const dateStr = new Date().toISOString().split("T")[0];
    const rows = [["date", "exercise", "set", "reps", "form_score", "duration_min"]];
    sets.forEach((s, i) => {
      rows.push([
        new Date(s.timestamp).toISOString().split("T")[0],
        s.exercise,
        i + 1,
        s.reps,
        s.avgFormScore ? s.avgFormScore.toFixed(1) : "",
        (durationMs / 60000).toFixed(2),
      ]);
    });
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `fitness_log_${dateStr}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="summary-overlay">
      <div className="summary-card">
        <h2>Workout Summary</h2>
        <div className="summary-meta">
          Duration: <strong>{dMin}m {dSec}s</strong>
          &nbsp;|&nbsp;
          Total reps: <strong className="total-reps">{totalReps}</strong>
        </div>

        {Object.keys(byExercise).length === 0 ? (
          <div className="summary-empty">No sets recorded.</div>
        ) : (
          <table className="summary-table">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Reps</th>
                <th>Best</th>
                <th>Form</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byExercise).map(([ex, data]) => {
                const best = bestReps[ex] || 0;
                const isNew = data.reps > best;
                const avgForm = data.formScores.length
                  ? (data.formScores.reduce((a, b) => a + b, 0) / data.formScores.length).toFixed(0)
                  : "--";

                return (
                  <tr key={ex}>
                    <td className="exercise-name">{ex.replace(/_/g, " ")}</td>
                    <td className="reps-col">{data.reps}</td>
                    <td className="best-col">{best}</td>
                    <td className="score-col">{avgForm}</td>
                    <td className="pb-col">{isNew ? "PB!" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {sets.length > 0 && (
          <div className="summary-sets">
            {sets.map((s, i) => (
              <span key={i}>
                Set {i + 1}: <span className="set-reps">{s.reps}</span>
              </span>
            ))}
          </div>
        )}

        <div className="summary-actions">
          <button className="btn--export" onClick={handleExport} disabled={sets.length === 0}>
            Export CSV
          </button>
          <button className="btn--close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkoutSummary;
