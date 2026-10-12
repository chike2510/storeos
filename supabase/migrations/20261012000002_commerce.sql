-- StoreOS v1 — commerce: products, variants, inventory, customers, orders.
--
-- Sync-ready: every externally-syncable table has `source` ('storeos' for rows
-- created in StoreOS, 'shopify' etc. for synced rows) and `external_id` (the
-- id in the source system). A unique (workspace_id, source, external_id) index
-- lets a future Shopify sync upsert into the same tables.

do $$ begin
  create type public.order_status as enum ('pending', 'paid', 'fulfilled', 'delivered', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inventory_reason as enum ('initial', 'adjustment', 'restock', 'order', 'cancellation', 'return', 'sync');
exception when duplicate_object then null; end $$;

-- ─── Products ───────────────────────────────────────────────────────────────
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source text not null default 'storeos',
  external_id text,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  category text,
  sku text,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  price numeric(14, 2) not null default 0 check (price >= 0),
  compare_at_price numeric(14, 2) check (compare_at_price is null or compare_at_price >= 0),
  cost numeric(14, 2) check (cost is null or cost >= 0),
  track_inventory boolean not null default true,
  stock_quantity integer not null default 0,
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  is_low_stock boolean generated always as (track_inventory and stock_quantity <= low_stock_threshold) stored,
  has_variants boolean not null default false,
  image_url text,
  image_path text,
  tags text[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_source_external_uidx
  on public.products (workspace_id, source, external_id) where external_id is not null;
create index if not exists products_workspace_idx on public.products (workspace_id, created_at desc);
create index if not exists products_low_stock_idx on public.products (workspace_id) where is_low_stock;

create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- Variants are optional (v1 UI manages stock at product level; the table is
-- here so Shopify variants can sync without a schema change).
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  source text not null default 'storeos',
  external_id text,
  title text not null,
  sku text,
  options jsonb not null default '{}'::jsonb,
  price numeric(14, 2) check (price is null or price >= 0),
  stock_quantity integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_variants_source_external_uidx
  on public.product_variants (workspace_id, source, external_id) where external_id is not null;
create index if not exists product_variants_product_idx on public.product_variants (product_id);

create trigger product_variants_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

-- ─── Inventory movements (append-only stock ledger) ─────────────────────────
-- products.stock_quantity is maintained by trigger from this ledger: never
-- update stock_quantity directly, insert a movement instead.
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  delta integer not null check (delta <> 0),
  reason public.inventory_reason not null,
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);

create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.variant_id is not null then
    update public.product_variants
      set stock_quantity = stock_quantity + new.delta
      where id = new.variant_id and workspace_id = new.workspace_id;
  end if;

  update public.products
    set stock_quantity = stock_quantity + new.delta
    where id = new.product_id and workspace_id = new.workspace_id;

  return new;
end;
$$;

create trigger inventory_movements_apply after insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

-- Manual stock adjustment (restock, recount, damage...).
create or replace function public.adjust_stock(
  p_product uuid,
  p_delta integer,
  p_reason public.inventory_reason default 'adjustment',
  p_note text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ws uuid;
  v_stock integer;
begin
  select workspace_id into v_ws from public.products where id = p_product;
  if v_ws is null or not public.is_workspace_member(v_ws) then
    raise exception 'Product not found';
  end if;
  if p_delta = 0 then
    select stock_quantity into v_stock from public.products where id = p_product;
    return v_stock;
  end if;

  insert into public.inventory_movements (workspace_id, product_id, delta, reason, note, created_by)
  values (v_ws, p_product, p_delta, p_reason, p_note, auth.uid());

  select stock_quantity into v_stock from public.products where id = p_product;
  return v_stock;
end;
$$;

-- ─── Customers ──────────────────────────────────────────────────────────────
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source text not null default 'storeos',
  external_id text,
  name text not null check (char_length(name) between 1 and 160),
  email text,
  phone text,
  instagram_handle text,
  address text,
  notes text not null default '',
  tags text[] not null default '{}',
  sentiment text not null default 'neutral' check (sentiment in ('positive', 'neutral', 'negative')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_source_external_uidx
  on public.customers (workspace_id, source, external_id) where external_id is not null;
create index if not exists customers_workspace_idx on public.customers (workspace_id, created_at desc);

create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ─── Orders ─────────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source text not null default 'storeos',
  external_id text,
  order_number integer not null,
  customer_id uuid references public.customers (id) on delete set null,
  status public.order_status not null default 'pending',
  channel text not null default 'manual'
    check (channel in ('manual', 'instagram', 'whatsapp', 'website', 'walk_in', 'shopify', 'other')),
  currency char(3) not null,
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  shipping numeric(14, 2) not null default 0 check (shipping >= 0),
  total numeric(14, 2) not null default 0,
  refunded_amount numeric(14, 2) not null default 0 check (refunded_amount >= 0),
  notes text not null default '',
  shipping_address text,
  paid_at timestamptz,
  fulfilled_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, order_number)
);

create unique index if not exists orders_source_external_uidx
  on public.orders (workspace_id, source, external_id) where external_id is not null;
create index if not exists orders_workspace_created_idx on public.orders (workspace_id, created_at desc);
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_status_idx on public.orders (workspace_id, status);

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- Per-workspace sequential order numbers (#1001, #1002, ...).
create or replace function public.assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_number is null then
    update public.workspaces
      set next_order_number = next_order_number + 1
      where id = new.workspace_id
      returning next_order_number - 1 into new.order_number;
  end if;
  if new.currency is null then
    select currency into new.currency from public.workspaces where id = new.workspace_id;
  end if;
  return new;
end;
$$;

create trigger orders_assign_number before insert on public.orders
  for each row execute function public.assign_order_number();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  source text not null default 'storeos',
  external_id text,
  title text not null,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  total numeric(14, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

-- ─── create_order: atomic manual order creation ─────────────────────────────
-- p_items: [{ "product_id": uuid, "quantity": int, "unit_price"?: number }
--          | { "title": text, "quantity": int, "unit_price": number }]  (custom line)
-- Decrements stock for tracked products and refuses to oversell.
create or replace function public.create_order(
  p_workspace uuid,
  p_customer uuid,
  p_items jsonb,
  p_status public.order_status default 'pending',
  p_channel text default 'manual',
  p_discount numeric default 0,
  p_shipping numeric default 0,
  p_notes text default '',
  p_shipping_address text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_price numeric(14, 2);
  v_title text;
  v_subtotal numeric(14, 2) := 0;
begin
  if not public.is_workspace_member(p_workspace) then
    raise exception 'Not a member of this workspace';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one line item';
  end if;
  if p_status in ('cancelled', 'refunded') then
    raise exception 'New orders cannot start as %', p_status;
  end if;
  if p_customer is not null and not exists (
    select 1 from public.customers where id = p_customer and workspace_id = p_workspace
  ) then
    raise exception 'Customer not found';
  end if;

  insert into public.orders (workspace_id, customer_id, status, channel, discount, shipping, notes, shipping_address, created_by,
                             paid_at, fulfilled_at, delivered_at)
  values (p_workspace, p_customer, p_status, coalesce(p_channel, 'manual'), coalesce(p_discount, 0), coalesce(p_shipping, 0),
          coalesce(p_notes, ''), p_shipping_address, auth.uid(),
          case when p_status in ('paid', 'fulfilled', 'delivered') then now() end,
          case when p_status in ('fulfilled', 'delivered') then now() end,
          case when p_status = 'delivered' then now() end)
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_qty <= 0 then
      raise exception 'Quantity must be at least 1';
    end if;

    if v_item ? 'product_id' and nullif(v_item ->> 'product_id', '') is not null then
      select * into v_product from public.products
        where id = (v_item ->> 'product_id')::uuid and workspace_id = p_workspace
        for update;
      if not found then
        raise exception 'Product not found';
      end if;
      if v_product.track_inventory and v_product.stock_quantity < v_qty then
        raise exception 'Not enough stock for "%" (% left)', v_product.title, v_product.stock_quantity;
      end if;

      v_price := coalesce((v_item ->> 'unit_price')::numeric, v_product.price);
      insert into public.order_items (workspace_id, order_id, product_id, title, sku, quantity, unit_price, total)
      values (p_workspace, v_order, v_product.id, v_product.title, v_product.sku, v_qty, v_price, v_price * v_qty);

      if v_product.track_inventory then
        insert into public.inventory_movements (workspace_id, product_id, delta, reason, reference_type, reference_id, created_by)
        values (p_workspace, v_product.id, -v_qty, 'order', 'order', v_order, auth.uid());
      end if;
    else
      v_title := nullif(trim(v_item ->> 'title'), '');
      v_price := (v_item ->> 'unit_price')::numeric;
      if v_title is null or v_price is null or v_price < 0 then
        raise exception 'Custom line items need a title and price';
      end if;
      insert into public.order_items (workspace_id, order_id, title, quantity, unit_price, total)
      values (p_workspace, v_order, v_title, v_qty, v_price, v_price * v_qty);
    end if;

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  update public.orders
    set subtotal = v_subtotal,
        total = greatest(v_subtotal - coalesce(p_discount, 0), 0) + coalesce(p_shipping, 0)
    where id = v_order;

  insert into public.audit_events (workspace_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  values (p_workspace, 'user', auth.uid(), 'order.created', 'order', v_order,
          jsonb_build_object('status', p_status, 'items', jsonb_array_length(p_items)));

  return v_order;
end;
$$;

-- ─── set_order_status: validated transitions + restocking ───────────────────
create or replace function public.set_order_status(
  p_order uuid,
  p_status public.order_status,
  p_restock boolean default true,
  p_refund_amount numeric default null,
  p_note text default null
)
returns public.order_status
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_allowed public.order_status[];
  v_reason public.inventory_reason;
  r record;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found or not public.is_workspace_member(v_order.workspace_id) then
    raise exception 'Order not found';
  end if;
  if v_order.status = p_status then
    return p_status;
  end if;

  v_allowed := case v_order.status
    when 'pending'   then array['paid', 'fulfilled', 'cancelled']::public.order_status[]
    when 'paid'      then array['fulfilled', 'delivered', 'cancelled', 'refunded']::public.order_status[]
    when 'fulfilled' then array['delivered', 'refunded']::public.order_status[]
    when 'delivered' then array['refunded']::public.order_status[]
    else array[]::public.order_status[]
  end;

  if not (p_status = any (v_allowed)) then
    raise exception 'Cannot move an order from % to %', v_order.status, p_status;
  end if;

  update public.orders set
    status = p_status,
    paid_at = case when p_status in ('paid', 'fulfilled', 'delivered') then coalesce(paid_at, now()) else paid_at end,
    fulfilled_at = case when p_status in ('fulfilled', 'delivered') then coalesce(fulfilled_at, now()) else fulfilled_at end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
    refunded_at = case when p_status = 'refunded' then now() else refunded_at end,
    refunded_amount = case when p_status = 'refunded'
                           then least(coalesce(p_refund_amount, total), total)
                           else refunded_amount end
  where id = p_order;

  -- Return items to stock on cancellation (always) or refund (when requested).
  if p_status = 'cancelled' or (p_status = 'refunded' and p_restock) then
    v_reason := case when p_status = 'cancelled' then 'cancellation' else 'return' end;
    for r in
      select oi.product_id, sum(oi.quantity)::integer as qty
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = p_order and p.track_inventory
      group by oi.product_id
    loop
      insert into public.inventory_movements (workspace_id, product_id, delta, reason, reference_type, reference_id, created_by)
      values (v_order.workspace_id, r.product_id, r.qty, v_reason, 'order', p_order, auth.uid());
    end loop;
  end if;

  insert into public.audit_events (workspace_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  values (v_order.workspace_id, 'user', auth.uid(), 'order.status_changed', 'order', p_order,
          jsonb_build_object('from', v_order.status, 'to', p_status, 'note', p_note,
                             'restock', p_restock, 'refund_amount', p_refund_amount));

  return p_status;
end;
$$;

-- ─── Read models ────────────────────────────────────────────────────────────
create or replace view public.customer_stats
with (security_invoker = true)
as
select
  c.id as customer_id,
  c.workspace_id,
  count(o.id) filter (where o.status not in ('cancelled')) as orders_count,
  coalesce(sum(o.total - o.refunded_amount) filter (where o.status in ('paid', 'fulfilled', 'delivered', 'refunded')), 0) as total_spent,
  max(o.created_at) as last_order_at
from public.customers c
left join public.orders o on o.customer_id = c.id
group by c.id, c.workspace_id;
