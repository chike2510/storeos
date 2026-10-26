-- Supabase stops auto-granting Data API access on new tables in `public` from 30 Oct 2026
-- (https://supabase.com/changelog/45329). Grants for `authenticated` are already explicit in
-- 20261012000004_rls.sql and the Shopify tables are explicit in 20261012000007_shopify.sql.
-- The core tables never granted `service_role` explicitly, so on a fresh project, branch, or
-- `supabase db reset` the server admin client (src/lib/supabase/admin.ts) would hit 42501.
-- This makes that access explicit. RLS policies and existing grants are unchanged.

grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.profiles,
  public.workspaces,
  public.workspace_members,
  public.workspace_invitations,
  public.policies,
  public.products,
  public.product_variants,
  public.inventory_movements,
  public.customers,
  public.orders,
  public.order_items,
  public.conversations,
  public.messages,
  public.ai_decisions,
  public.approvals,
  public.audit_events
to service_role;
grant select on public.customer_stats to service_role;

-- Going forward: every new `create table` in public needs RLS + policies + explicit grants
-- (authenticated and/or service_role) in the same migration.
