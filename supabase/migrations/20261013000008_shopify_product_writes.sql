-- StoreOS — two-way Shopify product editing.
--
-- * products.external_updated_at: Shopify's Product.updatedAt as of the last
--   time StoreOS mirrored the product. Used to (a) skip products/update
--   webhooks that echo StoreOS's own writes (payload updated_at <= stored) and
--   (b) stop an older Shopify read from overwriting a newer one.
-- * shopify_upsert_products: same as before, plus the out-of-order guard,
--   external_updated_at, and a per-product advisory lock.
-- * shopify_link_published_product: after "Publish to Shopify" (productSet),
--   turns a StoreOS-native product into a Shopify-sourced one in place
--   (source/external_id + variant external ids) so sync and webhooks update it
--   instead of creating a duplicate. Service role only.

alter table public.products
  add column if not exists external_updated_at timestamptz;

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
  v_ts timestamptz;
begin
  select default_low_stock_threshold into v_threshold from public.policies where workspace_id = p_workspace;
  v_threshold := coalesce(v_threshold, 5);

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    continue when nullif(r ->> 'external_id', '') is null;
    -- Serialise with shopify_link_published_product (and concurrent webhooks) per Shopify product.
    perform pg_advisory_xact_lock(hashtext(p_workspace::text || ':' || (r ->> 'external_id')));
    v_pid := null;
    v_ts := nullif(r ->> 'updated_at', '')::timestamptz;
    v_track := coalesce((r ->> 'track_inventory')::boolean, true);

    insert into public.products (
      workspace_id, source, external_id, title, description, category, sku, status, price, compare_at_price,
      track_inventory, low_stock_threshold, has_variants, image_url, tags, external_updated_at
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
      coalesce(array(select jsonb_array_elements_text(coalesce(r -> 'tags', '[]'::jsonb))), '{}'),
      v_ts
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
      tags = excluded.tags,
      external_updated_at = coalesce(excluded.external_updated_at, public.products.external_updated_at)
    -- Out-of-order guard: never let an older Shopify read overwrite a newer one
    -- (e.g. a slow webhook re-read landing after StoreOS saved its own write).
    where excluded.external_updated_at is null
       or public.products.external_updated_at is null
       or excluded.external_updated_at >= public.products.external_updated_at
    returning id into v_pid;

    -- Skipped as stale: leave variants and stock alone too.
    continue when v_pid is null;

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

-- ─── Link a published StoreOS product to its new Shopify product ───────────
-- p_row: one row in the shopify_upsert_products shape, built from productSet's
-- response. Idempotent: calling it again for the same pair just re-upserts.
create or replace function public.shopify_link_published_product(p_workspace uuid, p_product uuid, p_row jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ext text := nullif(p_row ->> 'external_id', '');
  v_prod public.products%rowtype;
  v jsonb;
  v_dup uuid;
  v_tracked boolean;
begin
  if v_ext is null then
    raise exception 'Missing Shopify product id';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_workspace::text || ':' || v_ext));

  select * into v_prod from public.products where id = p_product and workspace_id = p_workspace for update;
  if not found then
    raise exception 'Product not found';
  end if;
  if v_prod.source = 'shopify' then
    if v_prod.external_id = v_ext then
      perform public.shopify_upsert_products(p_workspace, jsonb_build_array(p_row));
      return p_product;
    end if;
    raise exception 'This product is already linked to a different Shopify product';
  end if;
  if v_prod.source <> 'storeos' then
    raise exception 'Only StoreOS products can be published to Shopify';
  end if;

  -- A products/create webhook may have beaten us and inserted the same
  -- Shopify product as a new row: fold it into this one.
  for v_dup in
    select id from public.products
      where workspace_id = p_workspace and source = 'shopify' and external_id = v_ext and id <> p_product
  loop
    update public.order_items set product_id = p_product where product_id = v_dup;
    delete from public.products where id = v_dup;
  end loop;

  -- StoreOS-native variant rows (none in the v1 UI) are replaced by Shopify's.
  delete from public.product_variants where product_id = p_product and source <> 'shopify';

  update public.products
    set source = 'shopify', external_id = v_ext
    where id = p_product;

  -- Variants start at Shopify's quantity: the product's on-hand already has its
  -- ledger history, so seeding the variant rows directly avoids double counting.
  -- shopify_upsert_products then reconciles the product total if Shopify differs.
  for v in select * from jsonb_array_elements(coalesce(p_row -> 'variants', '[]'::jsonb))
  loop
    continue when nullif(v ->> 'external_id', '') is null;
    v_tracked := coalesce((v ->> 'tracked')::boolean, true);
    insert into public.product_variants (workspace_id, product_id, source, external_id, title, stock_quantity, track_inventory)
    values (
      p_workspace, p_product, 'shopify', v ->> 'external_id', coalesce(nullif(v ->> 'title', ''), 'Default'),
      case when v_tracked then coalesce(nullif(v ->> 'stock', '')::integer, 0) else 0 end,
      v_tracked
    )
    on conflict (workspace_id, source, external_id) where external_id is not null
    do update set product_id = excluded.product_id, stock_quantity = excluded.stock_quantity;
  end loop;

  perform public.shopify_upsert_products(p_workspace, jsonb_build_array(p_row));
  return p_product;
end;
$$;

-- ─── Function privileges: service role only ────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.shopify_upsert_products(uuid, jsonb)',
    'public.shopify_link_published_product(uuid, uuid, jsonb)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
