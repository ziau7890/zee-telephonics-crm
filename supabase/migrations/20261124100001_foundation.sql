-- Zee Telephonics CRM: foundation.
-- Staff accounts, roles and permissions (RBAC), teams, sign-in history and audit log.
-- Adapted from the Business Care CRM. All timestamps are timestamptz (stored in UTC).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.account_status as enum ('invited', 'active', 'deactivated');
create type public.permission_action as enum ('view', 'create', 'edit', 'delete', 'export', 'manage');
create type public.login_result as enum (
  'success', 'failed_password', 'locked', 'blocked_inactive', 'blocked_domain',
  'otp_sent', 'otp_verified', 'logout', 'password_reset');

-- Keep updated_at current.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff profiles (one per Supabase auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  phone text,
  job_title text,
  timezone text not null default 'Asia/Karachi',
  status public.account_status not null default 'invited',
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_timezone_check check (timezone in (
    'Asia/Karachi', 'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'Europe/London', 'UTC'))
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RBAC: roles x (module, action) permissions with a scope, editable without code
-- ---------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger roles_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action public.permission_action not null,
  unique (module, action)
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  -- all records, records owned by the user's teams, or only the user's own
  scope text not null default 'all' check (scope in ('all', 'team', 'own')),
  primary key (role_id, permission_id)
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index user_roles_role_idx on public.user_roles (role_id);

-- ---------------------------------------------------------------------------
-- Teams (a leader plus members). Team Leaders get team-scoped access.
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 2 and 80),
  description text,
  lead_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index teams_lead_idx on public.teams (lead_id);
create trigger teams_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

-- ---------------------------------------------------------------------------
-- Security records: sign-in history and audit log (written by the server only)
-- ---------------------------------------------------------------------------
create table public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  email text not null,
  result public.login_result not null,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index login_events_email_time_idx on public.login_events (lower(email), created_at desc);
create index login_events_user_idx on public.login_events (user_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_time_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Permission helpers (security definer so RLS policies can call them)
-- ---------------------------------------------------------------------------
create or replace function public.is_active_user(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.status = 'active');
$$;

create or replace function public.has_permission(p_module text, p_action public.permission_action, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user(uid) and exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions pm on pm.id = rp.permission_id
    where ur.user_id = uid
      and pm.module = p_module
      and (pm.action = p_action or pm.action = 'manage')
  );
$$;

create or replace function public.my_permissions()
returns table (module text, action public.permission_action, scope text)
language sql stable security definer set search_path = public as $$
  select pm.module, pm.action, rp.scope
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions pm on pm.id = rp.permission_id
  where ur.user_id = auth.uid() and public.is_active_user(auth.uid());
$$;

-- Widest scope the user holds for module/action: 'all' > 'team' > 'own', or null.
create or replace function public.permission_scope(p_module text, p_action public.permission_action, uid uuid default auth.uid())
returns text language sql stable security definer set search_path = public as $$
  select rp.scope
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions pm on pm.id = rp.permission_id
  where ur.user_id = uid
    and public.is_active_user(uid)
    and pm.module = p_module
    and (pm.action = p_action or pm.action = 'manage')
  order by case rp.scope when 'all' then 1 when 'team' then 2 else 3 end
  limit 1;
$$;

-- True when target and uid lead or belong to a common team.
create or replace function public.shares_team(target uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  with mine as (
    select t.id from public.teams t where t.lead_id = uid
    union
    select tm.team_id from public.team_members tm where tm.user_id = uid
  )
  select exists (select 1 from mine join public.teams t on t.id = mine.id where t.lead_id = target)
      or exists (select 1 from mine join public.team_members tm on tm.team_id = mine.id where tm.user_id = target);
$$;

-- Applies the user's widest scope for module/action to a record owned by `owner`.
-- Records with no owner are only visible with 'all' scope.
create or replace function public.can_access_owned(p_module text, p_action public.permission_action, owner uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select case public.permission_scope(p_module, p_action, uid)
    when 'all' then true
    when 'team' then owner is not null and (owner = uid or public.shares_team(owner, uid))
    when 'own' then owner is not null and owner = uid
    else false
  end;
$$;

-- Create a profile automatically when an auth user is created (by invitation).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
-- Self-service edits are limited; account status and email need users:edit.
-- Updates made by the server with the service role (no auth.uid()) are trusted.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if auth.uid() = old.id and not public.has_permission('users', 'manage') then
    if new.status is distinct from old.status
       or new.email is distinct from old.email
       or new.job_title is distinct from old.job_title then
      raise exception 'You can only change your name, phone and time zone';
    end if;
  end if;
  if (new.status is distinct from old.status or new.email is distinct from old.email)
     and not public.has_permission('users', 'edit') then
    raise exception 'Changing account status or email needs the users:edit permission';
  end if;
  if auth.uid() = old.id and new.status = 'deactivated' and old.status <> 'deactivated' then
    raise exception 'You cannot deactivate your own account';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Always keep at least one active Super Admin.
create or replace function public.active_super_admin_count(excluding uuid default null)
returns integer language sql stable security definer set search_path = public as $$
  select count(distinct p.id)::int
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  join public.roles r on r.id = ur.role_id
  where r.key = 'super_admin' and p.status = 'active' and (excluding is null or p.id <> excluding);
$$;

create or replace function public.guard_last_super_admin_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.roles where id = old.role_id and key = 'super_admin')
     and exists (select 1 from public.profiles where id = old.user_id and status = 'active')
     and public.active_super_admin_count(old.user_id) = 0 then
    raise exception 'At least one active Super Admin must remain';
  end if;
  return old;
end;
$$;
create trigger user_roles_keep_super_admin before delete on public.user_roles
  for each row execute function public.guard_last_super_admin_role();

create or replace function public.guard_last_super_admin_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'active' and new.status <> 'active'
     and exists (
       select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
       where ur.user_id = old.id and r.key = 'super_admin')
     and public.active_super_admin_count(old.id) = 0 then
    raise exception 'At least one active Super Admin must remain';
  end if;
  return new;
end;
$$;
create trigger profiles_keep_super_admin before update of status on public.profiles
  for each row execute function public.guard_last_super_admin_status();

-- Only someone who can manage users may hand out the Super Admin role.
create or replace function public.guard_super_admin_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and exists (select 1 from public.roles where id = new.role_id and key = 'super_admin')
     and not exists (
       select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
       where ur.user_id = auth.uid() and r.key = 'super_admin') then
    raise exception 'Only a Super Admin can assign the Super Admin role';
  end if;
  return new;
end;
$$;
create trigger user_roles_guard_super_admin before insert on public.user_roles
  for each row execute function public.guard_super_admin_assignment();

-- Built-in roles keep their key and cannot be deleted.
create or replace function public.guard_system_roles()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then raise exception 'System roles cannot be deleted'; end if;
    return old;
  end if;
  if old.is_system and (new.key is distinct from old.key or not new.is_system) then
    raise exception 'System roles keep their key';
  end if;
  return new;
end;
$$;
create trigger roles_guard_system before update or delete on public.roles
  for each row execute function public.guard_system_roles();

-- Nobody can strip Super Admin of its permissions.
create or replace function public.guard_super_admin_grants()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.roles where id = old.role_id and key = 'super_admin') then
    raise exception 'Super Admin permissions are fixed';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger role_permissions_guard_super_admin before update or delete on public.role_permissions
  for each row execute function public.guard_super_admin_grants();

-- Replace a role's grants in one transaction. Runs with the caller's rights.
create or replace function public.set_role_permissions(p_role_id uuid, p_grants jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.has_permission('roles', 'manage') then
    raise exception 'Changing permissions needs the roles:manage permission';
  end if;
  if exists (select 1 from public.roles where id = p_role_id and key = 'super_admin') then
    raise exception 'Super Admin permissions are fixed';
  end if;
  delete from public.role_permissions where role_id = p_role_id;
  insert into public.role_permissions (role_id, permission_id, scope)
  select p_role_id, p.id, g.scope
  from jsonb_to_recordset(coalesce(p_grants, '[]'::jsonb)) as g(module text, action text, scope text)
  join public.permissions p on p.module = g.module and p.action::text = g.action;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security. Server actions check permissions first; RLS is the second guard.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.login_events enable row level security;
alter table public.audit_logs enable row level security;

-- Active staff can see the staff directory (names are needed to assign leads).
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.is_active_user());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_update on public.profiles for update
  using (public.has_permission('users', 'edit')) with check (public.has_permission('users', 'edit'));

create policy roles_read on public.roles for select using (public.is_active_user());
create policy roles_write on public.roles for all
  using (public.has_permission('roles', 'manage')) with check (public.has_permission('roles', 'manage'));
create policy permissions_read on public.permissions for select using (public.is_active_user());
create policy role_permissions_read on public.role_permissions for select using (public.is_active_user());
create policy role_permissions_write on public.role_permissions for all
  using (public.has_permission('roles', 'manage')) with check (public.has_permission('roles', 'manage'));
create policy user_roles_read on public.user_roles for select
  using (user_id = auth.uid() or public.has_permission('users', 'view'));
create policy user_roles_write on public.user_roles for all
  using (public.has_permission('users', 'manage')) with check (public.has_permission('users', 'manage'));

create policy teams_read on public.teams for select using (public.is_active_user());
create policy teams_write on public.teams for all
  using (public.has_permission('teams', 'edit')) with check (public.has_permission('teams', 'edit'));
create policy team_members_read on public.team_members for select using (public.is_active_user());
create policy team_members_write on public.team_members for all
  using (public.has_permission('teams', 'edit')) with check (public.has_permission('teams', 'edit'));

create policy login_events_read on public.login_events for select
  using (user_id = auth.uid() or public.has_permission('audit_logs', 'view'));
create policy audit_logs_read on public.audit_logs for select
  using (public.has_permission('audit_logs', 'view'));
-- No insert/update/delete policies: written by the server (service role) only, never edited.

-- ---------------------------------------------------------------------------
-- Function privileges: triggers never need EXECUTE; helpers stay callable for RLS.
-- ---------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.guard_profile_update() from public;
revoke execute on function public.guard_last_super_admin_role() from public;
revoke execute on function public.guard_last_super_admin_status() from public;
revoke execute on function public.guard_super_admin_assignment() from public;
revoke execute on function public.guard_system_roles() from public;
revoke execute on function public.guard_super_admin_grants() from public;
revoke execute on function public.active_super_admin_count(uuid) from public;
revoke execute on function public.my_permissions() from public;
revoke execute on function public.set_role_permissions(uuid, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.handle_new_user() from anon, authenticated';
    execute 'revoke execute on function public.guard_profile_update() from anon, authenticated';
    execute 'revoke execute on function public.guard_last_super_admin_role() from anon, authenticated';
    execute 'revoke execute on function public.guard_last_super_admin_status() from anon, authenticated';
    execute 'revoke execute on function public.guard_super_admin_assignment() from anon, authenticated';
    execute 'revoke execute on function public.guard_system_roles() from anon, authenticated';
    execute 'revoke execute on function public.guard_super_admin_grants() from anon, authenticated';
    execute 'revoke execute on function public.active_super_admin_count(uuid) from anon';
    execute 'revoke execute on function public.my_permissions() from anon';
    execute 'revoke execute on function public.set_role_permissions(uuid, jsonb) from anon';
    execute 'grant execute on function public.my_permissions() to authenticated';
    execute 'grant execute on function public.set_role_permissions(uuid, jsonb) to authenticated';
  end if;
end $$;
