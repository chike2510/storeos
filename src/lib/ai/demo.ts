import { formatMoney } from '@/lib/utils'
import type { Classification, ListingDraft, Resolution, TriageContext } from './schema'

/** Deterministic, offline stand-ins used when no AI key is configured. */
export function demoClassify(message: string): Classification {
  const t = message.toLowerCase()
  const has = (...w: string[]) => w.some(x => t.includes(x))

  const intent: Classification['intent'] = has('refund', 'money back', 'chargeback')
    ? 'refund_request'
    : has('return', 'exchange')
      ? 'return_request'
      : has('damaged', 'broken', 'torn', 'unhappy', 'disappointed', 'terrible', 'worst', 'complain')
        ? 'complaint'
        : has('where is', 'tracking', 'deliver', 'arrive', 'shipping', 'dispatch')
          ? 'shipping_update'
          : has('cancel', 'change my order', 'change the address', 'update my order')
            ? 'order_change'
            : has('size', 'colour', 'color', 'available', 'in stock', 'material', 'how much', 'price', 'does it', 'do you have')
              ? 'product_question'
              : has('order')
                ? 'order_status'
                : 'general'

  const urgency: Classification['urgency'] = has('urgent', 'asap', 'today', 'immediately', 'now!', 'lawyer', 'report you')
    ? 'high'
    : intent === 'complaint' || intent === 'refund_request'
      ? 'medium'
      : 'low'

  const sentiment: Classification['sentiment'] = has('angry', 'terrible', 'worst', 'scam', 'disappointed', 'second time', 'again')
    ? 'negative'
    : has('thanks', 'thank you', 'love', 'great', '😊', '❤')
      ? 'positive'
      : 'neutral'

  const orderMatch = message.match(/#\s?(\d{3,7})/) || message.match(/order\s*(?:no\.?|number)?\s*(\d{3,7})/i)
  const amountMatch = message.match(/(?:₦|\$|£|€|NGN|USD)\s?([\d,]+(?:\.\d{1,2})?)/i)

  return {
    intent,
    urgency,
    sentiment,
    confidence: 0.86,
    entities: {
      orderNumber: orderMatch ? Number(orderMatch[1]) : undefined,
      amount: amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : undefined,
    },
  }
}

export function demoResolve(c: Classification, ctx: TriageContext, linkedOrderTotal: number | null): Resolution {
  const first = ctx.customer?.name.split(' ')[0] ?? 'there'
  const order = ctx.orders.find(o => o.number === (c.entities.orderNumber ?? ctx.linkedOrderNumber)) ?? ctx.orders[0]
  const ref = order ? `order #${order.number}` : 'your order'

  switch (c.intent) {
    case 'refund_request': {
      const amount = c.entities.amount ?? linkedOrderTotal ?? order?.total ?? null
      return {
        action: 'refund',
        refundAmount: amount,
        requiresApproval: false,
        riskLevel: 'low',
        reasoning: `Customer requests a refund for ${ref}. Amount taken from the ${c.entities.amount ? 'message' : 'order total'}.`,
        draftReply:
          `Hi ${first}, I'm sorry about the trouble with ${ref}. ` +
          (amount !== null ? `I've processed a refund of ${formatMoney(amount, ctx.currency)} to your original payment method. ` : `I've started your refund. `) +
          `You should see it within 3–5 working days.`,
      }
    }
    case 'return_request':
      return {
        action: 'reply',
        refundAmount: null,
        requiresApproval: false,
        riskLevel: 'low',
        reasoning: 'Return requests can be answered with the return instructions.',
        draftReply: `Hi ${first}, no problem — you can return items from ${ref} in their original condition. Reply with a photo of the item and we'll send you the return details right away.`,
      }
    case 'complaint':
      return {
        action: 'escalate',
        refundAmount: null,
        requiresApproval: true,
        riskLevel: 'medium',
        reasoning: 'Complaint about product quality or service; a person should decide how to make it right.',
        draftReply: `Hi ${first}, I'm really sorry to hear this — that's not the experience we want for you. Could you send a photo of the issue? We'll make it right as quickly as possible.`,
      }
    case 'shipping_update':
    case 'order_status':
      return {
        action: 'info_provided',
        refundAmount: null,
        requiresApproval: false,
        riskLevel: 'low',
        reasoning: order ? `Found ${ref} with status "${order.status}".` : 'No matching order found; asking for the order number.',
        draftReply: order
          ? `Hi ${first}! ${capitalize(ref)} is currently ${statusPhrase(order.status)}. We'll message you as soon as anything changes.`
          : `Hi ${first}! Could you share your order number or the phone number you ordered with? I'll check on it straight away.`,
      }
    case 'order_change':
      return {
        action: 'escalate',
        refundAmount: null,
        requiresApproval: true,
        riskLevel: 'medium',
        reasoning: 'Order changes need a person to confirm before fulfilment.',
        draftReply: `Hi ${first}, thanks for letting us know. I've passed your change request for ${ref} to the team and we'll confirm shortly.`,
      }
    case 'product_question': {
      const p = ctx.catalog.find(item => ctx.message.toLowerCase().includes(item.title.toLowerCase().split(' ')[0].toLowerCase()))
      return {
        action: 'info_provided',
        refundAmount: null,
        requiresApproval: false,
        riskLevel: 'low',
        reasoning: p ? `Matched catalog item "${p.title}".` : 'General product question.',
        draftReply: p
          ? `Hi ${first}! The ${p.title} is ${formatMoney(p.price, ctx.currency)} and is ${p.inStock ? 'in stock' : 'currently sold out'}. Happy to help with sizing or delivery — just ask!`
          : `Hi ${first}! Thanks for asking — could you tell me which item you're looking at? I'll get you the details right away.`,
      }
    }
    default:
      return {
        action: 'reply',
        refundAmount: null,
        requiresApproval: false,
        riskLevel: 'low',
        reasoning: 'General enquiry.',
        draftReply: `Hi ${first}, thanks for reaching out! How can we help today?`,
      }
  }
}

export function demoListing(): ListingDraft {
  return {
    title: 'Handcrafted Everyday Tote',
    description:
      'A roomy, hand-finished tote made for daily use. Sturdy handles, a clean silhouette and enough space for a laptop, water bottle and the day’s essentials.',
    category: 'Bags',
    suggestedPrice: null,
    tags: ['tote', 'handmade', 'everyday', 'gift idea', 'bags'],
    highlights: ['Fits a 13" laptop', 'Reinforced handles', 'Hand-finished details'],
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function statusPhrase(status: string) {
  switch (status) {
    case 'pending':
      return 'confirmed and awaiting payment'
    case 'paid':
      return 'paid and being prepared'
    case 'fulfilled':
      return 'packed and on its way'
    case 'delivered':
      return 'marked as delivered'
    case 'cancelled':
      return 'cancelled'
    case 'refunded':
      return 'refunded'
    default:
      return status
  }
}
