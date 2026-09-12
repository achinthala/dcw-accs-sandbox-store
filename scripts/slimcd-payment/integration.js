/**
 * Adobe Commerce Storefront (drop-ins) integration for SlimCD OOPE checkout.
 */
import { getCookie } from '@dropins/tools/lib.js';
import { getHeaders } from '@dropins/tools/lib/aem/configs.js';
import {
  completeSlimCdHostedPayment,
  handleSlimCdPlaceOrder,
  isSlimCdCheckoutReturn,
  isSlimCdPaymentMethod,
  syncCapturedSlimCdPaymentOnCheckout,
  waitForDropinsReady,
} from './checkout-flow.js';

export {
  isSlimCdPaymentMethod,
  isSlimCdCheckoutReturn,
  waitForDropinsReady,
  syncCapturedSlimCdPaymentOnCheckout,
};

/** GraphQL headers for direct SlimCD cart mutations (matches drop-in auth). */
export function getSlimCdGraphqlHeaders() {
  const headers = {
    ...getHeaders('all'),
    ...getHeaders('cs'),
  };
  const token = getCookie('auth_dropin_user_token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Resume checkout when the shopper returns from SlimCD hosted card entry.
 */
export async function resumeSlimCdCheckoutOnReturn({
  placeOrder,
  onError,
  onSuccess,
  graphqlEndpoint,
  graphqlHeaders,
}) {
  return completeSlimCdHostedPayment({
    placeOrder,
    onError,
    onSuccess,
    graphqlEndpoint,
    graphqlHeaders,
  });
}

/**
 * Recommended PaymentMethods settings for SlimCD (disable auto sync —
 * payment method is set after hosted card entry completes).
 */
export const slimCdPaymentMethodsOptions = {
  autoSync: false,
};

export { handleSlimCdPlaceOrder };
