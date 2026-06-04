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

export const saveSessionToBackend = async (sessionData) => {
  if (!config.backendUrl) return null;
  try {
    const res = await fetchWithRetry('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData),
    });
    return await res.json();
  } catch {
    try {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      queue.push({ path: '/sessions', data: sessionData, timestamp: Date.now() });
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
