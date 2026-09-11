import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { SLIMCD_RUNTIME_BASE_URL, STOREFRONT_BY_CODE } from './constants.js';

function resolveRuntimeBaseUrl() {
  return getConfigValue('slimcd-runtime-base-url') || SLIMCD_RUNTIME_BASE_URL;
}

export function buildRuntimeActionUrl(actionName) {
  const base = resolveRuntimeBaseUrl();
  if (!base) {
    return '';
  }
  return `${String(base).replace(/\/$/, '')}/${actionName}`;
}

function normalizeCreateSessionUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  if (url.includes('validate-payment')) {
    return url.replace('validate-payment', 'create-payment-session');
  }
  if (url.includes('check-payment-session')) {
    return url.replace('check-payment-session', 'create-payment-session');
  }
  return url;
}

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
  let createSessionUrl = normalizeCreateSessionUrl(
    custom.create_session_url
    || custom.createSessionUrl
    || oope?.backend_integration_url
    || oope?.backendIntegrationUrl
    || '',
  );
  let checkSessionUrl = custom.check_session_url
    || custom.checkSessionUrl
    || deriveSiblingActionUrl(createSessionUrl, 'check-payment-session');

  if (!createSessionUrl) {
    createSessionUrl = buildRuntimeActionUrl('create-payment-session');
  }
  if (!checkSessionUrl) {
    checkSessionUrl = buildRuntimeActionUrl('check-payment-session');
  }

  return {
    code,
    storefront: custom.storefront || STOREFRONT_BY_CODE[code] || '',
    createSessionUrl,
    checkSessionUrl,
    runtimeBaseUrl: resolveRuntimeBaseUrl(),
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
