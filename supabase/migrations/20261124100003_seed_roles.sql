-- Zee Telephonics CRM: modules, default roles and their permissions, and the service list.
-- These are starting defaults. A Super Admin can change them in CRM > Roles.

insert into public.permissions (module, action)
select m, a::public.permission_action
from unnest(array[
  'dashboard', 'leads', 'contacts', 'follow_ups', 'reports',
  'teams', 'users', 'roles', 'audit_logs', 'settings'
]) as m
cross join unnest(array['view', 'create', 'edit', 'delete', 'export', 'manage']) as a
on conflict (module, action) do nothing;

insert into public.roles (key, name, description, is_system) values
  ('super_admin', 'Super Admin', 'Full access, including roles and permissions. Cannot be locked out.', true),
  ('admin', 'Admin', 'Runs the CRM day to day: all leads, contacts and follow-ups, staff accounts and settings.', true),
  ('manager', 'Sales Manager', 'All leads, contacts and follow-ups, assigning work to agents, and reports.', true),
  ('team_leader', 'Team Leader', 'Leads, contacts and follow-ups owned by their team, and team reports.', true),
  ('agent', 'Agent', 'Only the leads, contacts and follow-ups assigned to them.', true)
on conflict (key) do nothing;

create or replace function public._seed_grant(p_role text, p_module text, p_actions text[], p_scope text default 'all')
returns void language sql set search_path = public as $$
  insert into public.role_permissions (role_id, permission_id, scope)
  select r.id, p.id, p_scope
  from public.roles r
  join public.permissions p on p.module = p_module and p.action::text = any (p_actions)
  where r.key = p_role
  on conflict (role_id, permission_id) do update set scope = excluded.scope;
$$;

-- Super Admin: manage everything
select public._seed_grant('super_admin', module, array['manage'])
from (select distinct module from public.permissions) m;

-- Admin: everything except changing role permissions and assigning roles
select public._seed_grant('admin', m, array['view', 'create', 'edit', 'delete', 'export'])
from unnest(array['dashboard', 'leads', 'contacts', 'follow_ups', 'reports', 'teams', 'settings']) m;
select public._seed_grant('admin', 'users', array['view', 'create', 'edit']);
select public._seed_grant('admin', 'roles', array['view']);
select public._seed_grant('admin', 'audit_logs', array['view']);

-- Sales Manager: all sales records, reports, teams
select public._seed_grant('manager', m, array['view', 'create', 'edit', 'delete', 'export'])
from unnest(array['leads', 'contacts', 'follow_ups']) m;
select public._seed_grant('manager', m, array['view', 'export']) from unnest(array['reports']) m;
select public._seed_grant('manager', 'teams', array['view', 'edit']);
select public._seed_grant('manager', m, array['view']) from unnest(array['dashboard', 'users', 'settings']) m;

-- Team Leader: their team's records
select public._seed_grant('team_leader', m, array['view', 'create', 'edit'], 'team')
from unnest(array['leads', 'contacts', 'follow_ups']) m;
select public._seed_grant('team_leader', 'reports', array['view'], 'team');
select public._seed_grant('team_leader', m, array['view']) from unnest(array['dashboard', 'teams']) m;

-- Agent: own records only
select public._seed_grant('agent', m, array['view', 'create', 'edit'], 'own')
from unnest(array['leads', 'contacts', 'follow_ups']) m;
select public._seed_grant('agent', 'dashboard', array['view']);

drop function public._seed_grant(text, text, text[], text);

-- Services, matching the website's src/content/services.json (slug = the value the form sends).
-- These are the provisional services; edit them in CRM > Settings.
insert into public.services (slug, title, sort_order) values
  ('inbound-customer-support', 'Inbound Customer Support', 10),
  ('outbound-calling', 'Outbound Calling', 20),
  ('lead-generation', 'Lead Generation', 30),
  ('appointment-setting', 'Appointment Setting', 40),
  ('sales-development-support', 'Sales Development Support', 50),
  ('email-and-live-chat-support', 'Email and Live Chat Support', 60),
  ('virtual-assistance', 'Virtual Assistance', 70),
  ('back-office-and-data-processing', 'Back-Office Support and Data Processing', 80)
on conflict (slug) do nothing;
