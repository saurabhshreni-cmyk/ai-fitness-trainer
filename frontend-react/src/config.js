const config = {
  // API base URL. VITE_API_URL is the canonical var; VITE_BACKEND_URL is kept
  // for backward compatibility. Defaults to local dev backend. When the backend
  // is not reachable (e.g. not yet deployed) the app degrades gracefully.
  backendUrl:
    import.meta.env.VITE_API_URL ??
    import.meta.env.VITE_BACKEND_URL ??
    'http://localhost:8000',
  appVersion: import.meta.env.VITE_APP_VERSION ?? '1.0.0',
  enableVoice: import.meta.env.VITE_ENABLE_VOICE !== 'false',
  enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS !== 'false',
  poseConfidence: parseFloat(import.meta.env.VITE_POSE_CONFIDENCE ?? '0.7'),
};

export default config;
