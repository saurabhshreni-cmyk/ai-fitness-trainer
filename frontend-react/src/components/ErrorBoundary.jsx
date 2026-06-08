import React from 'react';

const cardStyle = {
  background: '#0d1117',
  border: '1px solid #ff4444',
  borderRadius: '12px',
  padding: '32px',
  maxWidth: '480px',
  margin: '40px auto',
  color: '#eee',
  fontFamily: 'monospace',
};

const btnStyle = {
  marginTop: '16px',
  padding: '10px 24px',
  borderRadius: '8px',
  border: 'none',
  background: '#ff4444',
  color: '#fff',
  fontWeight: 'bold',
  cursor: 'pointer',
  fontSize: '14px',
};

export class AppErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (typeof console !== 'undefined') {
      console.error('[AppErrorBoundary]', error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0d1117' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px', color: '#ff6b6b' }}>Something went wrong</h2>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '4px' }}>
              Your workout data is safe in localStorage.
            </p>
            <p style={{ color: '#555', fontSize: '12px', fontFamily: 'monospace' }}>
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button style={btnStyle} onClick={() => window.location.reload()}>
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export class PoseErrorBoundary extends React.Component {
  state = { hasError: false, manualReps: 0 };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (typeof console !== 'undefined') {
      console.error('[PoseErrorBoundary]', error);
    }
  }

  render() {
    if (this.state.hasError) {
      const { manualReps } = this.state;
      return (
        <div style={{
          background: 'rgba(13,17,23,0.95)',
          border: '1px solid #ff9800',
          borderRadius: '12px',
          padding: '24px',
          textAlign: 'center',
          color: '#eee',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🤖</div>
          <p style={{ color: '#ff9800', fontWeight: 'bold', marginBottom: '4px' }}>
            Pose engine crashed
          </p>
          <p style={{ color: '#888', fontSize: '13px', marginBottom: '20px' }}>
            Switching to manual rep counting mode
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
            <button
              style={{ ...btnStyle, background: '#444', fontSize: '24px', padding: '8px 20px' }}
              onClick={() => this.setState(s => ({ manualReps: Math.max(0, s.manualReps - 1) }))}
            >−</button>
            <span style={{ fontSize: '48px', fontWeight: 'bold', color: '#4CAF50', minWidth: '60px' }}>
              {manualReps}
            </span>
            <button
              style={{ ...btnStyle, background: '#43a047', fontSize: '24px', padding: '8px 20px' }}
              onClick={() => this.setState(s => ({ manualReps: s.manualReps + 1 }))}
            >+</button>
          </div>
          <p style={{ color: '#555', fontSize: '11px', marginTop: '12px' }}>REPS (manual)</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export class ChartErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          color: '#555',
          fontSize: '13px',
          background: 'rgba(8,15,18,0.85)',
          borderRadius: '10px',
          border: '1px solid rgba(0,255,200,0.1)',
        }}>
          Chart temporarily unavailable.
        </div>
      );
    }
    return this.props.children;
  }
}
