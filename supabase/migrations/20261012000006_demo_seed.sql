-- StoreOS v1 — demo workspace data.
-- seed_demo_workspace(workspace_id) fills a workspace with realistic sample
-- data: products (some low on stock), customers, ~60 days of orders, support
-- conversations and one pending approval. Prices scale to the workspace
-- currency. Callable by owners/admins from onboarding or Settings.
-- clear_demo_workspace(workspace_id) removes it again.

create or replace function public.seed_demo_workspace(p_workspace uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_currency text;
  v_mult numeric;
  v_products uuid[] := '{}';
  v_customers uuid[] := '{}';
  v_id uuid;
  v_order uuid;
  v_conv uuid;
  v_msg uuid;
  v_decision uuid;
  v_status public.order_status;
  v_pid uuid;
  v_qty integer;
  v_stock integer;
  v_orders integer := 0;
  i integer;
  j integer;
  p record;
begin
  if not public.has_workspace_role(p_workspace, array['owner', 'admin']::public.member_role[]) then
    raise exception 'Only owners and admins can load demo data';
  end if;
  if exists (select 1 from public.products where workspace_id = p_workspace and 'demo' = any (tags)) then
    raise exception 'Demo data is already loaded in this workspace';
  end if;

  select currency into v_currency from public.workspaces where id = p_workspace;
  v_mult := case v_currency
    when 'NGN' then 1000 when 'KES' then 130 when 'GHS' then 15 when 'ZAR' then 18
    when 'INR' then 85 when 'JPY' then 150 when 'EUR' then 1 when 'GBP' then 1
    else 1 end;

  -- Products: (title, category, base price, stock, threshold, description)
  for p in
    select * from (values
      ('Ankara Wrap Dress',         'Apparel',     45, 40, 5,  'Hand-finished wrap dress in bold Ankara print. Adjustable waist tie, midi length.'),
      ('Adire Silk Scarf',          'Accessories', 18, 60, 10, 'Hand-dyed adire silk scarf. Lightweight, 90 x 90 cm, gift-boxed.'),
      ('Leather Crossbody Bag',     'Bags',        65, 12, 5,  'Full-grain leather crossbody with brass hardware and adjustable strap.'),
      ('Shea Butter Body Cream',    'Beauty',      12, 90, 15, 'Whipped unrefined shea butter with vanilla. 250 ml jar.'),
      ('Beaded Statement Earrings', 'Jewelry',     15, 35, 8,  'Handmade glass-bead drop earrings. Nickel-free hooks.'),
      ('Linen Kaftan',              'Apparel',     55, 22, 5,  'Breathable linen kaftan with embroidered neckline. One size.'),
      ('Black Soap Bar (3-pack)',   'Beauty',       9, 14, 12, 'Traditional African black soap with plantain ash. Three 150 g bars.'),
      ('Woven Raffia Tote',         'Bags',        28, 18, 6,  'Hand-woven raffia tote with leather handles. Roomy enough for a laptop.')
    ) as t(title, category, base_price, stock, threshold, description)
  loop
    insert into public.products (workspace_id, title, category, description, price, low_stock_threshold, sku, tags, status)
    values (p_workspace, p.title, p.category, p.description, round(p.base_price * v_mult, 2), p.threshold,
            'DEMO-' || upper(substr(md5(p.title), 1, 6)), array['demo'], 'active')
    returning id into v_id;
    perform public.adjust_stock(v_id, p.stock, 'initial', 'Demo opening stock');
    v_products := v_products || v_id;
  end loop;

  -- Customers
  for p in
    select * from (values
      ('Adaeze Okafor',   'adaeze@example.com',  '+2348030000001', '@adaeze.styles', 'positive'),
      ('Tunde Bakare',    'tunde@example.com',   '+2348030000002', null,             'neutral'),
      ('Ngozi Eze',       'ngozi@example.com',   '+2348030000003', '@ngozi_e',       'positive'),
      ('Kemi Adeyemi',    'kemi@example.com',    '+2348030000004', '@kemi.a',        'negative'),
      ('Ibrahim Musa',    'ibrahim@example.com', '+2348030000005', null,             'neutral'),
      ('Chioma Nwosu',    'chioma@example.com',  '+2348030000006', '@chioma.n',      'positive')
    ) as t(name, email, phone, ig, sentiment)
  loop
    insert into public.customers (workspace_id, name, email, phone, instagram_handle, sentiment, tags, notes)
    values (p_workspace, p.name, p.email, p.phone, p.ig, p.sentiment, array['demo'], 'Sample customer from the StoreOS demo data.')
    returning id into v_id;
    v_customers := v_customers || v_id;
  end loop;

  -- ~42 orders spread over the last 60 days.
  for i in 1..42 loop
    v_pid := null;
    for j in 0..7 loop
      v_id := v_products[((i * 5 + j) % 8) + 1];
      v_qty := (i % 3) + 1;
      select stock_quantity into v_stock from public.products where id = v_id;
      if v_stock - v_qty >= 2 then
        v_pid := v_id;
        exit;
      end if;
    end loop;
    continue when v_pid is null;

    v_status := case
      when i % 13 = 0 then 'paid'  -- cancelled below
      when i % 11 = 0 then 'pending'
      when i % 7 = 0 then 'paid'
      when i % 5 = 0 then 'fulfilled'
      else 'delivered' end;

    v_order := public.create_order(
      p_workspace,
      v_customers[(i % 6) + 1],
      jsonb_build_array(jsonb_build_object('product_id', v_pid, 'quantity', v_qty)),
      v_status,
      (array['instagram', 'whatsapp', 'website', 'walk_in'])[(i % 4) + 1],
      0,
      round(3 * v_mult, 2),
      'Demo order'
    );

    if i % 13 = 0 then
      perform public.set_order_status(v_order, 'cancelled', true, null, 'Customer changed their mind (demo)');
    end if;

    update public.orders
      set created_at = now() - make_interval(days => (60 - i * 60 / 42), hours => (i * 7) % 24),
          paid_at = case when paid_at is not null then now() - make_interval(days => (60 - i * 60 / 42)) end
      where id = v_order;
    v_orders := v_orders + 1;
  end loop;

  -- Conversations
  -- 1) Resolved, low-risk shipping question (auto-sent AI reply).
  select id into v_order from public.orders
    where workspace_id = p_workspace and customer_id = v_customers[1] order by created_at desc limit 1;
  insert into public.conversations (workspace_id, customer_id, order_id, channel, subject, status, intent, urgency)
  values (p_workspace, v_customers[1], v_order, 'instagram', 'Where is my order?', 'resolved', 'shipping_update', 'low')
  returning id into v_conv;
  insert into public.messages (workspace_id, conversation_id, direction, author_type, body)
  values (p_workspace, v_conv, 'inbound', 'customer', 'Hi! Just checking when my order will arrive? Thanks 😊')
  returning id into v_msg;
  insert into public.ai_decisions (workspace_id, conversation_id, message_id, intent, urgency, confidence, action, risk_level,
                                   requires_approval, draft_reply, reasoning, model, mode, status)
  values (p_workspace, v_conv, v_msg, 'shipping_update', 'low', 0.93, 'info_provided', 'low', false,
          'Hi Adaeze! Your order is on its way and should arrive within 2–3 working days. We will message you the moment it is out for delivery.',
          'Low-risk delivery status question from a customer in good standing.', 'demo-rules', 'demo', 'auto_sent')
  returning id into v_decision;
  insert into public.messages (workspace_id, conversation_id, direction, author_type, body, ai_decision_id)
  values (p_workspace, v_conv, 'outbound', 'ai',
          'Hi Adaeze! Your order is on its way and should arrive within 2–3 working days. We will message you the moment it is out for delivery.',
          v_decision);

  -- 2) High-risk refund request awaiting approval.
  select id into v_order from public.orders
    where workspace_id = p_workspace and customer_id = v_customers[4] and status <> 'cancelled' order by total desc limit 1;
  insert into public.conversations (workspace_id, customer_id, order_id, channel, subject, status, intent, urgency)
  values (p_workspace, v_customers[4], v_order, 'whatsapp', 'Refund request — damaged item', 'awaiting_approval', 'refund_request', 'high')
  returning id into v_conv;
  insert into public.messages (workspace_id, conversation_id, direction, author_type, body)
  values (p_workspace, v_conv, 'inbound', 'customer',
          'The bag I received has a torn strap. This is the second time something has arrived damaged. I want a full refund today.')
  returning id into v_msg;
  insert into public.ai_decisions (workspace_id, conversation_id, message_id, intent, urgency, confidence, action, risk_level,
                                   requires_approval, refund_amount, draft_reply, reasoning, policy_notes, model, mode, status)
  values (p_workspace, v_conv, v_msg, 'refund_request', 'high', 0.96, 'refund', 'high', true,
          (select total from public.orders where id = v_order),
          'Hi Kemi, I am really sorry your bag arrived damaged again — that is not the experience we want for you. I have issued a full refund to your original payment method; you should see it within 3–5 working days.',
          'Customer reports a damaged item and requests a full refund. Repeat issue and negative history.',
          array['Refund exceeds the auto-refund limit', 'Customer has negative sentiment history', 'High urgency'],
          'demo-rules', 'demo', 'pending_approval')
  returning id into v_decision;
  insert into public.approvals (workspace_id, decision_id, conversation_id, status, reason)
  values (p_workspace, v_decision, v_conv, 'pending', 'Refund exceeds the auto-refund limit; customer has negative sentiment history.');

  -- 3) Open product question, not yet triaged.
  insert into public.conversations (workspace_id, customer_id, channel, subject, status)
  values (p_workspace, v_customers[3], 'instagram', 'Kaftan sizing', 'open')
  returning id into v_conv;
  insert into public.messages (workspace_id, conversation_id, direction, author_type, body)
  values (p_workspace, v_conv, 'inbound', 'customer',
          'Hello, does the linen kaftan run large? I am usually a size 12. Also do you deliver to Abuja?');

  insert into public.audit_events (workspace_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  values (p_workspace, 'user', auth.uid(), 'workspace.demo_seeded', 'workspace', p_workspace,
          jsonb_build_object('products', array_length(v_products, 1), 'customers', array_length(v_customers, 1), 'orders', v_orders));

  return jsonb_build_object('products', array_length(v_products, 1), 'customers', array_length(v_customers, 1), 'orders', v_orders);
end;
$$;

create or replace function public.clear_demo_workspace(p_workspace uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.has_workspace_role(p_workspace, array['owner', 'admin']::public.member_role[]) then
    raise exception 'Only owners and admins can clear demo data';
  end if;

  delete from public.conversations
    where workspace_id = p_workspace
      and customer_id in (select id from public.customers where workspace_id = p_workspace and 'demo' = any (tags));
  delete from public.orders
    where workspace_id = p_workspace
      and (notes = 'Demo order'
           or customer_id in (select id from public.customers where workspace_id = p_workspace and 'demo' = any (tags)));
  delete from public.customers where workspace_id = p_workspace and 'demo' = any (tags);
  delete from public.products where workspace_id = p_workspace and 'demo' = any (tags);

  insert into public.audit_events (workspace_id, actor_type, actor_id, action, entity_type, entity_id)
  values (p_workspace, 'user', auth.uid(), 'workspace.demo_cleared', 'workspace', p_workspace);
end;
$$;

grant execute on function public.seed_demo_workspace(uuid) to authenticated;
grant execute on function public.clear_demo_workspace(uuid) to authenticated;
