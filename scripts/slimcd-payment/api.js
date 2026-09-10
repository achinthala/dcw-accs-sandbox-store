async function parseJsonResponse(response) {
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON from payment service (${response.status}): ${text.slice(0, 200)}`);
    }
  }

  const body = payload?.body ?? payload;
  const errorMessage = body?.error || payload?.error;

  if (!response.ok || errorMessage) {
    throw new Error(errorMessage || body?.message || `Payment request failed (${response.status})`);
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
  if (!createSessionUrl) {
    throw new Error('SlimCD create-payment-session URL is not configured');
  }

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

  const body = await parseJsonResponse(response);

  if (!body?.sessionId || !body?.hostedPageUrl) {
    throw new Error(
      `SlimCD session response is incomplete: ${JSON.stringify(body).slice(0, 200)}`,
    );
  }

  return body;
}

/** Poll SlimCD session approval and return gateid. */
export async function checkPaymentSession({
  checkSessionUrl,
  storefront,
  sessionId,
}) {
  if (!checkSessionUrl) {
    throw new Error('SlimCD check-payment-session URL is not configured');
  }

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
