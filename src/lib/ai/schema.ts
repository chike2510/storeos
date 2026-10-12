import type { RiskLevel, Sentiment } from '@/lib/types'

export const INTENTS = [
  'order_status',
  'shipping_update',
  'refund_request',
  'return_request',
  'complaint',
  'product_question',
  'order_change',
  'general',
] as const
export type Intent = (typeof INTENTS)[number]

export const ACTIONS = ['reply', 'info_provided', 'refund', 'replace', 'escalate'] as const
export type Action = (typeof ACTIONS)[number]

export interface Classification {
  intent: Intent
  urgency: RiskLevel
  confidence: number
  sentiment: Sentiment
  entities: { orderNumber?: number; productName?: string; amount?: number }
}

export interface TriageContext {
  workspaceName: string
  currency: string
  message: string
  history: { from: 'customer' | 'store'; body: string }[]
  customer: {
    name: string
    sentiment: Sentiment
    ordersCount: number
    totalSpent: number
  } | null
  orders: {
    number: number
    status: string
    total: number
    createdAt: string
    items: string[]
  }[]
  linkedOrderNumber: number | null
  catalog: { title: string; price: number; inStock: boolean }[]
  guidelines: string
  policy: {
    autoRefundLimit: number
    highRiskRefundAbove: number
  }
}

export interface Resolution {
  action: Action
  draftReply: string
  reasoning: string
  requiresApproval: boolean
  riskLevel: RiskLevel
  refundAmount: number | null
}

export interface ListingDraft {
  title: string
  description: string
  category: string
  suggestedPrice: number | null
  tags: string[]
  highlights: string[]
}
