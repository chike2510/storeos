import type { Policies, RiskLevel } from '@/lib/types'
import type { Classification, Resolution, TriageContext } from './schema'

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 }
const raise = (a: RiskLevel, b: RiskLevel): RiskLevel => (RANK[b] > RANK[a] ? b : a)

/**
 * Hard, server-side policy. The model's output is only a recommendation; this
 * function has the final say on whether a reply may be sent without a human.
 * It exists so a manipulated or hallucinated response can never bypass review
 * for anything involving money or an at-risk customer.
 */
export function enforcePolicy(
  resolution: Resolution,
  classification: Classification,
  ctx: TriageContext,
  policies: Policies,
  linkedOrderTotal: number | null,
): { resolution: Resolution; notes: string[] } {
  const notes: string[] = []
  let requiresApproval = resolution.requiresApproval
  let risk = resolution.riskLevel
  let refundAmount = resolution.refundAmount

  const isRefund = resolution.action === 'refund' || classification.intent === 'refund_request'

  if (refundAmount !== null && (!Number.isFinite(refundAmount) || refundAmount < 0)) {
    notes.push('Refund amount was invalid and has been cleared')
    refundAmount = null
    requiresApproval = true
    risk = 'high'
  }

  if (refundAmount !== null && linkedOrderTotal !== null && refundAmount > linkedOrderTotal) {
    notes.push('Refund amount exceeds the order total')
    requiresApproval = true
    risk = 'high'
  }

  if (resolution.action === 'refund' && refundAmount === null) {
    notes.push('Refund amount is unknown')
    requiresApproval = true
    risk = raise(risk, 'medium')
  }

  if (refundAmount !== null && refundAmount > Number(policies.auto_refund_limit)) {
    notes.push('Refund exceeds the auto-refund limit')
    requiresApproval = true
    risk = raise(risk, 'medium')
  }
  if (refundAmount !== null && refundAmount > Number(policies.high_risk_refund_above)) {
    notes.push('Refund is above the high-risk threshold')
    risk = 'high'
  }

  if (policies.escalate_negative_sentiment && (ctx.customer?.sentiment === 'negative' || classification.sentiment === 'negative') && isRefund) {
    notes.push('Customer has negative sentiment')
    requiresApproval = true
    risk = raise(risk, 'medium')
  } else if (policies.escalate_negative_sentiment && ctx.customer?.sentiment === 'negative') {
    notes.push('Customer has negative sentiment history')
    requiresApproval = true
    risk = raise(risk, 'medium')
  }

  if (policies.escalate_high_urgency && classification.urgency === 'high') {
    notes.push('High urgency')
    requiresApproval = true
    risk = raise(risk, 'medium')
  }

  if (policies.escalate_complaints && classification.intent === 'complaint') {
    notes.push('Complaints require review')
    requiresApproval = true
  }

  if (resolution.action === 'escalate') {
    if (!notes.length) notes.push('AI recommended escalation')
    requiresApproval = true
  }

  if (classification.confidence < 0.6) {
    notes.push('Low classification confidence')
    requiresApproval = true
  }

  if (!resolution.draftReply.trim()) {
    notes.push('No draft reply was produced')
    requiresApproval = true
  }

  if (requiresApproval && risk === 'low') risk = 'medium'

  // Low-risk drafts still wait for a human when the workspace turned auto-send off.
  if (!requiresApproval && !policies.auto_send_low_risk) {
    notes.push('Auto-send is turned off')
    requiresApproval = true
  }

  return { resolution: { ...resolution, requiresApproval, riskLevel: risk, refundAmount }, notes }
}
