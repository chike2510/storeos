import type { Metadata } from 'next'
import { Bot, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { Alert, Avatar, PageHeader } from '@/components/ui/misc'
import { aiConfig } from '@/lib/ai/config'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { CURRENCIES, formatDate } from '@/lib/utils'
import type { MemberRow, Policies } from '@/lib/types'
import {
  clearDemoData,
  inviteMember,
  loadDemoData,
  removeMember,
  revokeInvitation,
  updateMemberRole,
  updatePolicies,
  updateWorkspace,
} from './actions'
import { SHOPIFY_CONNECTION_COLUMNS, ShopifyIntegration, type ShopifyConnectionView, type ShopifySyncRunView } from './shopify-integration'

export const metadata: Metadata = { title: 'Settings' }
// Shopify connect / Sync now run a time-boxed sync inside the server action.
export const maxDuration = 60

const TIMEZONES = ['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Dubai', 'UTC']

export default async function SettingsPage({ searchParams }: { searchParams: { shopify?: string; shopify_error?: string } }) {
  const { supabase, workspace, role, user } = await requireWorkspace()
  const admin = canManage(role)
  const [{ data: pol }, { data: members }, { data: invites }, { count: demoCount }, { data: shopifyConn }, { data: shopifyRuns }] = await Promise.all([
    supabase.from('policies').select('*').eq('workspace_id', workspace.id).single(),
    supabase.rpc('workspace_member_directory', { p_workspace: workspace.id }),
    supabase.from('workspace_invitations').select('*').eq('workspace_id', workspace.id).is('accepted_at', null).order('created_at'),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id).contains('tags', ['demo']),
    // RLS: owners/admins only; staff get null.
    supabase.from('shopify_connections').select(SHOPIFY_CONNECTION_COLUMNS).eq('workspace_id', workspace.id).maybeSingle(),
    supabase
      .from('shopify_sync_runs')
      .select('id, trigger, status, stats, error, started_at')
      .eq('workspace_id', workspace.id)
      .order('started_at', { ascending: false })
      .limit(5),
  ])
  const policies = pol as Policies | null
  const team = (members ?? []) as MemberRow[]
  const pendingInvites = (invites ?? []) as { id: string; email: string; role: string; created_at: string }[]
  const ai = aiConfig()
  const cur = workspace.currency
  const timezones = TIMEZONES.includes(workspace.timezone) ? TIMEZONES : [workspace.timezone, ...TIMEZONES]

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description={`Manage ${workspace.name}.`} />
      {!admin ? (
        <Alert tone="info" className="mb-6">
          You&apos;re a staff member. Ask an owner or admin to change workspace settings.
        </Alert>
      ) : null}

      {searchParams.shopify ? (
        <Alert tone="success" className="mb-6">
          {searchParams.shopify}
        </Alert>
      ) : null}
      {searchParams.shopify_error ? (
        <Alert tone="error" className="mb-6">
          Shopify: {searchParams.shopify_error}
        </Alert>
      ) : null}

      <div className="space-y-6">
        {/* General */}
        <ActionForm action={updateWorkspace}>
          <Card>
            <CardHeader title="General" />
            <CardBody className="space-y-4">
              <Field label="Store name" htmlFor="ws-name">
                <Input id="ws-name" name="name" defaultValue={workspace.name} required disabled={!admin} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Currency" htmlFor="ws-currency" hint="Existing orders keep the currency they were created in.">
                  <Select id="ws-currency" name="currency" defaultValue={workspace.currency} disabled={!admin}>
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Time zone" htmlFor="ws-tz" hint="Used for daily reports.">
                  <Select id="ws-tz" name="timezone" defaultValue={workspace.timezone} disabled={!admin}>
                    {timezones.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="How you sell" htmlFor="ws-type">
                <Select id="ws-type" name="business_type" defaultValue={workspace.business_type} disabled={!admin}>
                  <option value="standalone">Social & direct — StoreOS is my system of record</option>
                  <option value="shopify">Shopify — StoreOS on top of my Shopify store</option>
                </Select>
              </Field>
            </CardBody>
            {admin ? (
              <CardFooter>
                <SubmitButton size="sm">Save</SubmitButton>
              </CardFooter>
            ) : null}
          </Card>
        </ActionForm>

        {/* Policies */}
        {policies ? (
          <ActionForm action={updatePolicies}>
            <Card>
              <CardHeader
                title="AI & approval policy"
                description="Hard limits enforced on the server — the AI can never override them."
              />
              <CardBody className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={`Auto-refund limit (${cur})`} htmlFor="auto_refund_limit" hint="Refunds at or below this can be approved by AI for customers in good standing.">
                    <Input id="auto_refund_limit" name="auto_refund_limit" inputMode="decimal" defaultValue={policies.auto_refund_limit} disabled={!admin} />
                  </Field>
                  <Field label={`High-risk refund above (${cur})`} htmlFor="high_risk_refund_above" hint="Flagged as high risk in Approvals.">
                    <Input id="high_risk_refund_above" name="high_risk_refund_above" inputMode="decimal" defaultValue={policies.high_risk_refund_above} disabled={!admin} />
                  </Field>
                </div>
                <div className="space-y-3">
                  <Checkbox name="auto_send_low_risk" defaultChecked={policies.auto_send_low_risk} disabled={!admin} label="Auto-send low-risk replies" description="Otherwise every AI draft waits for approval." />
                  <Checkbox name="escalate_high_urgency" defaultChecked={policies.escalate_high_urgency} disabled={!admin} label="Always review urgent messages" />
                  <Checkbox name="escalate_negative_sentiment" defaultChecked={policies.escalate_negative_sentiment} disabled={!admin} label="Always review customers with negative sentiment" />
                  <Checkbox name="escalate_complaints" defaultChecked={policies.escalate_complaints} disabled={!admin} label="Always review complaints" />
                </div>
                <Field label="Reply guidelines" htmlFor="reply_guidelines" hint="Tone, return window, delivery times — the AI follows these when drafting.">
                  <Textarea
                    id="reply_guidelines"
                    name="reply_guidelines"
                    rows={4}
                    defaultValue={policies.reply_guidelines}
                    disabled={!admin}
                    placeholder="Friendly and brief. Lagos delivery 1–2 days, elsewhere 3–5 days. Returns accepted within 7 days if unworn."
                  />
                </Field>
                <Field label="Default low-stock alert" htmlFor="default_low_stock_threshold" hint="Applied to new products.">
                  <Input id="default_low_stock_threshold" name="default_low_stock_threshold" inputMode="numeric" className="sm:w-32" defaultValue={policies.default_low_stock_threshold} disabled={!admin} />
                </Field>
              </CardBody>
              {admin ? (
                <CardFooter>
                  <SubmitButton size="sm">Save policy</SubmitButton>
                </CardFooter>
              ) : null}
            </Card>
          </ActionForm>
        ) : null}

        {/* Team */}
        <Card>
          <CardHeader title="Team" description="Owners and admins manage settings and approvals. Staff handle products, orders and support." />
          <ul className="divide-y divide-zinc-100">
            {team.map(m => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={m.full_name || m.email} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {m.full_name || m.email}
                    {m.user_id === user.id ? <span className="ml-1.5 font-normal text-zinc-400">(you)</span> : null}
                  </p>
                  <p className="truncate text-xs text-zinc-500">{m.email}</p>
                </div>
                {admin && m.user_id !== user.id && (role === 'owner' || m.role === 'staff') ? (
                  <div className="flex items-center gap-1">
                    <form action={updateMemberRole} className="flex items-center gap-1">
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <Select name="role" defaultValue={m.role} className="h-8 w-28 text-[13px]" aria-label="Role">
                        {role === 'owner' ? <option value="owner">Owner</option> : null}
                        {role === 'owner' ? <option value="admin">Admin</option> : null}
                        <option value="staff">Staff</option>
                      </Select>
                      <Button type="submit" variant="ghost" size="sm">
                        Update
                      </Button>
                    </form>
                    <form action={removeMember}>
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <ConfirmButton variant="ghost" size="icon" message={`Remove ${m.email} from ${workspace.name}?`} aria-label="Remove member">
                        <Trash2 className="h-4 w-4 text-zinc-400" />
                      </ConfirmButton>
                    </form>
                  </div>
                ) : (
                  <Badge tone={m.role === 'owner' ? 'violet' : m.role === 'admin' ? 'blue' : 'neutral'}>{m.role}</Badge>
                )}
              </li>
            ))}
            {pendingInvites.map(i => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={i.email} className="opacity-60" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-700">{i.email}</p>
                  <p className="text-xs text-zinc-500">Invited {formatDate(i.created_at)} · {i.role}</p>
                </div>
                <Badge tone="amber">Pending</Badge>
                {admin ? (
                  <form action={revokeInvitation}>
                    <input type="hidden" name="id" value={i.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Revoke
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          {admin ? (
            <CardFooter className="block">
              <ActionForm action={inviteMember} resetOnSuccess className="flex flex-col gap-2 sm:flex-row">
                <Input name="email" type="email" required placeholder="teammate@store.com" aria-label="Email" className="flex-1" />
                <Select name="role" defaultValue="staff" className="sm:w-32" aria-label="Role">
                  <option value="staff">Staff</option>
                  {role === 'owner' ? <option value="admin">Admin</option> : null}
                </Select>
                <SubmitButton variant="secondary">Invite</SubmitButton>
              </ActionForm>
            </CardFooter>
          ) : null}
        </Card>

        {/* AI provider */}
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-zinc-500" /> AI provider
              </span>
            }
            description="Configured by environment variables on the server."
          />
          <CardBody>
            <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <dt className="text-zinc-500">Mode</dt>
              <dd>{ai.mode === 'live' ? <Badge tone="green">Live</Badge> : <Badge tone="amber">Demo (no AI_API_KEY)</Badge>}</dd>
              <dt className="text-zinc-500">Provider</dt>
              <dd className="text-zinc-800">{ai.provider}</dd>
              <dt className="text-zinc-500">Text model</dt>
              <dd className="font-mono text-[13px] text-zinc-800">{ai.model}</dd>
              <dt className="text-zinc-500">Vision model</dt>
              <dd className="font-mono text-[13px] text-zinc-800">{ai.visionModel}</dd>
            </dl>
          </CardBody>
        </Card>

        {/* Integrations */}
        <Card id="integrations">
          <CardHeader title="Integrations" description="Connect the tools you already sell with." />
          <ShopifyIntegration
            admin={admin}
            conn={(shopifyConn as ShopifyConnectionView | null) ?? null}
            runs={(shopifyRuns ?? []) as ShopifySyncRunView[]}
          />
        </Card>

        {/* Demo data */}
        {admin ? (
          <Card>
            <CardHeader title="Demo data" description="Sample products, customers, orders and conversations for exploring StoreOS." />
            <CardBody className="flex flex-wrap items-center gap-3">
              {(demoCount ?? 0) > 0 ? (
                <ActionForm action={clearDemoData}>
                  <SubmitButton variant="secondary" pendingText="Removing…">
                    Remove demo data
                  </SubmitButton>
                </ActionForm>
              ) : (
                <ActionForm action={loadDemoData}>
                  <SubmitButton variant="secondary" pendingText="Loading…">
                    Load demo data
                  </SubmitButton>
                </ActionForm>
              )}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
