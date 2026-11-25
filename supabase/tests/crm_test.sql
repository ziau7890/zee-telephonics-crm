-- Permission, row-level security and website intake checks. Run with supabase/tests/run.sh.
-- Each assertion raises an exception on failure. Test data only exists in a throwaway database.

-- Staff: one per role, a second agent in the same team, an agent in no team, and a deactivated admin.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'super@zt.test'),
  ('00000000-0000-0000-0000-000000000002', 'admin@zt.test'),
  ('00000000-0000-0000-0000-000000000003', 'manager@zt.test'),
  ('00000000-0000-0000-0000-000000000004', 'leader@zt.test'),
  ('00000000-0000-0000-0000-000000000005', 'agent1@zt.test'),
  ('00000000-0000-0000-0000-000000000006', 'agent2@zt.test'),
  ('00000000-0000-0000-0000-000000000007', 'agent3@zt.test'),
  ('00000000-0000-0000-0000-000000000008', 'former@zt.test');
update public.profiles set status = 'active';
update public.profiles set status = 'deactivated' where email = 'former@zt.test';
insert into public.user_roles (user_id, role_id)
select u.id, r.id from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'super_admin'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'admin'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'manager'),
  ('00000000-0000-0000-0000-000000000004'::uuid, 'team_leader'),
  ('00000000-0000-0000-0000-000000000005'::uuid, 'agent'),
  ('00000000-0000-0000-0000-000000000006'::uuid, 'agent'),
  ('00000000-0000-0000-0000-000000000007'::uuid, 'agent'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'admin')) as u(id, rk)
join public.roles r on r.key = u.rk;
insert into public.teams (id, name, lead_id) values ('20000000-0000-0000-0000-000000000001', 'Team A', '00000000-0000-0000-0000-000000000004');
insert into public.team_members (team_id, user_id) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006');

insert into public.leads (id, full_name, email, source, owner_id) values
  ('10000000-0000-0000-0000-000000000001', 'Lead Agent One', 'l1@example.test', 'manual', '00000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000002', 'Lead Agent Two', 'l2@example.test', 'manual', '00000000-0000-0000-0000-000000000006'),
  ('10000000-0000-0000-0000-000000000003', 'Lead Agent Three', 'l3@example.test', 'manual', '00000000-0000-0000-0000-000000000007'),
  ('10000000-0000-0000-0000-000000000004', 'Unassigned Lead', 'l4@example.test', 'website', null);
insert into public.follow_ups (id, lead_id, title, due_at, assigned_to) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Call back', now() + interval '1 day', '00000000-0000-0000-0000-000000000005'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'Send proposal', now() + interval '1 day', '00000000-0000-0000-0000-000000000007');

do $$
begin
  assert (select count(*) from public.profiles) = 8, 'profiles not created by trigger';
  assert public.has_permission('roles', 'manage', '00000000-0000-0000-0000-000000000001'), 'super admin manages roles';
  assert not public.has_permission('roles', 'manage', '00000000-0000-0000-0000-000000000002'), 'admin must not manage roles';
  assert not public.has_permission('users', 'manage', '00000000-0000-0000-0000-000000000002'), 'admin must not assign roles';
  assert public.has_permission('reports', 'export', '00000000-0000-0000-0000-000000000003'), 'manager exports reports';
  assert not public.has_permission('reports', 'view', '00000000-0000-0000-0000-000000000005'), 'agent has no reports';
  assert not public.has_permission('leads', 'delete', '00000000-0000-0000-0000-000000000005'), 'agent cannot delete leads';
  assert not public.has_permission('leads', 'view', '00000000-0000-0000-0000-000000000008'), 'deactivated user has no access';
  assert public.permission_scope('leads', 'view', '00000000-0000-0000-0000-000000000004') = 'team', 'team leader has team scope';
  -- lead history was written automatically
  assert (select count(*) from public.lead_activities where kind = 'created') = 4, 'created activity missing';
end $$;

-- As agent 1: only their own lead and follow-up
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
do $$
begin
  assert (select count(*) from public.leads) = 1, 'agent should only see their own lead';
  assert (select count(*) from public.follow_ups) = 1, 'agent should only see their own follow-up';
  assert (select count(*) from public.lead_activities) = 1, 'agent sees only their lead history';
  assert (select count(*) from public.audit_logs) = 0, 'agent cannot read audit logs';
  assert (select count(*) from public.website_submissions) = 0, 'agent cannot read raw submissions';
  assert (select count(*) from public.profiles) = 8, 'active staff see the directory';

  -- can work their own lead
  update public.leads set status = 'contacted' where id = '10000000-0000-0000-0000-000000000001';
  assert (select status from public.leads where id = '10000000-0000-0000-0000-000000000001') = 'contacted', 'agent could not update own lead';
  insert into public.lead_activities (lead_id, kind, body, call_outcome, call_seconds, author_id)
  values ('10000000-0000-0000-0000-000000000001', 'call', 'Spoke to them', 'interested', 120, auth.uid());

  -- cannot touch other people's leads (RLS hides them, so nothing is updated)
  update public.leads set status = 'lost' where id = '10000000-0000-0000-0000-000000000002';
  -- cannot give their lead away
  begin
    update public.leads set owner_id = '00000000-0000-0000-0000-000000000006' where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'agent reassigned a lead';
  exception when others then
    if sqlerrm = 'agent reassigned a lead' then raise; end if;
  end;
  -- cannot add notes to someone else's lead
  begin
    insert into public.lead_activities (lead_id, kind, body, author_id) values ('10000000-0000-0000-0000-000000000002', 'note', 'x', auth.uid());
    raise exception 'agent wrote to another lead';
  exception when others then
    if sqlerrm = 'agent wrote to another lead' then raise; end if;
  end;
  -- cannot forge automatic history
  begin
    insert into public.lead_activities (lead_id, kind, author_id) values ('10000000-0000-0000-0000-000000000001', 'status_change', auth.uid());
    raise exception 'agent forged history';
  exception when others then
    if sqlerrm = 'agent forged history' then raise; end if;
  end;
  -- new leads they create must be theirs
  begin
    insert into public.leads (full_name, owner_id) values ('Sneaky', '00000000-0000-0000-0000-000000000006');
    raise exception 'agent created a lead for someone else';
  exception when others then
    if sqlerrm = 'agent created a lead for someone else' then raise; end if;
  end;
  insert into public.leads (full_name, owner_id, created_by) values ('My New Lead', auth.uid(), auth.uid());
  -- cannot raise their own access
  begin
    insert into public.user_roles (user_id, role_id) select auth.uid(), id from public.roles where key = 'admin';
    raise exception 'agent gave themself a role';
  exception when others then
    if sqlerrm = 'agent gave themself a role' then raise; end if;
  end;
  begin
    update public.profiles set job_title = 'Director' where id = auth.uid();
    raise exception 'agent changed protected profile fields';
  exception when others then
    if sqlerrm = 'agent changed protected profile fields' then raise; end if;
  end;
  update public.profiles set full_name = 'Agent One' where id = auth.uid();
  -- follow-up completion is stamped by the database
  update public.follow_ups set status = 'done' where id = '30000000-0000-0000-0000-000000000001';
  assert (select completed_by from public.follow_ups where id = '30000000-0000-0000-0000-000000000001') = auth.uid(), 'completion not stamped';
end $$;
reset role;
do $$
begin
  assert (select status from public.leads where id = '10000000-0000-0000-0000-000000000002') = 'new', 'agent changed another agent''s lead';
  assert (select count(*) from public.lead_activities where kind = 'status_change' and lead_id = '10000000-0000-0000-0000-000000000001') = 1, 'status change not logged';
  assert (select last_activity_at > created_at from public.leads where id = '10000000-0000-0000-0000-000000000001'), 'last activity not updated';
end $$;

-- As the team leader: their team's leads, not agent 3's, not unassigned
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
do $$
begin
  assert (select count(*) from public.leads where full_name like 'Lead Agent%') = 2, 'team leader should see team leads only';
  assert not exists (select 1 from public.leads where owner_id is null), 'team leader must not see unassigned leads';
  -- may reassign within the team
  update public.leads set owner_id = '00000000-0000-0000-0000-000000000006' where id = '10000000-0000-0000-0000-000000000001';
  assert (select owner_id from public.leads where id = '10000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-000000000006', 'team reassignment failed';
  -- but not outside it
  begin
    update public.leads set owner_id = '00000000-0000-0000-0000-000000000007' where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'leader assigned outside team';
  exception when others then
    if sqlerrm = 'leader assigned outside team' then raise; end if;
  end;
  assert (select count(*) from public.follow_ups) = 1, 'team leader sees team follow-ups only';
end $$;

-- As the manager: everything, including unassigned website leads
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$
begin
  assert (select count(*) from public.leads) = 5, 'manager sees all leads';
  update public.leads set owner_id = '00000000-0000-0000-0000-000000000007' where id = '10000000-0000-0000-0000-000000000004';
  update public.leads set status = 'won' where id = '10000000-0000-0000-0000-000000000004';
  assert (select won_at is not null and closed_at is not null from public.leads where id = '10000000-0000-0000-0000-000000000004'), 'won dates not set';
  update public.leads set status = 'qualified' where id = '10000000-0000-0000-0000-000000000004';
  assert (select won_at is null and closed_at is null from public.leads where id = '10000000-0000-0000-0000-000000000004'), 'won dates not cleared';
  assert (select count(*) from public.audit_logs) = 0, 'manager cannot read audit logs';
  update public.role_permissions set scope = 'own';  -- RLS: no rows qualify
  assert not exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
                     where r.key = 'manager' and rp.scope = 'own'), 'manager edited permissions';
end $$;

-- As the admin: cannot hand out Super Admin, cannot change permissions
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$
begin
  begin
    insert into public.user_roles (user_id, role_id) select '00000000-0000-0000-0000-000000000005', id from public.roles where key = 'super_admin';
    raise exception 'admin assigned super admin';
  exception when others then
    if sqlerrm = 'admin assigned super admin' then raise; end if;
  end;
  begin
    perform public.set_role_permissions((select id from public.roles where key = 'agent'), '[]'::jsonb);
    raise exception 'admin changed permissions';
  exception when others then
    if sqlerrm = 'admin changed permissions' then raise; end if;
  end;
  -- admin can deactivate an agent
  update public.profiles set status = 'deactivated' where id = '00000000-0000-0000-0000-000000000007';
  assert (select status from public.profiles where id = '00000000-0000-0000-0000-000000000007') = 'deactivated', 'admin could not deactivate';
end $$;

-- As the deactivated agent: nothing
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', false);
do $$
begin
  assert (select count(*) from public.leads) = 0, 'deactivated user must see no leads';
  assert (select count(*) from public.profiles) = 1, 'deactivated user sees only themself';
end $$;

-- As the super admin: last Super Admin is protected
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$
begin
  begin
    delete from public.user_roles where user_id = auth.uid();
    raise exception 'last super admin removed';
  exception when others then
    if sqlerrm = 'last super admin removed' then raise; end if;
  end;
  begin
    update public.profiles set status = 'deactivated' where id = auth.uid();
    raise exception 'super admin deactivated themself';
  exception when others then
    if sqlerrm = 'super admin deactivated themself' then raise; end if;
  end;
  begin
    delete from public.roles where key = 'agent';
    raise exception 'system role deleted';
  exception when others then
    if sqlerrm = 'system role deleted' then raise; end if;
  end;
  perform public.set_role_permissions((select id from public.roles where key = 'agent'),
    '[{"module":"leads","action":"view","scope":"own"},{"module":"nope","action":"view","scope":"all"}]'::jsonb);
  assert (select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.key = 'agent') = 1, 'matrix replace failed';
end $$;
reset role;

-- The website cannot call the intake function directly; only the server (service role) can.
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$
begin
  begin
    perform public.create_website_lead('{}'::jsonb, 'h', 'ua', 5);
    raise exception 'anon called intake';
  exception when others then
    if sqlerrm = 'anon called intake' then raise; end if;
  end;
  assert (select count(*) from public.leads) = 0, 'anon can read leads';
end $$;
reset role;

-- Website intake: the exact payload api/lead.ts sends.
set role service_role;
do $$
declare r jsonb; r2 jsonb; v_lead uuid;
begin
  r := public.create_website_lead(
    '{"full_name":"Test Person","company":"Acme Ltd","email":"Test@Example.test","phone":"+44 20 1234 5678","service":"outbound-calling","team_size":"6 to 20 people","message":"We need an outbound team.","consent":true,"consent_text":"Agreed to be contacted about this enquiry and to the privacy policy.","source_page":"/contact/","utm_source":"google","utm_medium":"cpc","utm_campaign":"launch","utm_term":"","utm_content":""}'::jsonb,
    'hash-1', 'test-agent');
  assert r ->> 'status' = 'ok', 'intake failed';
  v_lead := (r ->> 'lead_id')::uuid;
  assert (select email from public.leads where id = v_lead) = 'test@example.test', 'email not normalised';
  assert (select service_interest from public.leads where id = v_lead) = 'outbound-calling', 'service slug not stored';
  assert (select team_size from public.leads where id = v_lead) = '6 to 20 people', 'team size not stored';
  assert (select utm_campaign from public.leads where id = v_lead) = 'launch', 'utm not stored';
  assert (select utm_term is null from public.leads where id = v_lead), 'blank utm should be null';
  assert (select consent_at is not null from public.leads where id = v_lead), 'consent not stored';
  assert (select source from public.leads where id = v_lead) = 'website', 'source not website';
  assert (select owner_id is null and status = 'new' from public.leads where id = v_lead), 'lead should be new and unassigned';
  assert (select count(*) from public.contacts where email = 'test@example.test') = 1, 'contact not created';
  assert (select lead_id from public.website_submissions where ip_hash = 'hash-1') = v_lead, 'submission not linked';

  -- same person again: same contact, second lead, blanks filled only
  r2 := public.create_website_lead('{"full_name":"Test Person","email":"test@example.test","phone":"","company":"","message":"Second enquiry here","consent":false}'::jsonb, 'hash-1', 'ua');
  assert (select count(*) from public.contacts where email = 'test@example.test') = 1, 'duplicate contact';
  assert (select contact_id from public.leads where id = (r2 ->> 'lead_id')::uuid) = (select contact_id from public.leads where id = v_lead), 'not linked to existing contact';
  assert (select company from public.contacts where email = 'test@example.test') = 'Acme Ltd', 'company overwritten';
  assert (select consent_at is null from public.leads where id = (r2 ->> 'lead_id')::uuid), 'consent recorded without consent';

  -- rate limit: 5 per hour per hashed IP
  perform public.create_website_lead('{"full_name":"A B","email":"a@b.test","message":"hello there"}'::jsonb, 'hash-1', 'ua');
  perform public.create_website_lead('{"full_name":"A B","email":"a@b.test","message":"hello there"}'::jsonb, 'hash-1', 'ua');
  perform public.create_website_lead('{"full_name":"A B","email":"a@b.test","message":"hello there"}'::jsonb, 'hash-1', 'ua');
  assert public.create_website_lead('{"full_name":"A B","email":"a@b.test","message":"hello there"}'::jsonb, 'hash-1', 'ua') ->> 'status' = 'rate_limited', 'rate limit not applied';
  assert public.create_website_lead('{"full_name":"A B","email":"a@b.test","message":"hello there"}'::jsonb, 'hash-2', 'ua') ->> 'status' = 'ok', 'other IPs blocked';

  -- malformed payloads are refused
  begin
    perform public.create_website_lead('{"full_name":"X","email":"not-an-email"}'::jsonb, 'hash-3', 'ua');
    raise exception 'bad payload accepted';
  exception when others then
    if sqlerrm = 'bad payload accepted' then raise; end if;
  end;
end $$;
reset role;

select 'crm_test: all assertions passed' as result;
