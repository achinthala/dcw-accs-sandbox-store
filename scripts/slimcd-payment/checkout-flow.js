import {
  getCartDataFromCache,
  getCartData,
  initializeCart,
} from '@dropins/storefront-cart/api.js';
import { events } from '@dropins/tools/event-bus.js';
import {
  SLIMCD_PAYMENT_CODES,
  RETURN_QUERY_FLAG,
  STOREFRONT_BY_CODE,
} from './constants.js';
import { createPaymentSession, checkPaymentSession } from './api.js';
import {
  resolveSlimCdMethodConfig,
  findCartPaymentMethod,
  buildRuntimeActionUrl,
} from './config.js';
import {
  saveCheckoutSession,
  loadCheckoutSession,
  loadCheckoutSessionFromCookie,
  clearCheckoutSession,
} from './storage.js';
import { setSlimCdPaymentMethodOnCart } from './graphql.js';

export function isSlimCdPaymentMethod(code) {
  return SLIMCD_PAYMENT_CODES.includes(code);
}

function resolveCartGrandTotal(cart) {
  const cachedCart = getCartDataFromCache();
  return cart?.prices?.grand_total?.value
    ?? cart?.prices?.grandTotal?.value
    ?? cart?.grandTotal
    ?? cachedCart?.total?.includingTax?.value
    ?? cachedCart?.prices?.subtotalIncludingTax?.value;
}

function formatAmount(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    throw new Error('Cart grand total is missing for SlimCD payment');
  }
  return amount.toFixed(2);
}

function buildUniqueOrderRef(cartId) {
  const base = String(cartId || 'CART').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  const suffix = `${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  return `${base}${suffix}`.slice(0, 20);
}

function buildReturnUrl({ cartId, paymentCode, sessionId, storefront }) {
  const url = new URL(window.location.href);
  url.searchParams.set(RETURN_QUERY_FLAG, '1');
  if (cartId) {
    url.searchParams.set('slimcd_cart', cartId);
  }
  if (paymentCode) {
    url.searchParams.set('slimcd_pay', paymentCode);
  }
  if (storefront) {
    url.searchParams.set('slimcd_store', storefront);
  }
  if (sessionId) {
    url.searchParams.set('slimcd_sid', sessionId);
  }
  return url.toString();
}

function resolveSlimCdReturnSessionId(params) {
  return params.get('sessionid') || params.get('sessionId') || params.get('slimcd_sid');
}

export function isSlimCdCheckoutReturn(params) {
  return params.get(RETURN_QUERY_FLAG) === '1' || Boolean(resolveSlimCdReturnSessionId(params));
}

function normalizeSessionId(sessionId) {
  return String(sessionId || '').toUpperCase();
}

function resolveSlimCdPaymentCodeFromCart(cart, params) {
  const fromUrl = params.get('slimcd_pay');
  if (fromUrl && isSlimCdPaymentMethod(fromUrl)) {
    return fromUrl;
  }

  const selected = cart?.selectedPaymentMethod?.code
    || cart?.selected_payment_method?.code;
  if (selected && isSlimCdPaymentMethod(selected)) {
    return selected;
  }

  const methods = cart?.availablePaymentMethods
    || cart?.available_payment_methods
    || [];
  const match = methods.find((method) => isSlimCdPaymentMethod(method.code));
  return match?.code || SLIMCD_PAYMENT_CODES[0];
}

function readDropinCartId() {
  const cartDataRaw = sessionStorage.getItem('DROPIN__CART__CART__DATA');
  if (cartDataRaw) {
    try {
      const parsed = JSON.parse(cartDataRaw);
      if (parsed?.id) {
        return parsed;
      }
    } catch (error) {
      // ignore malformed cache
    }
  }

  const cartId = sessionStorage.getItem('DROPINS_CART_ID')
    || (() => {
      const match = document.cookie.match(/(?:^|; )DROPIN__CART__CART-ID=([^;]*)/);
      return match ? decodeURIComponent(match[1]) : null;
    })();

  return cartId ? { id: cartId } : null;
}

function resolveStoredCartReference() {
  const cached = getCartDataFromCache();
  if (cached?.id) {
    return cached;
  }

  return readDropinCartId();
}

function resolvePendingAmount(cart, pendingAmount) {
  if (pendingAmount) {
    return pendingAmount;
  }

  const total = resolveCartGrandTotal(cart);
  if (total === undefined || total === null || Number.isNaN(Number(total))) {
    return null;
  }

  return formatAmount(total);
}

function enrichPendingSession(pending, { graphqlEndpoint, graphqlHeaders }) {
  const paymentCode = pending.paymentCode || SLIMCD_PAYMENT_CODES[0];
  const config = resolveSlimCdMethodConfig({ code: paymentCode });

  return {
    ...pending,
    paymentCode,
    checkSessionUrl: pending.checkSessionUrl || config.checkSessionUrl,
    storefront: pending.storefront || config.storefront,
    graphqlEndpoint: pending.graphqlEndpoint || graphqlEndpoint,
    graphqlHeaders: pending.graphqlHeaders || graphqlHeaders,
  };
}

function reconstructPendingSession(params, cart, ctx, storedPartial = null) {
  const sessionId = normalizeSessionId(resolveSlimCdReturnSessionId(params));
  const cartId = storedPartial?.cartId || cart?.id;
  if (!sessionId || !cartId) {
    return null;
  }

  const paymentCode = storedPartial?.paymentCode
    || resolveSlimCdPaymentCodeFromCart(cart || {}, params);
  const method = findCartPaymentMethod(cart || { code: paymentCode }, paymentCode)
    || { code: paymentCode };
  const config = resolveSlimCdMethodConfig(method);
  if (!config.checkSessionUrl || !config.storefront) {
    return null;
  }

  const amount = resolvePendingAmount(cart, storedPartial?.amount);

  return enrichPendingSession({
    cartId,
    paymentCode,
    sessionId,
    storefront: storedPartial?.storefront || config.storefront,
    orderRef: storedPartial?.orderRef || String(cartId).slice(0, 20),
    amount: amount || storedPartial?.amount || null,
    checkSessionUrl: config.checkSessionUrl,
  }, ctx);
}

function resolvePendingCheckoutSession({ cart, graphqlEndpoint, graphqlHeaders } = {}) {
  const params = new URLSearchParams(window.location.search);
  if (!isSlimCdCheckoutReturn(params)) {
    return null;
  }

  const sessionId = normalizeSessionId(resolveSlimCdReturnSessionId(params));
  let pending = loadCheckoutSession(sessionId);

  if (!pending) {
    const cartRef = cart?.id ? cart : resolveStoredCartReference();
    pending = reconstructPendingSession(
      params,
      cartRef,
      { graphqlEndpoint, graphqlHeaders },
      loadCheckoutSessionFromCookie(sessionId),
    );
  }

  if (!pending) {
    return null;
  }

  pending = enrichPendingSession(pending, { graphqlEndpoint, graphqlHeaders });

  const cartId = params.get('slimcd_cart');
  const paymentCode = params.get('slimcd_pay');

  if (cartId && pending.cartId && pending.cartId !== cartId) {
    return null;
  }
  if (paymentCode && pending.paymentCode && pending.paymentCode !== paymentCode) {
    return null;
  }
  if (sessionId && pending.sessionId
    && normalizeSessionId(pending.sessionId) !== sessionId) {
    return null;
  }

  if (sessionId) {
    pending = { ...pending, sessionId };
  }

  return pending;
}

async function waitForCartData(timeoutMs = 15000) {
  const stored = resolveStoredCartReference();
  if (stored?.id && stored?.items?.length) {
    return stored;
  }

  try {
    const initialized = await initializeCart();
    if (initialized?.id) {
      return initialized;
    }
  } catch (error) {
    console.warn('[SlimCD] initializeCart during return failed', error);
  }

  try {
    const fetched = await getCartData();
    if (fetched?.id) {
      return fetched;
    }
  } catch (error) {
    console.warn('[SlimCD] getCartData during return failed', error);
  }

  if (stored?.id) {
    return stored;
  }

  return new Promise((resolve) => {
    let settled = false;

    const settle = (cart) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      events.off('cart/data', onCartData);
      events.off('cart/initialized', onCartData);
      events.off('checkout/initialized', onCheckout);
      resolve(cart?.id ? cart : getCartDataFromCache());
    };

    const onCartData = (data) => {
      if (data?.id) {
        settle(data);
      }
    };

    const onCheckout = (data) => {
      if (data?.id) {
        settle(data);
      }
    };

    const timer = setTimeout(() => settle(getCartDataFromCache()), timeoutMs);

    events.on('cart/data', onCartData);
    events.on('cart/initialized', onCartData, { eager: true });
    events.on('checkout/initialized', onCheckout, { eager: true });
  });
}

function decorateHostedPageUrl(hostedPageUrl, { sessionId, cartId, paymentCode }) {
  try {
    const target = new URL(hostedPageUrl, window.location.origin);
    const isSameOriginReturn = target.origin === window.location.origin
      && target.searchParams.get(RETURN_QUERY_FLAG) === '1';

    if (isSameOriginReturn) {
      return buildReturnUrl({ cartId, paymentCode, sessionId });
    }
    return hostedPageUrl;
  } catch (error) {
    return hostedPageUrl;
  }
}

function buildAdditionalData({
  sessionId,
  gateid,
  storefront,
  orderRef,
  amount,
}) {
  return [
    { key: 'sessionId', value: sessionId },
    { key: 'gateid', value: gateid },
    { key: 'storefront', value: storefront },
    { key: 'orderRef', value: orderRef },
    { key: 'clientTransRef', value: orderRef },
    { key: 'amount', value: amount },
    { key: 'status', value: 'DONE' },
  ];
}

/**
 * Step 1 — create SlimCD session and redirect shopper to hosted card page.
 */
export async function startSlimCdHostedPayment({
  cart,
  paymentCode,
  graphqlEndpoint,
  graphqlHeaders,
}) {
  const cartId = cart.id;
  const method = findCartPaymentMethod(cart, paymentCode);
  if (!method) {
    throw new Error(`SlimCD payment method ${paymentCode} is not available on this cart`);
  }

  const config = resolveSlimCdMethodConfig(method);
  if (!config.createSessionUrl || !config.checkSessionUrl) {
    console.error('[SlimCD] Could not resolve action URLs', {
      paymentCode,
      method,
      runtimeBaseUrl: config.runtimeBaseUrl,
    });
    throw new Error(
      'SlimCD action URLs are missing. Set slimcd-runtime-base-url in config.json, or upgrade/reinstall the SlimCD app in Commerce Admin (v0.0.4+) so OOPE custom_config includes create_session_url and check_session_url.',
    );
  }

  if (!config.storefront) {
    throw new Error(`SlimCD storefront mapping is missing for payment method ${paymentCode}`);
  }

  const amount = formatAmount(resolveCartGrandTotal(cart));
  const cachedCart = getCartDataFromCache();
  const currency = cart.prices?.grand_total?.currency
    || cart.prices?.grandTotal?.currency
    || cachedCart?.total?.includingTax?.currency
    || cachedCart?.prices?.subtotalIncludingTax?.currency
    || cart.currency
    || config.currency;
  const orderRef = buildUniqueOrderRef(cartId);

  const session = await createPaymentSession({
    createSessionUrl: config.createSessionUrl,
    storefront: config.storefront,
    amount,
    orderRef,
    currency,
    returnUrl: buildReturnUrl({ cartId, paymentCode, storefront: config.storefront }),
    cartId,
    paymentCode,
  });

  saveCheckoutSession({
    cartId,
    paymentCode,
    sessionId: session.sessionId,
    storefront: config.storefront,
    orderRef: session.orderRef || orderRef,
    amount,
    checkSessionUrl: config.checkSessionUrl,
    graphqlEndpoint,
    graphqlHeaders,
  });

  const hostedPageUrl = decorateHostedPageUrl(session.hostedPageUrl, {
    sessionId: session.sessionId,
    cartId,
    paymentCode,
  });

  window.location.assign(hostedPageUrl);
}

function resolveStorefrontForReturn(params, cart, localPending, verified) {
  return verified?.storefront
    || localPending?.storefront
    || params.get('slimcd_store')
    || STOREFRONT_BY_CODE[resolveSlimCdPaymentCodeFromCart(cart, params)]
    || 'USMI';
}

function buildPendingFromResolution({
  verified,
  localPending,
  sessionId,
  checkSessionUrl,
  graphqlEndpoint,
  graphqlHeaders,
  cart,
  params,
}) {
  const paymentCode = verified?.paymentCode
    || localPending?.paymentCode
    || resolveSlimCdPaymentCodeFromCart(cart || {}, params);
  const cartId = verified?.cartId || localPending?.cartId || cart?.id;
  const storefront = resolveStorefrontForReturn(params, cart, localPending, verified);

  if (cartId && verified?.gateid) {
    return {
      cartId,
      paymentCode,
      sessionId: verified.sessionId || sessionId,
      storefront,
      orderRef: verified?.orderRef || localPending?.orderRef || String(cartId).slice(0, 20),
      amount: verified?.amount || localPending?.amount,
      checkSessionUrl,
      graphqlEndpoint,
      graphqlHeaders,
    };
  }

  if (localPending?.cartId) {
    return localPending;
  }

  return reconstructPendingSession(
    params,
    cart || { id: cartId },
    { graphqlEndpoint, graphqlHeaders },
    {
      cartId,
      paymentCode,
      storefront,
      amount: verified?.amount || localPending?.amount,
      orderRef: String(cartId || '').slice(0, 20),
    },
  );
}

function waitForOrderPlaced(timeoutMs = 10000) {
  const existing = events.lastPayload('order/placed');
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(events.lastPayload('order/placed') || null);
      }
    }, timeoutMs);

    const subscription = events.on('order/placed', (orderData) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      subscription?.off?.();
      resolve(orderData);
    });
  });
}

/**
 * Step 2 — after SlimCD redirect, verify session, set payment method, place order.
 * Follows SlimCD WEB flow: PostBack stores server-side result, redirect passes sessionid only.
 * @see https://developer.slimcd.com/hosted-payment-pages/
 */
export async function completeSlimCdHostedPayment({
  placeOrder,
  onError,
  onSuccess,
  graphqlEndpoint,
  graphqlHeaders,
}) {
  const params = new URLSearchParams(window.location.search);
  if (!isSlimCdCheckoutReturn(params)) {
    return false;
  }

  const sessionId = normalizeSessionId(resolveSlimCdReturnSessionId(params));
  if (!sessionId) {
    return false;
  }

  const cart = await waitForCartData();
  const localPending = resolvePendingCheckoutSession({
    cart,
    graphqlEndpoint,
    graphqlHeaders,
  });
  const checkSessionUrl = localPending?.checkSessionUrl
    || buildRuntimeActionUrl('check-payment-session');

  if (!checkSessionUrl) {
    console.warn('[SlimCD] check-payment-session URL is not configured');
    return false;
  }

  const storefront = resolveStorefrontForReturn(params, cart, localPending, null);

  try {
    const verified = await checkPaymentSession({
      checkSessionUrl,
      sessionId,
      storefront,
    });

    if (!verified.approved || !verified.gateid) {
      throw new Error(
        verified?.error
          || 'SlimCD payment was not approved. Confirm SlimCD PostBack URL points to hosted-payment-postback and redeploy the App Builder app.',
      );
    }

    const pending = buildPendingFromResolution({
      verified,
      localPending,
      sessionId,
      checkSessionUrl,
      graphqlEndpoint,
      graphqlHeaders,
      cart,
      params,
    });

    if (!pending?.cartId) {
      throw new Error(
        'Payment was approved but the cart could not be restored. Please contact support with your SlimCD session ID.',
      );
    }

    const amount = pending.amount
      || (verified.amount ? formatAmount(verified.amount) : null)
      || resolvePendingAmount(cart, null);

    if (!amount) {
      throw new Error('Could not determine order amount for SlimCD payment completion');
    }

    await setSlimCdPaymentMethodOnCart({
      endpoint: pending.graphqlEndpoint || graphqlEndpoint,
      cartId: pending.cartId,
      code: pending.paymentCode,
      additionalData: buildAdditionalData({
        sessionId: pending.sessionId || sessionId,
        gateid: verified.gateid,
        storefront: pending.storefront || verified.storefront,
        orderRef: pending.orderRef,
        amount,
      }),
      headers: pending.graphqlHeaders || graphqlHeaders,
    });

    let orderData = await placeOrder(pending.cartId);
    if (!orderData) {
      orderData = await waitForOrderPlaced();
    }
    clearCheckoutSession(pending.sessionId || sessionId);

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete(RETURN_QUERY_FLAG);
    cleanUrl.searchParams.delete('slimcd_cart');
    cleanUrl.searchParams.delete('slimcd_pay');
    cleanUrl.searchParams.delete('slimcd_sid');
    cleanUrl.searchParams.delete('sessionid');
    cleanUrl.searchParams.delete('sessionId');
    cleanUrl.searchParams.delete('slimcd_store');
    window.history.replaceState({}, document.title, cleanUrl.toString());

    if (onSuccess) {
      if (orderData) {
        await onSuccess(orderData);
      } else {
        throw new Error('Order placement did not return confirmation data');
      }
    }

    return orderData;
  } catch (error) {
    console.error('[SlimCD] Hosted return failed', { sessionId, error });
    if (onError) {
      onError(error);
    } else {
      throw error;
    }
    return false;
  }
}

/**
 * Place-order handler for Commerce checkout drop-ins.
 * Redirects to SlimCD unless we are completing a return URL flow.
 */
export function resolveSlimCdPaymentCode(cart, code) {
  return code
    || cart?.selectedPaymentMethod?.code
    || cart?.selected_payment_method?.code
    || '';
}

export async function handleSlimCdPlaceOrder({
  cartId,
  code,
  cart,
  graphqlEndpoint,
  graphqlHeaders,
  placeOrder,
}) {
  const paymentCode = resolveSlimCdPaymentCode(cart, code);

  if (!isSlimCdPaymentMethod(paymentCode)) {
    await placeOrder(cartId);
    return;
  }

  await startSlimCdHostedPayment({
    cart: { ...cart, id: cart?.id || cartId },
    paymentCode,
    graphqlEndpoint,
    graphqlHeaders,
  });
}
