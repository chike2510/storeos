// ─── Intent Classification ───────────────────────────────────────────────────

export type IntentType =
  | 'order_inquiry'
  | 'complaint'
  | 'refund_request'
  | 'product_question'
  | 'shipping_update'
  | 'return_request'
  | 'general'

export interface ClassifiedIntent {
  intent: IntentType
  confidence: number
  urgency: 'low' | 'medium' | 'high'
  rawInput: string
  extractedEntities: {
    orderId?: string
    productName?: string
    customerName?: string
    amount?: number
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export type PipelineStatus =
  | 'classifying'
  | 'retrieving_context'
  | 'reasoning'
  | 'awaiting_human'
  | 'resolved'
  | 'escalated'

export interface PipelineEvent {
  id: string
  timestamp: Date
  status: PipelineStatus
  input: string
  intent?: ClassifiedIntent
  context?: CustomerContext
  resolution?: Resolution
  checkpoint?: HumanCheckpoint
}

// ─── Context ─────────────────────────────────────────────────────────────────

export interface Order {
  id: string
  customerId: string
  product: string
  amount: number
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled'
  date: string
}

export interface CustomerContext {
  customerId: string
  name: string
  email: string
  totalOrders: number
  recentOrders: Order[]
  sentimentHistory: 'positive' | 'neutral' | 'negative'
}

// ─── Resolution ───────────────────────────────────────────────────────────────

export interface Resolution {
  action: 'auto_resolve' | 'escalate' | 'refund' | 'replace' | 'info_provided'
  draftResponse: string
  reasoning: string
  requiresHuman: boolean
  riskLevel: 'low' | 'medium' | 'high'
  refundAmount?: number
}

// ─── Human Checkpoint ─────────────────────────────────────────────────────────

export interface HumanCheckpoint {
  id: string
  eventId: string
  createdAt: Date
  resolution: Resolution
  context: CustomerContext
  intent: ClassifiedIntent
  status: 'pending' | 'approved' | 'rejected' | 'modified'
  agentDecision: string
  humanOverride?: string
}

// ─── Product Listing ──────────────────────────────────────────────────────────

export interface ProductListing {
  title: string
  description: string
  category: string
  suggestedPrice: string
  tags: string[]
  highlights: string[]
  imageUrl?: string
}
