// Admin GraphQL documents (API version in config.ts). Page sizes keep each
// query's requested cost well under Shopify's 1,000-point single-query cap.

const VARIANT_FIELDS = /* GraphQL */ `
  fragment VariantFields on ProductVariant {
    id
    title
    sku
    price
    compareAtPrice
    inventoryQuantity
    selectedOptions { name value }
    inventoryItem { id tracked }
  }
`

const PRODUCT_FIELDS = /* GraphQL */ `
  fragment ProductFields on Product {
    id
    title
    description
    productType
    status
    tags
    updatedAt
    featuredMedia { preview { image { url } } }
    variants(first: 30) {
      pageInfo { hasNextPage endCursor }
      nodes { ...VariantFields }
    }
  }
  ${VARIANT_FIELDS}
`

const CUSTOMER_FIELDS = /* GraphQL */ `
  fragment CustomerFields on Customer {
    id
    displayName
    firstName
    lastName
    defaultEmailAddress { emailAddress }
    defaultPhoneNumber { phoneNumber }
    defaultAddress { formatted(withName: false, withCompany: true) }
    tags
    updatedAt
  }
`

const LINE_ITEM_FIELDS = /* GraphQL */ `
  fragment LineItemFields on LineItem {
    id
    name
    sku
    quantity
    originalUnitPriceSet { shopMoney { amount } }
    originalTotalSet { shopMoney { amount } }
    variant { id }
    product { id }
  }
`

const ORDER_FIELDS = /* GraphQL */ `
  fragment OrderFields on Order {
    id
    name
    createdAt
    updatedAt
    processedAt
    cancelledAt
    note
    currencyCode
    displayFinancialStatus
    displayFulfillmentStatus
    customer { ...CustomerFields }
    shippingAddress { formatted(withName: true, withCompany: true) }
    subtotalPriceSet { shopMoney { amount } }
    totalDiscountsSet { shopMoney { amount } }
    totalShippingPriceSet { shopMoney { amount } }
    totalPriceSet { shopMoney { amount currencyCode } }
    totalRefundedSet { shopMoney { amount } }
    lineItems(first: 25) {
      pageInfo { hasNextPage endCursor }
      nodes { ...LineItemFields }
    }
  }
  ${CUSTOMER_FIELDS}
  ${LINE_ITEM_FIELDS}
`

export const SHOP_QUERY = /* GraphQL */ `
  query StoreOSShop {
    shop { name myshopifyDomain currencyCode }
    currentAppInstallation { accessScopes { handle } }
  }
`

export const PRODUCTS_QUERY = /* GraphQL */ `
  query StoreOSProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes { ...ProductFields }
    }
  }
  ${PRODUCT_FIELDS}
`

export const PRODUCT_QUERY = /* GraphQL */ `
  query StoreOSProduct($id: ID!) {
    product(id: $id) { ...ProductFields }
  }
  ${PRODUCT_FIELDS}
`

export const PRODUCT_VARIANTS_QUERY = /* GraphQL */ `
  query StoreOSProductVariants($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ...VariantFields }
      }
    }
  }
  ${VARIANT_FIELDS}
`

export const CUSTOMERS_QUERY = /* GraphQL */ `
  query StoreOSCustomers($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes { ...CustomerFields }
    }
  }
  ${CUSTOMER_FIELDS}
`

export const CUSTOMER_QUERY = /* GraphQL */ `
  query StoreOSCustomer($id: ID!) {
    customer(id: $id) { ...CustomerFields }
  }
  ${CUSTOMER_FIELDS}
`

export const ORDERS_QUERY = /* GraphQL */ `
  query StoreOSOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes { ...OrderFields }
    }
  }
  ${ORDER_FIELDS}
`

export const ORDER_QUERY = /* GraphQL */ `
  query StoreOSOrder($id: ID!) {
    order(id: $id) { ...OrderFields }
  }
  ${ORDER_FIELDS}
`

export const ORDER_LINE_ITEMS_QUERY = /* GraphQL */ `
  query StoreOSOrderLineItems($id: ID!, $after: String) {
    order(id: $id) {
      lineItems(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ...LineItemFields }
      }
    }
  }
  ${LINE_ITEM_FIELDS}
`

export const INVENTORY_ITEM_QUERY = /* GraphQL */ `
  query StoreOSInventoryItem($id: ID!) {
    inventoryItem(id: $id) {
      id
      tracked
      variants(first: 1) { nodes { id inventoryQuantity product { id } } }
      inventoryLevels(first: 25) {
        nodes {
          location { id isActive }
          quantities(names: ["available"]) { name quantity }
        }
      }
    }
  }
`

export const VARIANT_QUANTITY_QUERY = /* GraphQL */ `
  query StoreOSVariantQuantity($id: ID!) {
    productVariant(id: $id) { id inventoryQuantity }
  }
`

export const INVENTORY_ADJUST_MUTATION = /* GraphQL */ `
  mutation StoreOSInventoryAdjust($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) {
    inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup { createdAt reason changes { name delta } }
      userErrors { field message code }
    }
  }
`

export const ORDER_REFUND_INFO_QUERY = /* GraphQL */ `
  query StoreOSOrderRefundInfo($id: ID!) {
    order(id: $id) {
      id
      name
      currencyCode
      displayFinancialStatus
      totalReceivedSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount currencyCode } }
      transactions(first: 50) {
        id
        kind
        status
        gateway
        amountSet { shopMoney { amount currencyCode } }
        parentTransaction { id }
      }
    }
  }
`

export const REFUND_CREATE_MUTATION = /* GraphQL */ `
  mutation StoreOSRefundCreate($input: RefundInput!, $idempotencyKey: String!) {
    refundCreate(input: $input) @idempotent(key: $idempotencyKey) {
      refund { id totalRefundedSet { shopMoney { amount currencyCode } } }
      userErrors { field message }
    }
  }
`

export const WEBHOOK_SUBSCRIPTIONS_QUERY = /* GraphQL */ `
  query StoreOSWebhooks($after: String) {
    webhookSubscriptions(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id topic uri }
    }
  }
`

export const WEBHOOK_CREATE_MUTATION = /* GraphQL */ `
  mutation StoreOSWebhookCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }
`

export const WEBHOOK_DELETE_MUTATION = /* GraphQL */ `
  mutation StoreOSWebhookDelete($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors { field message }
    }
  }
`
