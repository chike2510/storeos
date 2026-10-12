-- StoreOS v1 — Row Level Security.
-- Rule: a user can only touch rows whose workspace_id belongs to a workspace
-- they are a member of. Destructive / configuration actions need owner or admin.

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.policies enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ai_decisions enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_events enable row level security;

-- ─── Profiles ───────────────────────────────────────────────────────────────
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ─── Workspaces ─────────────────────────────────────────────────────────────
-- Creation goes through create_workspace() (security definer), so no insert policy.
create policy workspaces_select_member on public.workspaces
  for select using (public.is_workspace_member(id));
create policy workspaces_update_admin on public.workspaces
  for update using (public.has_workspace_role(id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_workspace_role(id, array['owner', 'admin']::public.member_role[]));
create policy workspaces_delete_owner on public.workspaces
  for delete using (public.has_workspace_role(id, array['owner']::public.member_role[]));

-- ─── Members ────────────────────────────────────────────────────────────────
create policy members_select on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));
-- Admins manage staff/admin rows; only owners may grant or touch owner rows.
create policy members_insert_admin on public.workspace_members
  for insert with check (
    public.has_workspace_role(workspace_id, array['owner']::public.member_role[])
    or (role <> 'owner' and public.has_workspace_role(workspace_id, array['admin']::public.member_role[]))
  );
create policy members_update_admin on public.workspace_members
  for update using (
    public.has_workspace_role(workspace_id, array['owner']::public.member_role[])
    or (role <> 'owner' and public.has_workspace_role(workspace_id, array['admin']::public.member_role[]))
  ) with check (
    public.has_workspace_role(workspace_id, array['owner']::public.member_role[])
    or (role <> 'owner' and public.has_workspace_role(workspace_id, array['admin']::public.member_role[]))
  );
create policy members_delete on public.workspace_members
  for delete using (
    user_id = auth.uid() and role <> 'owner'  -- leave a workspace
    or public.has_workspace_role(workspace_id, array['owner']::public.member_role[]) and user_id <> auth.uid()
    or (role = 'staff' and public.has_workspace_role(workspace_id, array['admin']::public.member_role[]))
  );

-- ─── Invitations ────────────────────────────────────────────────────────────
create policy invitations_select on public.workspace_invitations
  for select using (public.is_workspace_member(workspace_id));
create policy invitations_write_admin on public.workspace_invitations
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]));

-- ─── Policies (automation thresholds) ───────────────────────────────────────
create policy policies_select on public.policies
  for select using (public.is_workspace_member(workspace_id));
create policy policies_update_admin on public.policies
  for update using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]));
create policy policies_insert_admin on public.policies
  for insert with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]));

-- ─── Standard tenant tables: members read/write, admins delete ─────────────
do $$
declare
  t text;
begin
  foreach t in array array['products', 'product_variants', 'customers', 'orders', 'order_items', 'conversations', 'messages']
  loop
    execute format('create policy %I on public.%I for select using (public.is_workspace_member(workspace_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.is_workspace_member(workspace_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.has_workspace_role(workspace_id, array[''owner'',''admin'']::public.member_role[]))', t || '_delete', t);
  end loop;
end $$;

-- ─── Ledger-style tables: members read + insert, nobody updates/deletes ────
create policy inventory_movements_select on public.inventory_movements
  for select using (public.is_workspace_member(workspace_id));
create policy inventory_movements_insert on public.inventory_movements
  for insert with check (public.is_workspace_member(workspace_id));

create policy audit_events_select on public.audit_events
  for select using (public.is_workspace_member(workspace_id));
create policy audit_events_insert on public.audit_events
  for insert with check (
    public.is_workspace_member(workspace_id)
    and (actor_id is null or actor_id = auth.uid())
  );

-- ─── AI decisions & approvals ───────────────────────────────────────────────
create policy ai_decisions_select on public.ai_decisions
  for select using (public.is_workspace_member(workspace_id));
create policy ai_decisions_insert on public.ai_decisions
  for insert with check (public.is_workspace_member(workspace_id));
create policy ai_decisions_update_admin on public.ai_decisions
  for update using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]));

create policy approvals_select on public.approvals
  for select using (public.is_workspace_member(workspace_id));
create policy approvals_insert on public.approvals
  for insert with check (public.is_workspace_member(workspace_id) and status = 'pending');
create policy approvals_update_admin on public.approvals
  for update using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.member_role[]));

-- ─── Grants (Supabase roles) ────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.customer_stats to authenticated;
revoke all on all tables in schema public from anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.handle_new_user() from authenticated, anon;
