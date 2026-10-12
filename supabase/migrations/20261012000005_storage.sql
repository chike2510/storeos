-- StoreOS v1 — Storage: product images.
-- Objects live at product-images/<workspace_id>/<file>. The bucket is public-read
-- (so storefront/listing images can be shared); writes require membership of the
-- workspace in the first path segment.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create or replace function public.is_workspace_member_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_first text := split_part(p_name, '/', 1);
begin
  if v_first !~ '^[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  return public.is_workspace_member(v_first::uuid);
end;
$$;

grant execute on function public.is_workspace_member_path(text) to authenticated;

create policy product_images_read on storage.objects
  for select using (bucket_id = 'product-images');

create policy product_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_workspace_member_path(name));

create policy product_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_workspace_member_path(name))
  with check (bucket_id = 'product-images' and public.is_workspace_member_path(name));

create policy product_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_workspace_member_path(name));
