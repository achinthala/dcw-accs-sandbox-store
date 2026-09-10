/**
 * GraphQL fragments merged into @dropins/storefront-checkout via build.mjs.
 * Fragment names must match exports in storefront-checkout/fragments.js.
 */
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
  mutation SetSlimCdPaymentMethod($cartId: String!, $code: String!, $additionalData: [KeyValueInput!]!) {
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
