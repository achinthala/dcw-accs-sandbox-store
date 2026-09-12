import { CAPTURED_PAYMENT_STORAGE_KEY, SESSION_STORAGE_KEY } from './constants.js';

const COOKIE_NAME = 'slimcd_pending';
const CAPTURED_COOKIE_NAME = 'slimcd_captured';
const COOKIE_MAX_AGE_SECONDS = 3600;

function normalizeSessionId(sessionId) {
  return String(sessionId || '').toUpperCase();
}

function sessionLookupKey(sessionId) {
  return `${SESSION_STORAGE_KEY}:${normalizeSessionId(sessionId)}`;
}

function capturedLookupKey(sessionId) {
  return `${CAPTURED_PAYMENT_STORAGE_KEY}:${normalizeSessionId(sessionId)}`;
}

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

function readCookie(name) {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name, value, maxAge = COOKIE_MAX_AGE_SECONDS) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function clearCookie(name) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

function writePendingCookie(data) {
  const minimal = {
    cartId: data.cartId,
    sessionId: data.sessionId,
    paymentCode: data.paymentCode,
    storefront: data.storefront,
    orderRef: data.orderRef,
    amount: data.amount,
  };
  writeCookie(COOKIE_NAME, JSON.stringify(minimal));
}

function clearPendingCookie() {
  clearCookie(COOKIE_NAME);
}

export function loadCheckoutSessionFromCookie(sessionId) {
  const raw = readCookie(COOKIE_NAME);
  if (!raw) {
    return null;
  }

  try {
    const data = JSON.parse(raw);
    if (sessionId && normalizeSessionId(data.sessionId) !== normalizeSessionId(sessionId)) {
      return null;
    }
    return data;
  } catch (error) {
    return null;
  }
}

export function saveCheckoutSession(data) {
  const payload = JSON.stringify(data);
  sessionStorage.setItem(SESSION_STORAGE_KEY, payload);
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, payload);
    if (data?.sessionId) {
      const key = sessionLookupKey(data.sessionId);
      localStorage.setItem(key, payload);
      sessionStorage.setItem(key, payload);
    }
    writePendingCookie(data);
  } catch (error) {
    // localStorage may be unavailable in strict privacy modes.
  }
}

export function loadCheckoutSession(sessionId) {
  const normalized = normalizeSessionId(sessionId);

  if (normalized) {
    const keyedRaw = sessionStorage.getItem(sessionLookupKey(normalized))
      || localStorage.getItem(sessionLookupKey(normalized));
    if (keyedRaw) {
      try {
        return JSON.parse(keyedRaw);
      } catch (error) {
        // fall through
      }
    }

    const fromCookie = loadCheckoutSessionFromCookie(normalized);
    if (fromCookie) {
      return fromCookie;
    }
  }

  const direct = readStoredPayload();
  if (!direct) {
    return loadCheckoutSessionFromCookie();
  }

  if (!normalized || normalizeSessionId(direct.sessionId) === normalized) {
    return direct;
  }

  return null;
}

export function clearCheckoutSession(sessionId) {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(SESSION_STORAGE_KEY);
  clearPendingCookie();
  if (sessionId) {
    sessionStorage.removeItem(sessionLookupKey(sessionId));
    localStorage.removeItem(sessionLookupKey(sessionId));
  }
}

export function saveCapturedPayment(record) {
  const payload = JSON.stringify(record);
  sessionStorage.setItem(CAPTURED_PAYMENT_STORAGE_KEY, payload);
  try {
    localStorage.setItem(CAPTURED_PAYMENT_STORAGE_KEY, payload);
    if (record?.sessionId) {
      const key = capturedLookupKey(record.sessionId);
      sessionStorage.setItem(key, payload);
      localStorage.setItem(key, payload);
    }
    writeCookie(CAPTURED_COOKIE_NAME, payload);
  } catch (error) {
    // ignore storage failures
  }
}

function parseCaptured(raw) {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export function loadCapturedPayment(cartId, sessionId) {
  const normalizedSession = normalizeSessionId(sessionId);
  const candidates = [];

  if (normalizedSession) {
    candidates.push(
      sessionStorage.getItem(capturedLookupKey(normalizedSession)),
      localStorage.getItem(capturedLookupKey(normalizedSession)),
    );
  }

  candidates.push(
    sessionStorage.getItem(CAPTURED_PAYMENT_STORAGE_KEY),
    localStorage.getItem(CAPTURED_PAYMENT_STORAGE_KEY),
    readCookie(CAPTURED_COOKIE_NAME),
  );

  for (const raw of candidates) {
    const record = parseCaptured(raw);
    if (!record?.gateid) {
      continue;
    }
    if (cartId && record.cartId && record.cartId !== cartId) {
      continue;
    }
    if (normalizedSession && record.sessionId
      && normalizeSessionId(record.sessionId) !== normalizedSession) {
      continue;
    }
    return record;
  }

  return null;
}

export function clearCapturedPayment(sessionId) {
  sessionStorage.removeItem(CAPTURED_PAYMENT_STORAGE_KEY);
  localStorage.removeItem(CAPTURED_PAYMENT_STORAGE_KEY);
  clearCookie(CAPTURED_COOKIE_NAME);
  if (sessionId) {
    sessionStorage.removeItem(capturedLookupKey(sessionId));
    localStorage.removeItem(capturedLookupKey(sessionId));
  }
}
