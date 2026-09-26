import { ClassifiedIntent, CustomerContext, ProductListing, Resolution } from '@/types'
import { mockCustomers, mockOrders } from './mock-data'

export function demoClassify(message: string): ClassifiedIntent {
  const text = message.toLowerCase()
  const intent: ClassifiedIntent['intent'] = text.includes('refund') || text.includes('money back')
    ? 'refund_request'
    : text.includes('return')
      ? 'return_request'
      : text.includes('complaint') || text.includes('unhappy') || text.includes('disappointed')
        ? 'complaint'
        : text.includes('where') || text.includes('tracking') || text.includes('delivery')
          ? 'shipping_update'
          : text.includes('how') || text.includes('compatible') || text.includes('size')
            ? 'product_question'
            : 'order_inquiry'

  const urgency: ClassifiedIntent['urgency'] = text.includes('urgent') || text.includes('asap') || text.includes('today')
    ? 'high'
    : intent === 'complaint' || intent === 'refund_request' ? 'medium' : 'low'

  const orderId = (message.match(/ORD-\d{3}/i)?.[0] || undefined)?.toUpperCase()
  const amountMatch = message.match(/\$\s?(\d+(?:\.\d{1,2})?)/)

  return {
    intent,
    confidence: 0.94,
    urgency,
    rawInput: message,
    extractedEntities: {
      orderId,
      amount: amountMatch ? Number(amountMatch[1]) : undefined,
    },
  }
}

export function demoContext(intent: ClassifiedIntent): { customer: CustomerContext; relevantOrders: typeof mockOrders } {
  const matchingOrder = intent.extractedEntities.orderId
    ? mockOrders.find(order => order.id === intent.extractedEntities.orderId)
    : undefined
  const customer = matchingOrder
    ? mockCustomers.find(item => item.customerId === matchingOrder.customerId) || mockCustomers[0]
    : mockCustomers[0]

  return {
    customer,
    relevantOrders: matchingOrder ? [matchingOrder, ...customer.recentOrders.filter(order => order.id !== matchingOrder.id)] : customer.recentOrders,
  }
}

export function demoThink(intent: ClassifiedIntent, context: CustomerContext): Resolution {
  const order = context.recentOrders[0]
  const requestedAmount = intent.extractedEntities.amount || (intent.intent === 'refund_request' ? order?.amount : undefined)
  const highRisk = intent.urgency === 'high' || context.sentimentHistory === 'negative' || (requestedAmount || 0) > 30
  const refundAmount = intent.intent === 'refund_request' ? requestedAmount : undefined

  if (intent.intent === 'refund_request') {
    return {
      action: highRisk ? 'escalate' : 'refund',
      draftResponse: highRisk
        ? `Thanks for reaching out. I’ve sent your refund request for order ${order?.id || 'your order'} to a team member for review and will follow up shortly.`
        : `Thanks for reaching out. I’ve approved a refund of $${(refundAmount || 0).toFixed(2)} for order ${order?.id || 'your order'}.`,
      reasoning: highRisk
        ? 'Human approval is required because the request exceeds the automatic refund limit or the customer context indicates elevated risk.'
        : 'The requested refund is within the automatic approval limit and the customer history is positive or neutral.',
      requiresHuman: highRisk,
      riskLevel: highRisk ? 'high' : 'low',
      refundAmount,
    }
  }

  return {
    action: highRisk ? 'escalate' : 'info_provided',
    draftResponse: highRisk
      ? 'Thanks for letting us know. A member of our support team will review this and get back to you shortly.'
      : 'Thanks for your message. I found your recent order and have shared the relevant details below. Please let us know if you need anything else.',
    reasoning: highRisk ? 'The message is urgent or the customer history warrants human review.' : 'This is a low-risk information request that can be answered automatically.',
    requiresHuman: highRisk,
    riskLevel: highRisk ? 'high' : 'low',
  }
}

export function demoListing(): ProductListing {
  return {
    title: 'Minimalist Everyday Carry Organizer',
    description: 'A thoughtfully designed organizer for keeping everyday essentials neat and easy to reach. Its clean silhouette makes it a versatile addition to a desk, bag, or entryway.',
    category: 'Accessories',
    suggestedPrice: '$24 - $39',
    tags: ['minimalist', 'organizer', 'everyday carry', 'gift idea', 'desk accessories'],
    highlights: ['Clean, versatile design', 'Compact everyday storage', 'Easy to style and gift'],
  }
}
