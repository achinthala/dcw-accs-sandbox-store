import { getCartDataFromCache } from '@dropins/storefront-cart/api.js';
import { SLIMCD_PAYMENT_CODES, RETURN_QUERY_FLAG } from './constants.js';
import { createPaymentSession, checkPaymentSession } from './api.js';
import { resolveSlimCdMethodConfig, findCartPaymentMethod } from './config.js';
import { saveCheckoutSession, loadCheckoutSession, clearCheckoutSession } from './storage.js';
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

function buildReturnUrl({ cartId, paymentCode, sessionId }) {
  const url = new URL(window.location.href);
  url.searchParams.set(RETURN_QUERY_FLAG, '1');
  if (cartId) {
    url.searchParams.set('slimcd_cart', cartId);
  }
  if (paymentCode) {
    url.searchParams.set('slimcd_pay', paymentCode);
  }
  if (sessionId) {
    url.searchParams.set('slimcd_sid', sessionId);
  }
  return url.toString();
}

function resolvePendingCheckoutSession() {
  const params = new URLSearchParams(window.location.search);
  if (params.get(RETURN_QUERY_FLAG) !== '1') {
    return null;
  }

  const pending = loadCheckoutSession();
  if (!pending) {
    return null;
  }

  const cartId = params.get('slimcd_cart');
  const paymentCode = params.get('slimcd_pay');
  const sessionId = params.get('slimcd_sid');

  if (cartId && pending.cartId && pending.cartId !== cartId) {
    return null;
  }
  if (paymentCode && pending.paymentCode && pending.paymentCode !== paymentCode) {
    return null;
  }
  if (sessionId && pending.sessionId && pending.sessionId !== sessionId) {
    return null;
  }

  return pending;
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
  const orderRef = String(cartId).slice(0, 20);

  const session = await createPaymentSession({
    createSessionUrl: config.createSessionUrl,
    storefront: config.storefront,
    amount,
    orderRef,
    currency,
    returnUrl: buildReturnUrl({ cartId, paymentCode }),
  });

  saveCheckoutSession({
    cartId,
    paymentCode,
    sessionId: session.sessionId,
    storefront: config.storefront,
    orderRef,
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

/**
 * Step 2 — after SlimCD redirect, verify session, set payment method, place order.
 */
export async function completeSlimCdHostedPayment({
  placeOrder,
  onError,
  onSuccess,
}) {
  const pending = resolvePendingCheckoutSession();
  if (!pending) {
    return false;
  }

  try {
    const verified = await checkPaymentSession({
      checkSessionUrl: pending.checkSessionUrl,
      storefront: pending.storefront,
      sessionId: pending.sessionId,
    });

    if (!verified.approved || !verified.gateid) {
      throw new Error('SlimCD payment was not approved');
    }

    await setSlimCdPaymentMethodOnCart({
      endpoint: pending.graphqlEndpoint,
      cartId: pending.cartId,
      code: pending.paymentCode,
      additionalData: buildAdditionalData({
        sessionId: pending.sessionId,
        gateid: verified.gateid,
        storefront: pending.storefront,
        orderRef: pending.orderRef,
        amount: pending.amount,
      }),
      headers: pending.graphqlHeaders,
    });

    const orderData = await placeOrder(pending.cartId);
    clearCheckoutSession();

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete(RETURN_QUERY_FLAG);
    cleanUrl.searchParams.delete('slimcd_cart');
    cleanUrl.searchParams.delete('slimcd_pay');
    cleanUrl.searchParams.delete('slimcd_sid');
    window.history.replaceState({}, document.title, cleanUrl.toString());

    if (onSuccess && orderData) {
      await onSuccess(orderData);
    }

    return orderData || true;
  } catch (error) {
    clearCheckoutSession();
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
