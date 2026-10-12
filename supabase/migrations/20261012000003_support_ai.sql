-- StoreOS v1 — support inbox, AI decisions, approvals, audit log.

do $$ begin
  create type public.conversation_status as enum ('open', 'awaiting_approval', 'resolved', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.risk_level as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.decision_status as enum ('auto_sent', 'pending_approval', 'approved', 'rejected', 'drafted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ─── Conversations & messages ───────────────────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source text not null default 'storeos',
  external_id text,
  customer_id uuid references public.customers (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  channel text not null default 'manual'
    check (channel in ('manual', 'instagram', 'whatsapp', 'email', 'website', 'shopify', 'other')),
  subject text not null default '',
  status public.conversation_status not null default 'open',
  intent text,
  urgency public.risk_level,
  assigned_to uuid references auth.users (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists conversations_source_external_uidx
  on public.conversations (workspace_id, source, external_id) where external_id is not null;
create index if not exists conversations_workspace_idx on public.conversations (workspace_id, last_message_at desc);
create index if not exists conversations_customer_idx on public.conversations (customer_id);

create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  author_type text not null check (author_type in ('customer', 'user', 'ai', 'system')),
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 8000),
  ai_decision_id uuid,
  external_id text,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
    set last_message_at = new.created_at
    where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation();

-- ─── AI decisions (every model recommendation, as finally enforced) ─────────
create table if not exists public.ai_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  kind text not null default 'support_reply' check (kind in ('support_reply', 'product_listing')),
  intent text,
  urgency public.risk_level,
  confidence numeric(4, 3),
  entities jsonb not null default '{}'::jsonb,
  action text,
  risk_level public.risk_level not null default 'high',
  requires_approval boolean not null default true,
  refund_amount numeric(14, 2),
  draft_reply text,
  reasoning text,
  -- Human-readable reasons the server-side policy overrode the model.
  policy_notes text[] not null default '{}',
  model text,
  mode text not null default 'live' check (mode in ('live', 'demo')),
  status public.decision_status not null default 'drafted',
  created_at timestamptz not null default now()
);

create index if not exists ai_decisions_conversation_idx on public.ai_decisions (conversation_id, created_at desc);

alter table public.messages
  drop constraint if exists messages_ai_decision_fk;
alter table public.messages
  add constraint messages_ai_decision_fk foreign key (ai_decision_id) references public.ai_decisions (id) on delete set null;

-- ─── Approvals (human checkpoint for high-risk decisions) ───────────────────
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  decision_id uuid not null references public.ai_decisions (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  status public.approval_status not null default 'pending',
  reason text not null default '',
  final_reply text,
  rationale text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (decision_id)
);

create index if not exists approvals_workspace_status_idx on public.approvals (workspace_id, status, created_at desc);

-- ─── Audit events (append-only) ─────────────────────────────────────────────
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'ai', 'system')),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_workspace_idx on public.audit_events (workspace_id, created_at desc);
create index if not exists audit_events_entity_idx on public.audit_events (entity_type, entity_id);

-- ─── decide_approval: atomic approve/reject with rationale ──────────────────
-- Only owners/admins may decide. On approval the final reply is posted to the
-- conversation as an outbound message; the whole decision is audited.
create or replace function public.decide_approval(
  p_approval uuid,
  p_decision public.approval_status,
  p_rationale text,
  p_final_reply text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_approval public.approvals%rowtype;
  v_decision public.ai_decisions%rowtype;
  v_reply text;
  v_message uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  if coalesce(trim(p_rationale), '') = '' then
    raise exception 'A rationale is required';
  end if;

  select * into v_approval from public.approvals where id = p_approval for update;
  if not found or not public.has_workspace_role(v_approval.workspace_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'Approval not found or you are not allowed to decide it';
  end if;
  if v_approval.status <> 'pending' then
    raise exception 'This approval was already %', v_approval.status;
  end if;

  select * into v_decision from public.ai_decisions where id = v_approval.decision_id;
  v_reply := coalesce(nullif(trim(p_final_reply), ''), v_decision.draft_reply);

  update public.approvals set
    status = p_decision,
    rationale = trim(p_rationale),
    final_reply = case when p_decision = 'approved' then v_reply end,
    decided_by = auth.uid(),
    decided_at = now()
  where id = p_approval;

  update public.ai_decisions
    set status = case when p_decision = 'approved' then 'approved'::public.decision_status else 'rejected'::public.decision_status end
    where id = v_decision.id;

  if p_decision = 'approved' and v_approval.conversation_id is not null and coalesce(v_reply, '') <> '' then
    insert into public.messages (workspace_id, conversation_id, direction, author_type, author_id, body, ai_decision_id)
    values (v_approval.workspace_id, v_approval.conversation_id, 'outbound', 'user', auth.uid(), v_reply, v_decision.id)
    returning id into v_message;

    update public.conversations set status = 'resolved' where id = v_approval.conversation_id;
  elsif v_approval.conversation_id is not null then
    update public.conversations set status = 'open' where id = v_approval.conversation_id;
  end if;

  insert into public.audit_events (workspace_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  values (v_approval.workspace_id, 'user', auth.uid(), 'approval.' || p_decision::text, 'approval', p_approval,
          jsonb_build_object('rationale', trim(p_rationale), 'decision_id', v_decision.id,
                             'action', v_decision.action, 'refund_amount', v_decision.refund_amount,
                             'edited', p_final_reply is not null and trim(p_final_reply) <> coalesce(v_decision.draft_reply, '')));

  return v_message;
end;
$$;
