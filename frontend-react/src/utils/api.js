import config from '../config';

const QUEUE_KEY = 'ai_trainer_pending_queue';
let _backendAvailable = null;

export const checkBackend = async () => {
  if (!config.backendUrl) { _backendAvailable = false; return false; }
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${config.backendUrl}/ping`, { signal: ctrl.signal });
    clearTimeout(id);
    _backendAvailable = res.ok;
    return res.ok;
  } catch {
    _backendAvailable = false;
    return false;
  }
};

export const isBackendAvailable = () => _backendAvailable;

export const fetchWithRetry = async (path, options = {}, retries = 3, timeoutMs = 5000) => {
  const url = `${config.backendUrl}${path}`;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(id);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      _backendAvailable = true;
      return res;
    } catch (err) {
      clearTimeout(id);
      lastError = err;
      _backendAvailable = false;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
};

/**
 * Maps the localStorage session record (camelCase, client-side shape) to the
 * backend's SessionCreateSchema (snake_case). Without this, the backend stored
 * reps=0 / duration=0 because the field names never matched.
 */
export const toBackendPayload = (record) => ({
  exercise: record.exercise,
  sets: record.sets ?? (Array.isArray(record.setLog) ? record.setLog.length : 0),
  reps: record.totalReps ?? 0,
  duration_seconds: record.durationSeconds ?? 0,
  avg_form_score: record.avgFormScore ?? 0,
  best_form_score: record.avgFormScore ?? 0,
  rep_log: [],
  summary: {
    clientId: record.id,
    createdAt: record.createdAt,
    setLog: record.setLog ?? [],
  },
});

export const saveSessionToBackend = async (sessionData) => {
  if (!config.backendUrl) return null;
  const payload = toBackendPayload(sessionData);
  try {
    const res = await fetchWithRetry('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    try {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      queue.push({ path: '/sessions', data: payload, timestamp: Date.now() });
      if (queue.length > 50) queue.splice(0, queue.length - 50);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      /* localStorage unavailable — drop silently, app stays functional */
    }
    return null;
  }
};

export const flushQueue = async () => {
  if (!config.backendUrl) return;
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      try {
        await fetchWithRetry(item.path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data),
        });
      } catch {
        remaining.push(item);
      }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  } catch {
    /* queue flush failed — will retry on next call */
  }
};

export const getSessions = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const res = await fetchWithRetry(`/sessions${query ? `?${query}` : ''}`);
  return res.json();
};

export const deleteSession = async (id) => {
  await fetchWithRetry(`/sessions/${id}`, { method: 'DELETE' });
};

export const deleteAllSessions = async () => {
  await fetchWithRetry('/sessions', {
    method: 'DELETE',
    headers: { 'X-Confirm-Delete': 'true' },
  });
};

export const getAnalyticsSummary = async () => {
  const res = await fetchWithRetry('/analytics/summary');
  return res.json();
};
