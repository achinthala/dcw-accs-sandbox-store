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

function buildReturnUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set(RETURN_QUERY_FLAG, '1');
  return url.toString();
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
    throw new Error('SlimCD action URLs are missing from OOPE payment method config');
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
  const returnUrl = buildReturnUrl();

  const session = await createPaymentSession({
    createSessionUrl: config.createSessionUrl,
    storefront: config.storefront,
    amount,
    orderRef,
    currency,
    returnUrl,
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

  window.location.assign(session.hostedPageUrl);
}

/**
 * Step 2 — after SlimCD redirect, verify session, set payment method, place order.
 */
export async function completeSlimCdHostedPayment({
  placeOrder,
  onError,
}) {
  const params = new URLSearchParams(window.location.search);
  if (params.get(RETURN_QUERY_FLAG) !== '1') {
    return false;
  }

  const pending = loadCheckoutSession();
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

    await placeOrder(pending.cartId);
    clearCheckoutSession();

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete(RETURN_QUERY_FLAG);
    window.history.replaceState({}, document.title, cleanUrl.toString());

    return true;
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
export async function handleSlimCdPlaceOrder({
  cartId,
  code,
  cart,
  graphqlEndpoint,
  graphqlHeaders,
  placeOrder,
}) {
  if (!isSlimCdPaymentMethod(code)) {
    await placeOrder(cartId);
    return;
  }

  await startSlimCdHostedPayment({
    cart,
    paymentCode: code,
    graphqlEndpoint,
    graphqlHeaders,
  });
}
