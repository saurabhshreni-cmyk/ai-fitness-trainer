const config = {
  backendUrl: import.meta.env.VITE_BACKEND_URL ?? '',
  appVersion: import.meta.env.VITE_APP_VERSION ?? '1.0.0',
  enableVoice: import.meta.env.VITE_ENABLE_VOICE !== 'false',
  enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS !== 'false',
  poseConfidence: parseFloat(import.meta.env.VITE_POSE_CONFIDENCE ?? '0.7'),
};

export default config;
