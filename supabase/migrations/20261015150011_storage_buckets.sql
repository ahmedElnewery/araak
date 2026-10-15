-- T036 private buckets. tenant-logos is read/written only by server-side service-role code (no client policy).
-- tenant-private is readable by an active staff member of the tenant named by the first path segment.
-- Per-permission rules for tenant-private objects arrive with the modules that store files there.

insert into storage.buckets (id, name, public) values ('tenant-logos', 'tenant-logos', false), ('tenant-private', 'tenant-private', false)
on conflict (id) do update set public = false;

create policy tenant_private_select on storage.objects for select to authenticated
  using (bucket_id = 'tenant-private'
    and (storage.foldername(name))[1] = ((select private.current_tenant_id()))::text
    and (select private.request_context_ok()));
