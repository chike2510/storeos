-- StoreOS — Shopify connector.
--
-- * shopify_connections: one Shopify store per workspace. Credentials and
--   tokens are stored as AES-256-GCM ciphertext produced by the Next.js server
--   (key: STOREOS_ENCRYPTION_KEY). Postgres never sees plaintext, and the
--   ciphertext columns are not selectable by the `authenticated` role at all
--   (column-level grants) — only the service role reads them, server-side.
-- * shopify_sync_runs: one row per sync attempt (manual, connect, cron).
-- * shopify_webhook_events: idempotency ledger keyed by X-Shopify-Webhook-Id.
-- * shopify_upsert_* functions: idempotent upserts into the existing commerce
--   tables with source = 'shopify' and external_id = Shopify GID. Executable by
--   the service role only, so clients cannot forge "Shopify" data.

-- ─── Extra columns on synced tables ────────────────────────────────────────
alter table public.orders
  add column if not exists external_name text,          -- Shopify order name, e.g. "#1001"
  add column if not exists financial_status text,       -- Shopify displayFinancialStatus
  add column if not exists fulfillment_status text;     -- Shopify displayFulfillmentStatus

alter table public.product_variants
  add column if not exists external_inventory_item_id text,  -- Shopify InventoryItem GID
  add column if not exists track_inventory boolean not null default true;

create index if not exists product_variants_inventory_item_idx
  on public.product_variants (workspace_id, external_inventory_item_id)
  where external_inventory_item_id is not null;

-- ─── Connections ────────────────────────────────────────────────────────────
create table if not exists public.shopify_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  shop_domain text not null check (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  shop_name text,
  shop_currency text,
  client_id text not null check (char_length(client_id) between 1 and 200),
  -- Ciphertext only ("v1:<iv>:<tag>:<data>", base64url). Never plaintext.
  client_secret_enc text,
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  auth_mode text not null default 'client_credentials' check (auth_mode in ('client_credentials', 'oauth')),
  scopes text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'uninstalled')),
  webhooks_registered_at timestamptz,
  -- Per-resource sync watermarks/cursors: { products: { since, cursor, query, pass_started }, ... }
  sync_state jsonb not null default '{}'::jsonb,
  sync_lock_until timestamptz,
  last_sync_at timestamptz,
  last_error text,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A Shopify store can feed exactly one workspace (webhooks are routed by shop).
create unique index if not exists shopify_connections_shop_uidx on public.shopify_connections (shop_domain);

create trigger shopify_connections_updated_at before update on public.shopify_connections
  for each row execute function public.set_updated_at();

-- ─── Sync runs ──────────────────────────────────────────────────────────────
create table if not exists public.shopify_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  trigger text not null check (trigger in ('connect', 'manual', 'cron', 'webhook')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed', 'skipped')),
  stats jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists shopify_sync_runs_workspace_idx on public.shopify_sync_runs (workspace_id, started_at desc);

-- ─── Webhook idempotency ────────────────────────────────────────────────────
create table if not exists public.shopify_webhook_events (
  id uuid primary key default gen_random_uuid(),
  webhook_id text not null unique,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  shop_domain text not null,
  topic text not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed', 'ignored')),
  attempts integer not null default 1,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists shopify_webhook_events_workspace_idx on public.shopify_webhook_events (workspace_id, received_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.shopify_connections enable row level security;
alter table public.shopify_sync_runs enable row level security;
alter table public.shopify_webhook_events enable row level security;

create policy shopify_connections_select_admin on public.shopify_connections
  for select using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]));
create policy shopify_connections_insert_admin on public.shopify_connections
  for insert with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]));
create policy shopify_connections_update_admin on public.shopify_connections
  for update using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]));
create policy shopify_connections_delete_admin on public.shopify_connections
  for delete using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]));

create policy shopify_sync_runs_select_admin on public.shopify_sync_runs
  for select using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]));

create policy shopify_webhook_events_select_admin on public.shopify_webhook_events
  for select using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]));

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- Supabase gives new tables broad default grants; reset them explicitly.
revoke all on public.shopify_connections from anon, authenticated;
revoke all on public.shopify_sync_runs from anon, authenticated;
revoke all on public.shopify_webhook_events from anon, authenticated;

-- Owners/admins (via RLS) may read the non-secret columns and disconnect.
-- client_secret_enc / access_token_enc / refresh_token_enc are deliberately
-- absent: `select *` or selecting them fails with "permission denied".
-- Credential writes go through the server (service role) after a role check.
grant select (
  id, workspace_id, shop_domain, shop_name, shop_currency, client_id, token_expires_at, auth_mode, scopes,
  status, webhooks_registered_at, last_sync_at, last_error, connected_by, created_at, updated_at
) on public.shopify_connections to authenticated;
grant delete on public.shopify_connections to authenticated;

grant select on public.shopify_sync_runs to authenticated;
grant select on public.shopify_webhook_events to authenticated;

grant all on public.shopify_connections to service_role;
grant all on public.shopify_sync_runs to service_role;
grant all on public.shopify_webhook_events to service_role;

-- ─── Sync lock (prevents overlapping syncs for one workspace) ──────────────
create or replace function public.shopify_try_lock(p_workspace uuid, p_seconds integer default 120)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.shopify_connections
    set sync_lock_until = now() + make_interval(secs => p_seconds)
    where workspace_id = p_workspace
      and (sync_lock_until is null or sync_lock_until < now())
    returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- ─── Webhook claim: true = process it, false = duplicate delivery ──────────
-- A delivery that previously failed (or got stuck processing) may be retried.
create or replace function public.shopify_claim_webhook(
  p_webhook_id text,
  p_shop text,
  p_topic text,
  p_workspace uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ok boolean;
begin
  insert into public.shopify_webhook_events (webhook_id, shop_domain, topic, workspace_id)
  values (p_webhook_id, p_shop, p_topic, p_workspace)
  on conflict (webhook_id) do update
    set status = 'processing',
        attempts = public.shopify_webhook_events.attempts + 1,
        error = null,
        received_at = now()
    where public.shopify_webhook_events.status = 'failed'
       or (public.shopify_webhook_events.status = 'processing'
           and public.shopify_webhook_events.received_at < now() - interval '2 minutes')
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- ─── Upsert: customers ──────────────────────────────────────────────────────
-- p_rows: [{ external_id, name, email, phone, address, tags: [] }]
create or replace function public.shopify_upsert_customers(p_workspace uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
  v_count integer := 0;
  v_name text;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    continue when nullif(r ->> 'external_id', '') is null;
    v_name := left(coalesce(nullif(trim(r ->> 'name'), ''), nullif(trim(r ->> 'email'), ''),
                            nullif(trim(r ->> 'phone'), ''), 'Shopify customer'), 160);

    insert into public.customers (workspace_id, source, external_id, name, email, phone, address, tags)
    values (
      p_workspace, 'shopify', r ->> 'external_id', v_name,
      nullif(r ->> 'email', ''), nullif(r ->> 'phone', ''), nullif(r ->> 'address', ''),
      coalesce(array(select jsonb_array_elements_text(coalesce(r -> 'tags', '[]'::jsonb))), '{}')
    )
    on conflict (workspace_id, source, external_id) where external_id is not null
    do update set
      name = excluded.name,
      email = excluded.email,
      phone = excluded.phone,
      address = excluded.address,
      -- Merge: keep tags added in StoreOS, add Shopify's.
      tags = array(select distinct t from unnest(public.customers.tags || excluded.tags) as t);

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ─── Upsert: products + variants + stock ────────────────────────────────────
-- p_rows: [{ external_id, title, description, category, sku, status, price,
--            compare_at_price, track_inventory, has_variants, image_url, tags: [],
--            variants: [{ external_id, title, sku, options: {}, price,
--                         inventory_item_id, tracked, stock }] }]
-- Stock is never written directly: differences become 'sync' movements in the
-- inventory ledger, which keeps products/variants stock in step via trigger.
create or replace function public.shopify_upsert_products(p_workspace uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
  v jsonb;
  v_pid uuid;
  v_vid uuid;
  v_cur integer;
  v_threshold integer;
  v_keep text[];
  v_sum integer;
  v_pstock integer;
  v_track boolean;
  v_count integer := 0;
begin
  select default_low_stock_threshold into v_threshold from public.policies where workspace_id = p_workspace;
  v_threshold := coalesce(v_threshold, 5);

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    continue when nullif(r ->> 'external_id', '') is null;
    v_track := coalesce((r ->> 'track_inventory')::boolean, true);

    insert into public.products (
      workspace_id, source, external_id, title, description, category, sku, status, price, compare_at_price,
      track_inventory, low_stock_threshold, has_variants, image_url, tags
    )
    values (
      p_workspace, 'shopify', r ->> 'external_id',
      left(coalesce(nullif(trim(r ->> 'title'), ''), 'Untitled product'), 200),
      left(coalesce(r ->> 'description', ''), 5000),
      left(nullif(r ->> 'category', ''), 80),
      nullif(r ->> 'sku', ''),
      case when r ->> 'status' in ('active', 'draft', 'archived') then r ->> 'status' else 'draft' end,
      greatest(coalesce(nullif(r ->> 'price', '')::numeric, 0), 0),
      case when nullif(r ->> 'compare_at_price', '')::numeric >= 0 then nullif(r ->> 'compare_at_price', '')::numeric end,
      v_track, v_threshold,
      coalesce((r ->> 'has_variants')::boolean, false),
      nullif(r ->> 'image_url', ''),
      coalesce(array(select jsonb_array_elements_text(coalesce(r -> 'tags', '[]'::jsonb))), '{}')
    )
    on conflict (workspace_id, source, external_id) where external_id is not null
    do update set
      title = excluded.title,
      description = excluded.description,
      category = excluded.category,
      sku = excluded.sku,
      status = excluded.status,
      price = excluded.price,
      compare_at_price = excluded.compare_at_price,
      track_inventory = excluded.track_inventory,
      has_variants = excluded.has_variants,
      image_url = coalesce(excluded.image_url, public.products.image_url),
      tags = excluded.tags
    returning id into v_pid;

    v_keep := '{}';
    for v in select * from jsonb_array_elements(coalesce(r -> 'variants', '[]'::jsonb))
    loop
      continue when nullif(v ->> 'external_id', '') is null;
      insert into public.product_variants (
        workspace_id, product_id, source, external_id, title, sku, options, price,
        external_inventory_item_id, track_inventory
      )
      values (
        p_workspace, v_pid, 'shopify', v ->> 'external_id',
        coalesce(nullif(v ->> 'title', ''), 'Default'),
        nullif(v ->> 'sku', ''),
        coalesce(v -> 'options', '{}'::jsonb),
        case when nullif(v ->> 'price', '')::numeric >= 0 then nullif(v ->> 'price', '')::numeric end,
        nullif(v ->> 'inventory_item_id', ''),
        coalesce((v ->> 'tracked')::boolean, true)
      )
      on conflict (workspace_id, source, external_id) where external_id is not null
      do update set
        product_id = excluded.product_id,
        title = excluded.title,
        sku = excluded.sku,
        options = excluded.options,
        price = excluded.price,
        external_inventory_item_id = excluded.external_inventory_item_id,
        track_inventory = excluded.track_inventory
      returning id, stock_quantity into v_vid, v_cur;

      v_keep := v_keep || (v ->> 'external_id');

      if coalesce((v ->> 'tracked')::boolean, true) and nullif(v ->> 'stock', '') is not null
         and (v ->> 'stock')::integer <> v_cur then
        insert into public.inventory_movements (workspace_id, product_id, variant_id, delta, reason, reference_type, note)
        values (p_workspace, v_pid, v_vid, (v ->> 'stock')::integer - v_cur, 'sync', 'shopify', 'Shopify sync');
      end if;
    end loop;

    -- Variants removed in Shopify.
    if r ? 'variants' then
      delete from public.product_variants
        where product_id = v_pid and source = 'shopify' and not (external_id = any (v_keep));
    end if;

    -- Product on-hand = sum of tracked variants (reconcile any drift).
    if v_track then
      select coalesce(sum(stock_quantity) filter (where track_inventory), 0)::integer into v_sum
        from public.product_variants where product_id = v_pid;
      select stock_quantity into v_pstock from public.products where id = v_pid;
      if v_sum <> v_pstock then
        insert into public.inventory_movements (workspace_id, product_id, delta, reason, reference_type, note)
        values (p_workspace, v_pid, v_sum - v_pstock, 'sync', 'shopify', 'Shopify sync');
      end if;
    end if;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Product deleted in Shopify: archive it (keeps order history intact).
create or replace function public.shopify_archive_product(p_workspace uuid, p_external_id text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.products set status = 'archived'
    where workspace_id = p_workspace and source = 'shopify' and external_id = p_external_id
    returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- ─── Upsert: orders + line items ────────────────────────────────────────────
-- p_rows: [{ external_id, name, customer_external_id, status, financial_status,
--            fulfillment_status, currency, subtotal, discount, shipping, total,
--            refunded_amount, notes, shipping_address, created_at, processed_at,
--            cancelled_at, line_items: [{ external_id, title, sku, quantity,
--            unit_price, total, product_external_id, variant_external_id }] }]
-- Orders are looked up first (not INSERT ... ON CONFLICT) so re-syncs never
-- consume a StoreOS order number. Inventory is not touched: Shopify owns stock
-- for synced products and reports it through product/inventory sync.
create or replace function public.shopify_upsert_orders(p_workspace uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
  li jsonb;
  v_oid uuid;
  v_cust uuid;
  v_status public.order_status;
  v_processed timestamptz;
  v_qty integer;
  v_price numeric;
  v_count integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    continue when nullif(r ->> 'external_id', '') is null;
    perform pg_advisory_xact_lock(hashtext(p_workspace::text || ':' || (r ->> 'external_id')));

    v_status := case when r ->> 'status' in ('pending', 'paid', 'fulfilled', 'delivered', 'cancelled', 'refunded')
                     then (r ->> 'status')::public.order_status else 'pending' end;
    v_processed := coalesce(nullif(r ->> 'processed_at', '')::timestamptz, nullif(r ->> 'created_at', '')::timestamptz, now());

    v_cust := null;
    if nullif(r ->> 'customer_external_id', '') is not null then
      select id into v_cust from public.customers
        where workspace_id = p_workspace and source = 'shopify' and external_id = r ->> 'customer_external_id';
    end if;

    select id into v_oid from public.orders
      where workspace_id = p_workspace and source = 'shopify' and external_id = r ->> 'external_id';

    if v_oid is null then
      insert into public.orders (
        workspace_id, source, external_id, external_name, customer_id, status, channel, currency,
        subtotal, discount, shipping, total, refunded_amount, notes, shipping_address,
        financial_status, fulfillment_status, paid_at, fulfilled_at, cancelled_at, refunded_at, created_at
      )
      values (
        p_workspace, 'shopify', r ->> 'external_id', nullif(r ->> 'name', ''), v_cust, v_status, 'shopify',
        upper(coalesce(nullif(r ->> 'currency', ''), (select currency from public.workspaces where id = p_workspace))),
        coalesce((r ->> 'subtotal')::numeric, 0),
        greatest(coalesce((r ->> 'discount')::numeric, 0), 0),
        greatest(coalesce((r ->> 'shipping')::numeric, 0), 0),
        coalesce((r ->> 'total')::numeric, 0),
        greatest(coalesce((r ->> 'refunded_amount')::numeric, 0), 0),
        coalesce(r ->> 'notes', ''),
        nullif(r ->> 'shipping_address', ''),
        nullif(r ->> 'financial_status', ''),
        nullif(r ->> 'fulfillment_status', ''),
        case when v_status in ('paid', 'fulfilled', 'delivered', 'refunded') then v_processed end,
        case when v_status in ('fulfilled', 'delivered') then coalesce(nullif(r ->> 'updated_at', '')::timestamptz, v_processed) end,
        case when v_status = 'cancelled' then coalesce(nullif(r ->> 'cancelled_at', '')::timestamptz, now()) end,
        case when v_status = 'refunded' then coalesce(nullif(r ->> 'updated_at', '')::timestamptz, now()) end,
        coalesce(nullif(r ->> 'created_at', '')::timestamptz, now())
      )
      returning id into v_oid;
    else
      update public.orders set
        external_name = nullif(r ->> 'name', ''),
        customer_id = coalesce(v_cust, customer_id),
        status = v_status,
        currency = upper(coalesce(nullif(r ->> 'currency', ''), currency)),
        subtotal = coalesce((r ->> 'subtotal')::numeric, subtotal),
        discount = greatest(coalesce((r ->> 'discount')::numeric, discount), 0),
        shipping = greatest(coalesce((r ->> 'shipping')::numeric, shipping), 0),
        total = coalesce((r ->> 'total')::numeric, total),
        refunded_amount = greatest(coalesce((r ->> 'refunded_amount')::numeric, refunded_amount), 0),
        notes = coalesce(r ->> 'notes', notes),
        shipping_address = nullif(r ->> 'shipping_address', ''),
        financial_status = nullif(r ->> 'financial_status', ''),
        fulfillment_status = nullif(r ->> 'fulfillment_status', ''),
        paid_at = case when v_status in ('paid', 'fulfilled', 'delivered', 'refunded') then coalesce(paid_at, v_processed) else paid_at end,
        fulfilled_at = case when v_status in ('fulfilled', 'delivered')
                            then coalesce(fulfilled_at, nullif(r ->> 'updated_at', '')::timestamptz, now()) else fulfilled_at end,
        cancelled_at = case when v_status = 'cancelled'
                            then coalesce(cancelled_at, nullif(r ->> 'cancelled_at', '')::timestamptz, now()) else cancelled_at end,
        refunded_at = case when v_status = 'refunded'
                           then coalesce(refunded_at, nullif(r ->> 'updated_at', '')::timestamptz, now()) else refunded_at end
      where id = v_oid;
    end if;

    -- Line items: replace with Shopify's current set.
    if r ? 'line_items' then
      delete from public.order_items where order_id = v_oid;
      for li in select * from jsonb_array_elements(coalesce(r -> 'line_items', '[]'::jsonb))
      loop
        v_qty := coalesce((li ->> 'quantity')::integer, 0);
        continue when v_qty <= 0;
        v_price := greatest(coalesce((li ->> 'unit_price')::numeric, 0), 0);
        insert into public.order_items (
          workspace_id, order_id, product_id, variant_id, source, external_id, title, sku, quantity, unit_price, total
        )
        values (
          p_workspace, v_oid,
          (select id from public.products
            where workspace_id = p_workspace and source = 'shopify' and external_id = li ->> 'product_external_id'),
          (select id from public.product_variants
            where workspace_id = p_workspace and source = 'shopify' and external_id = li ->> 'variant_external_id'),
          'shopify', li ->> 'external_id',
          coalesce(nullif(li ->> 'title', ''), 'Item'),
          nullif(li ->> 'sku', ''),
          v_qty, v_price,
          coalesce((li ->> 'total')::numeric, v_price * v_qty)
        );
      end loop;
    end if;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ─── Set one variant's on-hand from Shopify after a write-back ─────────────
-- Records the difference as a ledger movement attributed to the user who made
-- the change (if the webhook already applied it, the delta is zero and nothing
-- is written).
create or replace function public.shopify_set_variant_stock(
  p_workspace uuid,
  p_variant_external_id text,
  p_quantity integer,
  p_reason public.inventory_reason,
  p_note text,
  p_user uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_var public.product_variants%rowtype;
  v_sum integer;
  v_pstock integer;
begin
  select * into v_var from public.product_variants
    where workspace_id = p_workspace and source = 'shopify' and external_id = p_variant_external_id
    for update;
  if not found then
    raise exception 'Variant not found';
  end if;

  if p_quantity <> v_var.stock_quantity then
    insert into public.inventory_movements (workspace_id, product_id, variant_id, delta, reason, reference_type, note, created_by)
    values (p_workspace, v_var.product_id, v_var.id, p_quantity - v_var.stock_quantity, p_reason, 'shopify', p_note, p_user);
  end if;

  select coalesce(sum(stock_quantity) filter (where track_inventory), 0)::integer into v_sum
    from public.product_variants where product_id = v_var.product_id;
  select stock_quantity into v_pstock from public.products where id = v_var.product_id;
  if v_sum <> v_pstock then
    insert into public.inventory_movements (workspace_id, product_id, delta, reason, reference_type, note, created_by)
    values (p_workspace, v_var.product_id, v_sum - v_pstock, p_reason, 'shopify', p_note, p_user);
  end if;

  return p_quantity;
end;
$$;

-- ─── Function privileges: service role only ────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.shopify_try_lock(uuid, integer)',
    'public.shopify_claim_webhook(text, text, text, uuid)',
    'public.shopify_upsert_customers(uuid, jsonb)',
    'public.shopify_upsert_products(uuid, jsonb)',
    'public.shopify_archive_product(uuid, text)',
    'public.shopify_upsert_orders(uuid, jsonb)',
    'public.shopify_set_variant_stock(uuid, text, integer, public.inventory_reason, text, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
