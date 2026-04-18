import React from 'react';

const StatsDisplay = ({ angle, reps, stage, feedback, repSpeed, poseConf, avgLatency, formScore }) => {
    const speedWarning = repSpeed !== null && repSpeed < 0.8;

    // Latency badge
    let latencyLabel = null;
    let latencyColor = null;
    if (avgLatency !== null) {
        if (avgLatency < 100)       { latencyLabel = "🟢 FAST"; latencyColor = "#81c784"; }
        else if (avgLatency <= 250) { latencyLabel = "🟡 OK";   latencyColor = "#fff176"; }
        else                        { latencyLabel = "🟠 LAG";  latencyColor = "#ffb74d"; }
    }

    // Pose confidence badge
    let poseColor = null;
    if (poseConf === "STRONG") poseColor = "#4CAF50";
    if (poseConf === "WEAK")   poseColor = "#FF9800";

    return (
        <div className="stats-display">
            {/* Reps + Angle */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                <div style={{ flex: 1, background: '#222', padding: '10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase' }}>Reps</div>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4CAF50' }}>{reps}</div>
                </div>
                <div style={{ flex: 1, background: '#222', padding: '10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase' }}>Angle</div>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2196F3' }}>
                        {typeof angle === 'number' ? angle.toFixed(0) : '--'}°
                    </div>
                </div>
            </div>

            {/* Pose confidence + Latency row */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                {poseConf && (
                    <div style={{
                        flex: 1, padding: '5px 8px', borderRadius: '6px',
                        background: 'rgba(0,0,0,0.3)',
                        border: `1px solid ${poseColor}`,
                        fontSize: '12px', color: poseColor, textAlign: 'center',
                    }}>
                        Pose: <strong>{poseConf}</strong>
                    </div>
                )}
                {latencyLabel && (
                    <div style={{
                        flex: 1, padding: '5px 8px', borderRadius: '6px',
                        background: 'rgba(0,0,0,0.3)',
                        border: `1px solid ${latencyColor}22`,
                        fontSize: '12px', color: latencyColor, textAlign: 'center',
                    }}>
                        {latencyLabel} <span style={{ color: '#666' }}>({avgLatency}ms)</span>
                    </div>
                )}
            </div>

            {/* Rep speed */}
            {repSpeed !== null && (
                <div style={{
                    padding: '6px 10px', borderRadius: '6px', marginBottom: '8px',
                    background: speedWarning ? 'rgba(244,67,54,0.12)' : 'rgba(33,150,243,0.1)',
                    color: speedWarning ? '#ef9a9a' : '#90caf9',
                    fontSize: '13px', display: 'flex', justifyContent: 'space-between',
                }}>
                    <span>Rep speed</span>
                    <strong>{repSpeed.toFixed(1)}s</strong>
                </div>
            )}

            {typeof formScore === 'number' && (
                <div style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    background: formScore >= 80 ? 'rgba(76,175,80,0.12)' : 'rgba(255,152,0,0.12)',
                    color: formScore >= 80 ? '#81c784' : '#ffb74d',
                    fontSize: '13px',
                    display: 'flex',
                    justifyContent: 'space-between',
                }}>
                    <span>Form score</span>
                    <strong>{Math.round(formScore)}/100</strong>
                </div>
            )}

            {/* Stage badge */}
            {stage && (
                <div style={{
                    padding: '7px', borderRadius: '6px', marginBottom: '8px',
                    background: stage === 'up' ? 'rgba(76,175,80,0.18)' : 'rgba(33,150,243,0.18)',
                    color: stage === 'up' ? '#81c784' : '#64b5f6',
                    textAlign: 'center', fontWeight: 'bold',
                    textTransform: 'uppercase', fontSize: '13px',
                }}>
                    STAGE: {stage}
                </div>
            )}

            {/* Feedback toast */}
            {feedback && (
                <div style={{
                    padding: '8px', borderRadius: '6px',
                    background: '#ff9800', color: 'black',
                    textAlign: 'center', fontWeight: 'bold', fontSize: '13px',
                }}>
                    {feedback}
                </div>
            )}
        </div>
    );
};

export default StatsDisplay;
