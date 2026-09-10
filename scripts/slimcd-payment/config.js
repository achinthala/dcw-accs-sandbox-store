import { STOREFRONT_BY_CODE } from './constants.js';

function readCustomConfig(oopeConfig) {
  const map = {};
  const entries = oopeConfig?.custom_config
    || oopeConfig?.customConfig
    || [];

  for (const entry of entries) {
    if (entry?.key !== undefined) {
      map[entry.key] = entry.value;
    }
  }
  return map;
}

/** Resolve SlimCD runtime URLs and storefront from an OOPE payment method config. */
export function resolveSlimCdMethodConfig(paymentMethod) {
  const oope = paymentMethod?.oope_payment_method_config
    || paymentMethod?.oopePaymentMethodConfig
    || null;

  const custom = readCustomConfig(oope);
  const code = paymentMethod?.code || '';
  const createSessionUrl = custom.create_session_url
    || custom.createSessionUrl
    || oope?.backend_integration_url
    || oope?.backendIntegrationUrl
    || '';
  const checkSessionUrl = custom.check_session_url
    || custom.checkSessionUrl
    || deriveSiblingActionUrl(createSessionUrl, 'check-payment-session');

  return {
    code,
    storefront: custom.storefront || STOREFRONT_BY_CODE[code] || '',
    createSessionUrl,
    checkSessionUrl,
    currency: paymentMethod?.currency || null,
  };
}

function deriveSiblingActionUrl(actionUrl, actionName) {
  if (!actionUrl || typeof actionUrl !== 'string') {
    return '';
  }
  return actionUrl.replace(/\/[^/]+$/, `/${actionName}`);
}

/** Find a SlimCD method on the cart by payment code. */
export function findCartPaymentMethod(cart, code) {
  const methods = cart?.availablePaymentMethods
    || cart?.available_payment_methods
    || [];

  const available = methods.find((method) => method.code === code);
  if (available) {
    return available;
  }

  const selected = cart?.selectedPaymentMethod
    || cart?.selected_payment_method
    || null;

  if (selected?.code === code) {
    return selected;
  }

  return null;
}
