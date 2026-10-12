// Row types mirroring supabase/migrations. Keep in sync with the SQL.

export type MemberRole = 'owner' | 'admin' | 'staff'
export type OrderStatus = 'pending' | 'paid' | 'fulfilled' | 'delivered' | 'cancelled' | 'refunded'
export type RiskLevel = 'low' | 'medium' | 'high'
export type ConversationStatus = 'open' | 'awaiting_approval' | 'resolved' | 'closed'
export type DecisionStatus = 'auto_sent' | 'pending_approval' | 'approved' | 'rejected' | 'drafted'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type Sentiment = 'positive' | 'neutral' | 'negative'

export interface Workspace {
  id: string
  name: string
  currency: string
  business_type: 'standalone' | 'shopify'
  timezone: string
  created_at: string
}

export interface Policies {
  workspace_id: string
  auto_refund_limit: number
  high_risk_refund_above: number
  auto_send_low_risk: boolean
  escalate_high_urgency: boolean
  escalate_negative_sentiment: boolean
  escalate_complaints: boolean
  default_low_stock_threshold: number
  reply_guidelines: string
}

export interface Product {
  id: string
  workspace_id: string
  source: string
  external_id: string | null
  title: string
  description: string
  category: string | null
  sku: string | null
  status: 'active' | 'draft' | 'archived'
  price: number
  compare_at_price: number | null
  cost: number | null
  track_inventory: boolean
  stock_quantity: number
  low_stock_threshold: number
  is_low_stock: boolean
  image_url: string | null
  image_path: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

export interface InventoryMovement {
  id: string
  product_id: string
  delta: number
  reason: 'initial' | 'adjustment' | 'restock' | 'order' | 'cancellation' | 'return' | 'sync'
  reference_type: string | null
  reference_id: string | null
  note: string | null
  created_at: string
}

export interface Customer {
  id: string
  workspace_id: string
  source: string
  name: string
  email: string | null
  phone: string | null
  instagram_handle: string | null
  address: string | null
  notes: string
  tags: string[]
  sentiment: Sentiment
  created_at: string
}

export interface CustomerStats {
  customer_id: string
  orders_count: number
  total_spent: number
  last_order_at: string | null
}

export type OrderChannel = 'manual' | 'instagram' | 'whatsapp' | 'website' | 'walk_in' | 'shopify' | 'other'

export interface Order {
  id: string
  workspace_id: string
  source: string
  external_id?: string | null
  external_name?: string | null
  financial_status?: string | null
  fulfillment_status?: string | null
  order_number: number
  customer_id: string | null
  status: OrderStatus
  channel: OrderChannel
  currency: string
  subtotal: number
  discount: number
  shipping: number
  total: number
  refunded_amount: number
  notes: string
  shipping_address: string | null
  paid_at: string | null
  fulfilled_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  refunded_at: string | null
  created_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  title: string
  sku: string | null
  quantity: number
  unit_price: number
  total: number
}

export type ConversationChannel = 'manual' | 'instagram' | 'whatsapp' | 'email' | 'website' | 'shopify' | 'other'

export interface Conversation {
  id: string
  workspace_id: string
  customer_id: string | null
  order_id: string | null
  channel: ConversationChannel
  subject: string
  status: ConversationStatus
  intent: string | null
  urgency: RiskLevel | null
  last_message_at: string
  created_at: string
}

export interface Message {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound' | 'internal'
  author_type: 'customer' | 'user' | 'ai' | 'system'
  author_id: string | null
  body: string
  ai_decision_id: string | null
  created_at: string
}

export interface AIDecision {
  id: string
  workspace_id: string
  conversation_id: string | null
  message_id: string | null
  intent: string | null
  urgency: RiskLevel | null
  confidence: number | null
  entities: Record<string, unknown>
  action: string | null
  risk_level: RiskLevel
  requires_approval: boolean
  refund_amount: number | null
  draft_reply: string | null
  reasoning: string | null
  policy_notes: string[]
  model: string | null
  mode: 'live' | 'demo'
  status: DecisionStatus
  created_at: string
}

export interface Approval {
  id: string
  workspace_id: string
  decision_id: string
  conversation_id: string | null
  status: ApprovalStatus
  reason: string
  final_reply: string | null
  rationale: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

export interface AuditEvent {
  id: string
  actor_type: 'user' | 'ai' | 'system'
  actor_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface MemberRow {
  user_id: string
  role: MemberRole
  email: string | null
  full_name: string | null
  joined_at: string
}

/** Standard result shape for server actions used with useFormState. */
export type ActionState = { ok?: boolean; error?: string; message?: string } | null
