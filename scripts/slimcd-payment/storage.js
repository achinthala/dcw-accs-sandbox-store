import { SESSION_STORAGE_KEY } from './constants.js';

export function saveCheckoutSession(data) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
}

export function loadCheckoutSession() {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function clearCheckoutSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}
