import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { loadSessions, deleteSessionById, clearAllSessions } from '../utils/sessionStorage';
import { ChartErrorBoundary } from '../components/ErrorBoundary';

const EXERCISE_COLORS = {
  bicep_curl: '#00ffc8',
  pushups: '#ff6b6b',
  squats: '#ffd93d',
  shoulder_press: '#6bcbff',
  lateral_raise: '#c77dff',
  lunges: '#ff9f43',
  front_raise: '#ff6b9d',
  deadlift: '#a8ff78',
  tricep_extension: '#f8cdda',
};

const PAGE_STYLE = {
  minHeight: '100vh',
  background: '#0d1117',
  color: '#eee',
  padding: '24px',
  fontFamily: 'Inter, monospace, sans-serif',
};

const CARD_STYLE = {
  background: 'rgba(8,15,18,0.9)',
  border: '1px solid rgba(0,255,200,0.2)',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '20px',
};

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: '#0c1a1f',
    border: '1px solid rgba(0,255,200,0.25)',
    color: '#c8fff2',
    borderRadius: '8px',
  },
};

export default function HistoryPage() {
  const [sessions, setSessions] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearConfirm2, setClearConfirm2] = useState(false);

  const reload = useCallback(() => {
    setSessions(loadSessions());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = (id) => {
    deleteSessionById(id);
    setDeleteTarget(null);
    reload();
  };

  const handleClearAll = () => {
    if (!clearConfirm) { setClearConfirm(true); return; }
    if (!clearConfirm2) { setClearConfirm2(true); return; }
    clearAllSessions();
    setClearConfirm(false);
    setClearConfirm2(false);
    reload();
  };

  // Build chart data
  const last30 = sessions.slice(0, 30).reverse();

  const repsOverTime = last30.map((s, i) => ({
    date: new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    reps: s.totalReps,
    i,
  }));

  const formOverTime = last30.map((s) => ({
    date: new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    formScore: s.avgFormScore,
  }));

  const exerciseDist = Object.entries(
    sessions.reduce((acc, s) => {
      acc[s.exercise] = (acc[s.exercise] || 0) + s.totalReps;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value, raw: name }));

  const personalRecords = Object.entries(
    sessions.reduce((acc, s) => {
      const key = s.exercise;
      if (!acc[key] || s.avgFormScore > acc[key].avgFormScore) acc[key] = s;
      return acc;
    }, {})
  );

  const totalReps = sessions.reduce((a, s) => a + s.totalReps, 0);
  const avgForm = sessions.length
    ? Math.round(sessions.reduce((a, s) => a + s.avgFormScore, 0) / sessions.length)
    : 0;

  return (
    <div style={PAGE_STYLE}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', color: '#00ffc8' }}>📊 History & Analytics</h1>
            <p style={{ margin: '4px 0 0', color: '#555', fontSize: '13px' }}>
              {sessions.length} sessions · {totalReps} total reps · {avgForm}/100 avg form
            </p>
          </div>
          {sessions.length > 0 && (
            <button
              onClick={handleClearAll}
              style={{
                padding: '8px 16px', borderRadius: '8px',
                border: '1px solid #ff4444',
                background: clearConfirm2 ? 'rgba(255,68,68,0.2)' : 'transparent',
                color: '#ff4444', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
              }}
            >
              {clearConfirm2 ? '⚠️ CONFIRM DELETE ALL' : clearConfirm ? '⚠️ Click again to confirm' : '🗑 Clear All'}
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          <div style={{ ...CARD_STYLE, textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏋️</div>
            <h3 style={{ color: '#555', margin: '0 0 8px' }}>No sessions yet</h3>
            <p style={{ color: '#444', fontSize: '14px' }}>
              Complete a workout and end it to save your first session.
            </p>
          </div>
        ) : (
          <>
            {/* Charts row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              {/* Reps over time */}
              <div style={CARD_STYLE}>
                <h3 style={{ margin: '0 0 16px', fontSize: '14px', color: '#7fffd4', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                  Reps Over Time
                </h3>
                <ChartErrorBoundary>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={repsOverTime}>
                      <CartesianGrid stroke="rgba(120,180,190,0.1)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#555', fontSize: 10 }} />
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="reps" stroke="#00ffc8" strokeWidth={2} dot={false} name="Reps" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartErrorBoundary>
              </div>

              {/* Form score trend */}
              <div style={CARD_STYLE}>
                <h3 style={{ margin: '0 0 16px', fontSize: '14px', color: '#7fffd4', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                  Form Score Trend
                </h3>
                <ChartErrorBoundary>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={formOverTime}>
                      <CartesianGrid stroke="rgba(120,180,190,0.1)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#555', fontSize: 10 }} />
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="formScore" stroke="#ffd93d" strokeWidth={2} dot={false} name="Form Score" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartErrorBoundary>
              </div>

              {/* Exercise distribution */}
              <div style={CARD_STYLE}>
                <h3 style={{ margin: '0 0 16px', fontSize: '14px', color: '#7fffd4', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                  Exercise Distribution
                </h3>
                <ChartErrorBoundary>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={exerciseDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                        {exerciseDist.map((entry) => (
                          <Cell key={entry.raw} fill={EXERCISE_COLORS[entry.raw] || '#888'} />
                        ))}
                      </Pie>
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: '11px', color: '#888' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartErrorBoundary>
              </div>

              {/* Personal records */}
              <div style={CARD_STYLE}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#7fffd4', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                  Personal Records (Best Form)
                </h3>
                <div style={{ overflowY: 'auto', maxHeight: '160px' }}>
                  {personalRecords.map(([ex, s]) => (
                    <div key={ex} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1a2a2a', fontSize: '13px' }}>
                      <span style={{ color: '#aaa', textTransform: 'capitalize' }}>{ex.replace(/_/g, ' ')}</span>
                      <span style={{ color: '#ffd93d', fontWeight: 'bold' }}>{s.avgFormScore}/100</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Session list */}
            <div style={CARD_STYLE}>
              <h3 style={{ margin: '0 0 16px', fontSize: '14px', color: '#7fffd4', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                Session Log ({sessions.length})
              </h3>
              <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
                {sessions.map((s) => (
                  <div key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 0', borderBottom: '1px solid #1a2a2a',
                  }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px', textTransform: 'capitalize' }}>
                        {s.exercise.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
                        {new Date(s.createdAt).toLocaleString()} · {s.sets} set{s.sets !== 1 ? 's' : ''} · {Math.round(s.durationSeconds / 60)}m {s.durationSeconds % 60}s
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4CAF50' }}>{s.totalReps}</div>
                        <div style={{ fontSize: '11px', color: '#555' }}>reps</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ffd93d' }}>{s.avgFormScore}</div>
                        <div style={{ fontSize: '11px', color: '#555' }}>form</div>
                      </div>
                      <button
                        onClick={() => setDeleteTarget(s.id)}
                        style={{
                          padding: '6px 12px', borderRadius: '6px',
                          border: '1px solid #333', background: 'transparent',
                          color: '#ff4444', cursor: 'pointer', fontSize: '12px',
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ ...CARD_STYLE, maxWidth: '360px', textAlign: 'center', marginBottom: 0 }}>
            <h3 style={{ margin: '0 0 12px', color: '#ff4444' }}>Delete session?</h3>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '20px' }}>
              This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid #555', background: 'transparent', color: '#aaa', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#ff4444', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
