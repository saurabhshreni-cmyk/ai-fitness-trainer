import React, { useMemo } from 'react';
import { downloadTimeSeriesCsv } from "../utils/sessionExport";

/**
 * WorkoutSummary modal
 * Props: sets, bestReps, startTime, onClose, sessionTimeSeriesLog
 */
const WorkoutSummary = ({ sets, bestReps, startTime, onClose, sessionTimeSeriesLog = [] }) => {
    const now = Date.now();
    const durationMs = startTime ? now - startTime : 0;
    const dMin = Math.floor(durationMs / 60000);
    const dSec = Math.floor((durationMs % 60000) / 1000);

    const byExercise = useMemo(() => {
        const map = {};
        for (const s of sets) {
            map[s.exercise] = (map[s.exercise] || 0) + s.reps;
        }
        return map;
    }, [sets]);

    const totalReps = sets.reduce((acc, s) => acc + s.reps, 0);

    const handleExport = () => {
        const dateStr = new Date().toISOString().split('T')[0];
        const rows = [['date', 'exercise', 'set', 'reps', 'duration_min']];
        sets.forEach((s, i) => {
            rows.push([
                new Date(s.timestamp).toISOString().split('T')[0],
                s.exercise,
                i + 1,
                s.reps,
                (durationMs / 60000).toFixed(2),
            ]);
        });
        const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: `fitness_log_${dateStr}.csv`,
        });
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const handleDownloadSessionData = () => {
        downloadTimeSeriesCsv(sessionTimeSeriesLog, "session_biomechanics_data");
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
            <div style={{
                background: '#1a1a1a', border: '1px solid #333', borderRadius: '14px',
                padding: '28px', width: '380px', maxWidth: '95vw', color: '#eee',
                boxShadow: '0 8px 40px rgba(0,0,0,0.7)', maxHeight: '90vh', overflowY: 'auto',
            }}>
                <h2 style={{ margin: '0 0 6px', fontSize: '20px' }}>🏆 Workout Summary</h2>
                <div style={{ color: '#888', fontSize: '13px', marginBottom: '18px' }}>
                    Duration: <strong style={{ color: '#ccc' }}>{dMin}m {dSec}s</strong>
                    &nbsp;|&nbsp;
                    Total reps: <strong style={{ color: '#4CAF50' }}>{totalReps}</strong>
                </div>

                {Object.keys(byExercise).length === 0 ? (
                    <div style={{ color: '#555', fontSize: '14px', marginBottom: '18px' }}>
                        No sets recorded.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '14px' }}>
                        <thead>
                            <tr style={{ color: '#888', borderBottom: '1px solid #2a2a2a' }}>
                                <th style={{ textAlign: 'left', padding: '6px 0' }}>Exercise</th>
                                <th style={{ textAlign: 'right', padding: '6px 0' }}>Reps</th>
                                <th style={{ textAlign: 'right', padding: '6px 0' }}>Best</th>
                                <th style={{ textAlign: 'right', padding: '6px 0' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(byExercise).map(([ex, total]) => {
                                const best  = bestReps[ex] || 0;
                                const isNew = total > best;
                                return (
                                    <tr key={ex} style={{ borderBottom: '1px solid #222' }}>
                                        <td style={{ padding: '8px 0', textTransform: 'capitalize' }}>
                                            {ex.replace(/_/g, ' ')}
                                        </td>
                                        <td style={{ textAlign: 'right', color: '#4CAF50', fontWeight: 'bold' }}>
                                            {total}
                                        </td>
                                        <td style={{ textAlign: 'right', color: '#FFD700' }}>{best}</td>
                                        <td style={{ textAlign: 'right', fontSize: '11px', color: '#4CAF50' }}>
                                            {isNew ? '🔥 PB!' : ''}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {sets.length > 0 && (
                    <div style={{ fontSize: '12px', color: '#555', marginBottom: '18px', lineHeight: '1.9' }}>
                        {sets.map((s, i) => (
                            <span key={i} style={{ marginRight: '10px' }}>
                                Set {i + 1}: <span style={{ color: '#bbb' }}>{s.reps}</span>
                            </span>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleExport}
                        disabled={sets.length === 0}
                        style={{
                            flex: 1, padding: '10px', borderRadius: '8px',
                            border: '1px solid #FF9800',
                            background: 'rgba(255,152,0,0.08)',
                            color: sets.length === 0 ? '#555' : '#FF9800',
                            fontWeight: 'bold', cursor: sets.length === 0 ? 'not-allowed' : 'pointer',
                            fontSize: '13px',
                        }}
                    >
                        Export CSV
                    </button>
                    <button
                        onClick={handleDownloadSessionData}
                        disabled={sessionTimeSeriesLog.length === 0}
                        style={{
                            flex: 1, minWidth: '140px', padding: '10px', borderRadius: '8px',
                            border: '1px solid #00e5ff',
                            background: 'rgba(0,229,255,0.08)',
                            color: sessionTimeSeriesLog.length === 0 ? '#4a5b60' : '#80deea',
                            fontWeight: 'bold', cursor: sessionTimeSeriesLog.length === 0 ? 'not-allowed' : 'pointer',
                            fontSize: '13px',
                        }}
                    >
                        Download Session Data (CSV)
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1, minWidth: '90px', padding: '10px', borderRadius: '8px',
                            border: 'none', background: '#333',
                            color: '#fff', fontWeight: 'bold',
                            cursor: 'pointer', fontSize: '13px',
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WorkoutSummary;
