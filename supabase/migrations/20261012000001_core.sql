-- StoreOS v1 — core tenancy: profiles, workspaces, membership, invitations, policies.
-- Every tenant-owned row in StoreOS carries a workspace_id. Access is granted
-- through workspace_members and enforced by RLS (see 20261012000004_rls.sql).

-- gen_random_uuid() is built in (PG13+); no extension needed.

-- ─── Enums ──────────────────────────────────────────────────────────────────
do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'staff');
exception when duplicate_object then null; end $$;

-- ─── updated_at helper ──────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Profiles (1:1 with auth.users) ─────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Workspaces ─────────────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  -- 'standalone' = StoreOS is the system of record (Instagram/WhatsApp sellers)
  -- 'shopify'    = StoreOS layered on top of a Shopify store (sync arrives later)
  business_type text not null default 'standalone' check (business_type in ('standalone', 'shopify')),
  timezone text not null default 'Africa/Lagos',
  next_order_number integer not null default 1001,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.member_role not null default 'staff' check (role <> 'owner'),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

-- ─── Membership helpers (SECURITY DEFINER so RLS policies can call them
--     without recursing into workspace_members' own policies) ───────────────
create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(p_workspace uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

-- ─── Policies (per-workspace automation & risk thresholds) ─────────────────
-- Monetary thresholds are in the workspace currency.
create table if not exists public.policies (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  -- Refunds at or below this amount may be auto-approved for customers in good standing.
  auto_refund_limit numeric(14, 2) not null default 5000 check (auto_refund_limit >= 0),
  -- Refunds above this amount are always classified high risk.
  high_risk_refund_above numeric(14, 2) not null default 50000 check (high_risk_refund_above >= 0),
  -- When true, low-risk AI drafts are sent without human review.
  auto_send_low_risk boolean not null default true,
  -- Escalation rules.
  escalate_high_urgency boolean not null default true,
  escalate_negative_sentiment boolean not null default true,
  escalate_complaints boolean not null default false,
  -- Default low-stock threshold applied to new products.
  default_low_stock_threshold integer not null default 5 check (default_low_stock_threshold >= 0),
  -- Free-text guidance the AI must follow when drafting replies (tone, return window, etc.).
  reply_guidelines text not null default '',
  updated_at timestamptz not null default now()
);

create trigger policies_updated_at before update on public.policies
  for each row execute function public.set_updated_at();

-- ─── Onboarding RPC: create a workspace and make the caller its owner ───────
create or replace function public.create_workspace(
  p_name text,
  p_currency text default 'NGN',
  p_business_type text default 'standalone'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  insert into public.workspaces (name, currency, business_type, created_by)
  values (trim(p_name), upper(coalesce(nullif(trim(p_currency), ''), 'NGN')), coalesce(p_business_type, 'standalone'), v_uid)
  returning id into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_ws, v_uid, 'owner');

  insert into public.policies (workspace_id) values (v_ws);

  return v_ws;
end;
$$;

-- ─── Invitations: accept every pending invite addressed to the caller ───────
create or replace function public.accept_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_count integer := 0;
  r record;
begin
  if v_uid is null then
    return 0;
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null then
    return 0;
  end if;

  for r in
    select * from public.workspace_invitations
    where email = v_email and accepted_at is null
  loop
    insert into public.workspace_members (workspace_id, user_id, role)
    values (r.workspace_id, v_uid, r.role)
    on conflict (workspace_id, user_id) do nothing;

    update public.workspace_invitations set accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Members list with profile info (members can see who else is in their workspace).
create or replace function public.workspace_member_directory(p_workspace uuid)
returns table (user_id uuid, role public.member_role, email text, full_name text, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, m.role, p.email, p.full_name, m.created_at
  from public.workspace_members m
  left join public.profiles p on p.id = m.user_id
  where m.workspace_id = p_workspace
    and public.is_workspace_member(p_workspace)
  order by m.created_at;
$$;
