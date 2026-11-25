-- The public (anon) role never needs CRM data: staff are always signed in, and the
-- website sends enquiries with the server-only service role key. Supabase grants anon
-- table and function access by default, so take it away entirely. Row-level security
-- already returned nothing to anon; this closes the permission helpers too (the
-- Supabase security advisor flagged them as callable without signing in).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- PostgreSQL also lets everyone (PUBLIC) execute new functions, so revoking from anon
-- alone is not enough. Close the permission helpers to PUBLIC and grant them only to
-- signed-in staff and the server. set_updated_at is only ever fired by triggers.
revoke execute on function public.is_active_user(uuid) from public;
revoke execute on function public.has_permission(text, public.permission_action, uuid) from public;
revoke execute on function public.permission_scope(text, public.permission_action, uuid) from public;
revoke execute on function public.shares_team(uuid, uuid) from public;
revoke execute on function public.can_access_owned(text, public.permission_action, uuid, uuid) from public;
revoke execute on function public.set_updated_at() from public;
grant execute on function public.is_active_user(uuid) to authenticated, service_role;
grant execute on function public.has_permission(text, public.permission_action, uuid) to authenticated, service_role;
grant execute on function public.permission_scope(text, public.permission_action, uuid) to authenticated, service_role;
grant execute on function public.shares_team(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_access_owned(text, public.permission_action, uuid, uuid) to authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.set_updated_at() from authenticated';
  end if;
end $$;
