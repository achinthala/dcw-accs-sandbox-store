import { SESSION_STORAGE_KEY } from './constants.js';

function readStoredPayload() {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    || localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function sessionLookupKey(sessionId) {
  return `${SESSION_STORAGE_KEY}:${String(sessionId || '').toUpperCase()}`;
}

export function saveCheckoutSession(data) {
  const payload = JSON.stringify(data);
  sessionStorage.setItem(SESSION_STORAGE_KEY, payload);
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, payload);
    if (data?.sessionId) {
      localStorage.setItem(sessionLookupKey(data.sessionId), payload);
    }
  } catch (error) {
    // localStorage may be unavailable in strict privacy modes.
  }
}

export function loadCheckoutSession(sessionId) {
  const direct = readStoredPayload();
  if (direct) {
    return direct;
  }

  if (!sessionId) {
    return null;
  }

  const raw = sessionStorage.getItem(sessionLookupKey(sessionId))
    || localStorage.getItem(sessionLookupKey(sessionId));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export function clearCheckoutSession(sessionId) {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(SESSION_STORAGE_KEY);
  if (sessionId) {
    sessionStorage.removeItem(sessionLookupKey(sessionId));
    localStorage.removeItem(sessionLookupKey(sessionId));
  }
}
