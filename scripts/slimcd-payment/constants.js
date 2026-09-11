/** SlimCD OOPE payment method codes registered by the App Builder app. */
export const SLIMCD_PAYMENT_CODES = [
  'slimcd_usmi',
  'slimcd_ukch',
  'slimcd_itlsrl',
];

export const STOREFRONT_BY_CODE = {
  slimcd_usmi: 'USMI',
  slimcd_ukch: 'UKCH',
  slimcd_itlsrl: 'ITLSRL',
};

export const SESSION_STORAGE_KEY = 'slimcd_checkout_session';

export const RETURN_QUERY_FLAG = 'slimcd_return';

/** Fallback when config.json / OOPE custom_config URLs are unavailable (Stage workspace). */
export const SLIMCD_RUNTIME_BASE_URL =
  'https://1890365-slimcdpaymentgateway-stage.adobeioruntime.net/api/v1/web/slimcd-payment-gateway';
