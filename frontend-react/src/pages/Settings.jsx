import React, { useState, useEffect } from 'react';

const SETTINGS_KEY = 'ai_trainer_settings';

export const DEFAULT_SETTINGS = {
  poseConfidence: 0.7,
  smoothingAlpha: 0.3,
  voiceEnabled: true,
  hudTheme: 'cyberpunk',
  repSensitivity: 'normal',
  autoSaveBackend: true,
  cameraDeviceId: '',
};

export const loadSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = (settings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
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
  padding: '24px',
  marginBottom: '20px',
};

const LABEL_STYLE = {
  display: 'block',
  fontSize: '13px',
  color: '#7fffd4',
  textTransform: 'uppercase',
  letterSpacing: '0.7px',
  marginBottom: '8px',
};

const SliderRow = ({ label, value, min, max, step, onChange, unit }) => (
  <div style={{ marginBottom: '20px' }}>
    <label style={LABEL_STYLE}>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: '#00ffc8' }}
      />
      <span style={{ minWidth: '48px', textAlign: 'right', fontWeight: 'bold', color: '#00ffc8' }}>
        {value}{unit}
      </span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#444', marginTop: '2px' }}>
      <span>{min}{unit}</span><span>{max}{unit}</span>
    </div>
  </div>
);

const ToggleRow = ({ label, value, onChange, description }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
    <div>
      <div style={{ ...LABEL_STYLE, marginBottom: '2px' }}>{label}</div>
      {description && <div style={{ fontSize: '12px', color: '#555' }}>{description}</div>}
    </div>
    <button
      onClick={() => onChange(!value)}
      style={{
        width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer',
        background: value ? '#00ffc8' : '#333', position: 'relative', transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
        position: 'absolute', top: '3px',
        left: value ? '27px' : '3px', transition: 'left 0.2s',
      }} />
    </button>
  </div>
);

const SelectRow = ({ label, value, options, onChange }) => (
  <div style={{ marginBottom: '20px' }}>
    <label style={LABEL_STYLE}>{label}</label>
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '10px', borderRadius: '8px',
        background: '#1a2a2a', color: '#eee', border: '1px solid #2a3a3a',
        fontSize: '14px', cursor: 'pointer',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

export default function SettingsPage() {
  const [settings, setSettings] = useState(loadSettings);
  const [saved, setSaved] = useState(false);
  const [cameras, setCameras] = useState([]);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoInputs);
    }).catch(() => {});
  }, []);

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    setSaved(false);
  };

  return (
    <div style={PAGE_STYLE}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#00ffc8' }}>⚙️ Settings</h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleReset}
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #555', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: '13px' }}
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '8px 20px', borderRadius: '8px', border: 'none',
                background: saved ? '#4CAF50' : '#00ffc8',
                color: '#000', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
                transition: 'background 0.3s',
              }}
            >
              {saved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </div>

        {/* Camera */}
        <div style={CARD_STYLE}>
          <h2 style={{ margin: '0 0 20px', fontSize: '16px', color: '#eee' }}>📷 Camera</h2>
          {cameras.length > 0 ? (
            <SelectRow
              label="Camera Device"
              value={settings.cameraDeviceId}
              onChange={v => update('cameraDeviceId', v)}
              options={[
                { value: '', label: 'Default Camera' },
                ...cameras.map(c => ({ value: c.deviceId, label: c.label || `Camera ${c.deviceId.slice(0, 8)}` })),
              ]}
            />
          ) : (
            <p style={{ color: '#555', fontSize: '13px' }}>Camera devices will appear after granting camera permission.</p>
          )}
        </div>

        {/* Pose Detection */}
        <div style={CARD_STYLE}>
          <h2 style={{ margin: '0 0 20px', fontSize: '16px', color: '#eee' }}>🤖 Pose Detection</h2>
          <SliderRow
            label="Pose Confidence Threshold"
            value={settings.poseConfidence} min={0.5} max={0.9} step={0.05}
            onChange={v => update('poseConfidence', v)} unit=""
          />
          <SliderRow
            label="EMA Smoothing Alpha"
            value={settings.smoothingAlpha} min={0.1} max={0.5} step={0.05}
            onChange={v => update('smoothingAlpha', v)} unit=""
          />
          <SelectRow
            label="Rep Counting Sensitivity"
            value={settings.repSensitivity}
            onChange={v => update('repSensitivity', v)}
            options={[
              { value: 'strict', label: 'Strict (requires full ROM)' },
              { value: 'normal', label: 'Normal (recommended)' },
              { value: 'relaxed', label: 'Relaxed (partial reps count)' },
            ]}
          />
        </div>

        {/* HUD */}
        <div style={CARD_STYLE}>
          <h2 style={{ margin: '0 0 20px', fontSize: '16px', color: '#eee' }}>🎨 HUD & Display</h2>
          <SelectRow
            label="HUD Color Theme"
            value={settings.hudTheme}
            onChange={v => update('hudTheme', v)}
            options={[
              { value: 'cyberpunk', label: 'Cyberpunk (Green/Cyan)' },
              { value: 'minimal', label: 'Minimal (White)' },
              { value: 'highcontrast', label: 'High Contrast (Yellow/Orange)' },
            ]}
          />
        </div>

        {/* Audio */}
        <div style={CARD_STYLE}>
          <h2 style={{ margin: '0 0 20px', fontSize: '16px', color: '#eee' }}>🔊 Audio</h2>
          <ToggleRow
            label="Voice Feedback"
            value={settings.voiceEnabled}
            onChange={v => update('voiceEnabled', v)}
            description="Announce rep counts and form cues aloud"
          />
        </div>

        {/* Data */}
        <div style={CARD_STYLE}>
          <h2 style={{ margin: '0 0 20px', fontSize: '16px', color: '#eee' }}>💾 Data</h2>
          <ToggleRow
            label="Auto-save to Backend"
            value={settings.autoSaveBackend}
            onChange={v => update('autoSaveBackend', v)}
            description="Sync sessions to backend API when available (requires VITE_BACKEND_URL)"
          />
          <div style={{ background: 'rgba(0,255,200,0.05)', border: '1px solid rgba(0,255,200,0.15)', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#556b6b' }}>
            ℹ️ Sessions are always saved to localStorage first. Backend sync is optional.
          </div>
        </div>

        <div style={{ textAlign: 'center', color: '#333', fontSize: '12px', paddingBottom: '24px' }}>
          Settings saved locally on this device only.
        </div>
      </div>
    </div>
  );
}
