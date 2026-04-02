import React from "react";
import "../styles/controls.css";

const ControlPanel = ({ isRunning, onToggle, onReset, onEndWorkout }) => (
  <div className="control-panel">
    <div className="control-row">
      <button
        className={`btn ${isRunning ? "btn--pause" : "btn--start"}`}
        onClick={onToggle}
      >
        {isRunning ? "PAUSE" : "START"}
      </button>
      <button className="btn btn--reset" onClick={onReset}>
        RESET
      </button>
    </div>
    <button className="btn--end" onClick={onEndWorkout}>
      END WORKOUT
    </button>
  </div>
);

export default ControlPanel;
