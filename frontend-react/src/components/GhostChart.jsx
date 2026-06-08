import React, { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const toNumber = (value) => (Number.isFinite(value) ? value : null);

const normalizeCurves = (baselineGhostCurve, timeSeriesLog) => {
  const baseline = Array.isArray(baselineGhostCurve) ? baselineGhostCurve : [];
  const live = Array.isArray(timeSeriesLog)
    ? timeSeriesLog
        .slice(-220)
        .map((entry) => toNumber(entry?.smoothedAngle))
        .filter((value) => value !== null)
    : [];

  const maxLength = Math.max(baseline.length, live.length, 1);
  if (maxLength <= 1) {
    return [{ step: 0, baseline: baseline[0] ?? null, current: live[0] ?? null }];
  }

  return Array.from({ length: maxLength }, (_, idx) => {
    const baselineIdx =
      baseline.length > 1 ? Math.round((idx / (maxLength - 1)) * (baseline.length - 1)) : 0;
    const liveIdx = live.length > 1 ? Math.round((idx / (maxLength - 1)) * (live.length - 1)) : 0;

    return {
      step: idx,
      baseline: baseline.length ? toNumber(baseline[baselineIdx]) : null,
      current: live.length ? toNumber(live[liveIdx]) : null,
    };
  });
};

const GhostChart = ({ baselineGhostCurve = [], timeSeriesLog = [] }) => {
  const safeBaseline = useMemo(
    () => (Array.isArray(baselineGhostCurve) ? baselineGhostCurve : []),
    [baselineGhostCurve]
  );
  const safeTimeSeries = useMemo(
    () => (Array.isArray(timeSeriesLog) ? timeSeriesLog : []),
    [timeSeriesLog]
  );
  const hasAnyData = safeBaseline.length > 0 || safeTimeSeries.length > 0;

  const chartData = useMemo(
    () => normalizeCurves(safeBaseline, safeTimeSeries),
    [safeBaseline, safeTimeSeries]
  );

  return (
    <div
      style={{
        marginTop: "10px",
        background: "rgba(8, 15, 18, 0.85)",
        border: "1px solid rgba(0, 255, 200, 0.25)",
        borderRadius: "10px",
        padding: "8px 8px 4px",
      }}
    >
      <div
        style={{
          color: "#7fffd4",
          fontSize: "11px",
          letterSpacing: "0.7px",
          textTransform: "uppercase",
          marginBottom: "6px",
        }}
      >
        Ghost Curve Overlay
      </div>
      {!hasAnyData && (
        <div
          style={{
            color: "rgba(180, 230, 220, 0.75)",
            fontSize: "12px",
            marginBottom: "8px",
          }}
        >
          Complete your first calibration rep to unlock ghost tracking.
        </div>
      )}
      <div style={{ width: "100%", height: 145 }}>
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <CartesianGrid stroke="rgba(120,180,190,0.15)" strokeDasharray="3 3" />
            <XAxis hide dataKey="step" />
            <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
            <Tooltip
              contentStyle={{
                background: "#0c1a1f",
                border: "1px solid rgba(127,255,212,0.25)",
                color: "#c8fff2",
              }}
              labelStyle={{ color: "#9de7d6" }}
            />
            <Line
              type="monotone"
              dataKey="baseline"
              stroke="#80deea"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              opacity={0.55}
              name="Baseline Ghost"
            />
            <Line
              type="monotone"
              dataKey="current"
              stroke="#00ffc8"
              strokeWidth={2.7}
              dot={false}
              isAnimationActive={false}
              name="Current Trace"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default GhostChart;
