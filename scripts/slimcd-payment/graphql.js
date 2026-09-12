/**
 * GraphQL fragments merged into @dropins/storefront-checkout via build.mjs.
 * Fragment names must match exports in storefront-checkout/fragments.js.
 */
import { events } from '@dropins/tools/event-bus.js';
import { guestOrderByToken } from '@dropins/storefront-order/api.js';

export const SLIMCD_CHECKOUT_GRAPHQL_OPERATIONS = [
  `
  fragment AVAILABLE_PAYMENT_METHOD_FRAGMENT on AvailablePaymentMethod {
    code
    title
    oope_payment_method_config {
      backend_integration_url
      custom_config {
        ... on CustomConfigKeyValue {
          key
          value
        }
      }
    }
  }
  `,
  `
  fragment SELECTED_PAYMENT_METHOD_FRAGMENT on SelectedPaymentMethod {
    code
    title
    purchase_order_number
    oope_payment_method_config {
      backend_integration_url
      custom_config {
        ... on CustomConfigKeyValue {
          key
          value
        }
      }
    }
  }
  `,
];

export const SET_SLIMCD_PAYMENT_MUTATION = `
  mutation SetSlimCdPaymentMethod($cartId: String!, $code: String!, $additionalData: [PaymentAttributeInput!]!) {
    setPaymentMethodOnCart(
      input: {
        cart_id: $cartId
        payment_method: {
          code: $code
          additional_data: $additionalData
        }
      }
    ) {
      cart {
        id
        selected_payment_method {
          code
          title
        }
      }
    }
  }
`;

/**
 * Persist SlimCD session data on the cart before placeOrder.
 * Uses fetch + GraphQL directly so additional_data works for OOPE methods.
 */
export async function setSlimCdPaymentMethodOnCart({
  endpoint,
  cartId,
  code,
  additionalData,
  headers = {},
}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      query: SET_SLIMCD_PAYMENT_MUTATION,
      variables: {
        cartId,
        code,
        additionalData,
      },
    }),
  });

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((entry) => entry.message).join('; '));
  }

  return payload.data?.setPaymentMethodOnCart?.cart;
}

export const PLACE_ORDER_MUTATION = `
  mutation PlaceSlimCdOrder($cartId: String!) {
    placeOrder(input: { cart_id: $cartId }) {
      orderV2 {
        number
        token
        id
        email
      }
      errors {
        code
        message
      }
    }
  }
`;

/**
 * Place order, then load the full guest/customer order model so the
 * confirmation page has shipping, items, and customer name.
 */
export async function placeOrderWithGraphql({
  endpoint,
  cartId,
  headers = {},
}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      query: PLACE_ORDER_MUTATION,
      variables: { cartId },
    }),
  });

  const payload = await response.json();
  if (payload.errors?.length) {
    console.error('[SlimCD] placeOrder GraphQL top-level errors', payload.errors);
    throw new Error(payload.errors.map((entry) => entry.message).join('; '));
  }

  const result = payload.data?.placeOrder;
  if (result?.errors?.length) {
    console.error('[SlimCD] placeOrder GraphQL user errors', result.errors);
    throw new Error(
      result.errors
        .map((entry) => [entry.code, entry.message].filter(Boolean).join(': '))
        .join('; '),
    );
  }

  const orderV2 = result?.orderV2;
  if (!orderV2) {
    console.error('[SlimCD] placeOrder GraphQL empty order response', payload);
    return null;
  }

  let orderData = {
    number: orderV2.number,
    token: orderV2.token,
    id: orderV2.id,
    email: orderV2.email,
  };

  // Guest order token → full OrderDataModel used by confirmation containers.
  if (orderV2.token) {
    try {
      const fullOrder = await guestOrderByToken(orderV2.token);
      if (fullOrder) {
        orderData = fullOrder;
      }
    } catch (error) {
      console.warn('[SlimCD] Could not hydrate full order details after placeOrder', error);
    }
  }

  events.emit('order/placed', orderData);
  events.emit('cart/reset', undefined);

  return orderData;
}
