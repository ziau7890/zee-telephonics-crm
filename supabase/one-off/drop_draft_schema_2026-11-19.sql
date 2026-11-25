-- One-off cleanup, run once on the zee-telephonics-crm Supabase project on 2026-11-24
-- with the owner's approval, before the migrations in supabase/migrations.
-- It removes an earlier, unused draft schema (created 2026-11-19; 0 rows, 0 users at the time).
-- Not a migration: a fresh Supabase project does not need it.
-- Refuses to run if any draft table holds data.
do $$
declare n bigint := 0; t text;
begin
  foreach t in array array['profiles','clients','campaigns','leads','calls','follow_ups','job_applications'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then raise exception 'public.% has % rows; not dropping anything', t, n; end if;
    end if;
  end loop;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.calls, public.follow_ups, public.leads, public.campaigns, public.clients,
  public.job_applications, public.profiles cascade;
drop function if exists public.apply_call_to_lead cascade;
drop function if exists public.guard_profile_update cascade;
drop function if exists public.handle_new_user cascade;
drop function if exists public.submit_job_application cascade;
drop function if exists public.submit_website_lead cascade;
drop function if exists public.touch_updated_at cascade;
drop schema if exists private cascade;
drop type if exists public.user_role, public.lead_status, public.call_disposition, public.campaign_type,
  public.record_status, public.application_status cascade;
