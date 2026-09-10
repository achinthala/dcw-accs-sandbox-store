import { overrideGQLOperations } from '@dropins/build-tools/gql-extend.js';
import { SLIMCD_CHECKOUT_GRAPHQL_OPERATIONS } from './scripts/slimcd-payment/graphql.js';

overrideGQLOperations([
  // ACCS does not have Downloadable Items
  {
    npm: '@dropins/storefront-cart',
    skipFragments: ['DOWNLOADABLE_CART_ITEMS_FRAGMENT'],
    operations: [],
  },
  {
    npm: '@dropins/storefront-order',
    skipFragments: ['DOWNLOADABLE_ORDER_ITEMS_FRAGMENT'],
    operations: [],
  },
  // SlimCD OOPE payment method config on checkout payment fragments
  {
    npm: '@dropins/storefront-checkout',
    operations: SLIMCD_CHECKOUT_GRAPHQL_OPERATIONS,
  },
  // {
  //   npm: '@dropins/storefront-pdp',
  //   operations: [
  //     `
  //     fragment PRODUCT_FRAGMENT on ProductView {
  //       lowStock
  //     }
  //     `,
  //   ],
  // },
]);
