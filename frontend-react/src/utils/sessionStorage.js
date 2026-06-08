const SESSIONS_KEY = 'ai_trainer_sessions';
const MAX_SESSIONS = 200;

const validateSession = (s) =>
  s &&
  typeof s.id === 'string' &&
  typeof s.exercise === 'string' &&
  typeof s.totalReps === 'number';

export const loadSessions = () => {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validateSession);
  } catch {
    return [];
  }
};

export const saveSession = (session) => {
  try {
    const sessions = loadSessions();
    const next = [session, ...sessions].slice(0, MAX_SESSIONS);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
    return true;
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      try {
        const sessions = loadSessions();
        const trimmed = sessions.slice(0, sessions.length - 5);
        localStorage.setItem(SESSIONS_KEY, JSON.stringify([session, ...trimmed]));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
};

export const deleteSessionById = (id) => {
  try {
    const sessions = loadSessions().filter(s => s.id !== id);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    return true;
  } catch {
    return false;
  }
};

export const clearAllSessions = () => {
  try {
    localStorage.removeItem(SESSIONS_KEY);
    return true;
  } catch {
    return false;
  }
};

export const buildSessionRecord = ({ exercise, sets, startTime, avgFormScore = 100 }) => {
  const now = Date.now();
  const totalReps = sets.reduce((acc, s) => acc + s.reps, 0);
  return {
    id: `sess_${now}_${Math.random().toString(36).slice(2, 8)}`,
    exercise,
    sets: sets.length,
    totalReps,
    durationSeconds: startTime ? Math.round((now - startTime) / 1000) : 0,
    avgFormScore: Math.round(avgFormScore),
    createdAt: new Date().toISOString(),
    setLog: sets.map((s, i) => ({ set: i + 1, reps: s.reps, exercise: s.exercise })),
  };
};
