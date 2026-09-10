async function parseJsonResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON from payment service (${response.status})`);
  }

  const body = payload?.body ?? payload;
  if (!response.ok) {
    const message = body?.error || body?.message || text;
    throw new Error(message || `Payment request failed (${response.status})`);
  }

  return body;
}

/** Create a SlimCD Secure Session via the App Builder public action. */
export async function createPaymentSession({
  createSessionUrl,
  storefront,
  amount,
  orderRef,
  currency,
  returnUrl,
}) {
  const response = await fetch(createSessionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storefront,
      amount,
      orderRef,
      currency,
      returnUrl,
    }),
  });

  return parseJsonResponse(response);
}

/** Poll SlimCD session approval and return gateid. */
export async function checkPaymentSession({
  checkSessionUrl,
  storefront,
  sessionId,
}) {
  const response = await fetch(checkSessionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storefront,
      sessionId,
    }),
  });

  return parseJsonResponse(response);
}
