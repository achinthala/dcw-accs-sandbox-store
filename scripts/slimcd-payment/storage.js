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

export function saveCheckoutSession(data) {
  const payload = JSON.stringify(data);
  sessionStorage.setItem(SESSION_STORAGE_KEY, payload);
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, payload);
  } catch (error) {
    // localStorage may be unavailable in strict privacy modes.
  }
}

export function loadCheckoutSession() {
  return readStoredPayload();
}

export function clearCheckoutSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(SESSION_STORAGE_KEY);
}
