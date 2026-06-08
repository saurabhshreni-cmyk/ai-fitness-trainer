import React from 'react';

const ControlPanel = ({ isRunning, onToggle, onReset, onEndWorkout, onStop, cameraActive }) => (
    <div className="control-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
            <button
                onClick={onToggle}
                style={{
                    flex: 1, padding: '11px', borderRadius: '8px', border: 'none',
                    backgroundColor: isRunning ? '#e53935' : '#43a047',
                    color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px',
                    letterSpacing: '0.5px',
                }}
            >
                {isRunning ? 'PAUSE' : 'START'}
            </button>
            <button
                onClick={onReset}
                style={{
                    flex: 1, padding: '11px', borderRadius: '8px', border: 'none',
                    backgroundColor: '#555', color: 'white',
                    fontWeight: 'bold', cursor: 'pointer', fontSize: '14px',
                    letterSpacing: '0.5px',
                }}
            >
                RESET
            </button>
        </div>
        <button
            onClick={onEndWorkout}
            style={{
                width: '100%', padding: '9px', borderRadius: '8px',
                border: '1px solid #FF9800',
                backgroundColor: 'rgba(255,152,0,0.1)',
                color: '#FF9800', fontWeight: 'bold', cursor: 'pointer',
                fontSize: '13px', letterSpacing: '0.4px',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
        >
            ⏹ END WORKOUT (save &amp; review)
        </button>
        {cameraActive && (
            <button
                onClick={onStop}
                title="Save, then turn off the camera and end the session"
                style={{
                    width: '100%', padding: '11px', borderRadius: '8px',
                    border: 'none', backgroundColor: '#b71c1c',
                    color: 'white', fontWeight: 'bold', cursor: 'pointer',
                    fontSize: '13px', letterSpacing: '0.4px',
                }}
            >
                ⏻ STOP SESSION (turn off camera)
            </button>
        )}
    </div>
);

export default ControlPanel;
