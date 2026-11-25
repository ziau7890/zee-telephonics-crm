-- Zee Telephonics CRM: services, contacts, leads, activity (notes and calls), follow-ups,
-- and website lead intake.
-- Access follows each user's permission scope: 'all' records, records owned by their
-- team, or only their own. Records with no owner (new website enquiries) need 'all'.

create type public.lead_status as enum ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost');
create type public.lead_priority as enum ('low', 'medium', 'high');
create type public.activity_kind as enum ('created', 'note', 'call', 'email', 'meeting', 'whatsapp', 'status_change', 'assignment');
create type public.call_outcome as enum (
  'connected', 'interested', 'not_interested', 'callback_requested', 'meeting_booked',
  'no_answer', 'voicemail', 'busy', 'wrong_number', 'do_not_call');
create type public.follow_up_kind as enum ('call', 'email', 'meeting', 'whatsapp', 'other');
create type public.follow_up_status as enum ('open', 'done', 'cancelled');

-- ---------------------------------------------------------------------------
-- Services offered (matches the website's service slugs; editable in Settings)
-- ---------------------------------------------------------------------------
create table public.services (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) between 2 and 120),
  active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contacts: the people and companies Zee talks to
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text check (email is null or email = lower(email)),
  phone text,
  company text,
  job_title text,
  notes text,
  source text not null default 'manual' check (source in ('website', 'manual', 'referral', 'phone', 'email', 'event', 'other')),
  owner_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contacts_email_unique on public.contacts (email) where email is not null;
create index contacts_owner_idx on public.contacts (owner_id);
create index contacts_created_idx on public.contacts (created_at desc);
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Leads: one enquiry or sales opportunity, linked to a contact
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts (id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text check (email is null or email = lower(email)),
  phone text,
  company text,
  service_interest text,              -- a service slug; unknown slugs are kept as given
  team_size text,
  message text,
  status public.lead_status not null default 'new',
  priority public.lead_priority not null default 'medium',
  owner_id uuid references public.profiles (id) on delete set null,
  lost_reason text,
  -- where it came from: only what the website or the person entering it provided
  source text not null default 'manual' check (source in ('website', 'manual', 'referral', 'phone', 'email', 'event', 'other')),
  source_page text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  consent_text text,
  consent_at timestamptz,
  won_at timestamptz,
  closed_at timestamptz,               -- set when the lead becomes won or lost
  last_activity_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_status_idx on public.leads (status);
create index leads_owner_idx on public.leads (owner_id);
create index leads_contact_idx on public.leads (contact_id);
create index leads_created_idx on public.leads (created_at desc);
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- won_at / closed_at follow the status so reports never depend on someone remembering.
create or replace function public.lead_status_dates()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.won_at := case when new.status = 'won' then coalesce(case when tg_op = 'UPDATE' then old.won_at end, now()) end;
    new.closed_at := case when new.status in ('won', 'lost') then now() end;
    if new.status <> 'lost' then new.lost_reason := null; end if;
  end if;
  return new;
end;
$$;
create trigger leads_status_dates before insert or update on public.leads
  for each row execute function public.lead_status_dates();

-- ---------------------------------------------------------------------------
-- Lead activity: notes, logged calls with outcomes, and automatic history.
-- Entries are never edited, so the history can be trusted.
-- ---------------------------------------------------------------------------
create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  kind public.activity_kind not null,
  body text check (body is null or length(body) <= 4000),
  call_outcome public.call_outcome,
  call_seconds int check (call_seconds is null or call_seconds between 0 and 86400),
  meta jsonb,
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint lead_activities_call_fields check (kind = 'call' or (call_outcome is null and call_seconds is null))
);
create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);
create index lead_activities_time_idx on public.lead_activities (created_at desc);

create or replace function public.touch_lead_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.leads set last_activity_at = new.created_at where id = new.lead_id and last_activity_at < new.created_at;
  return new;
end;
$$;
create trigger lead_activities_touch after insert on public.lead_activities
  for each row execute function public.touch_lead_activity();

-- Record creation, status changes and reassignment automatically.
create or replace function public.log_lead_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (lead_id, kind, meta, author_id)
    values (new.id, 'created', jsonb_build_object('source', new.source), auth.uid());
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.lead_activities (lead_id, kind, meta, author_id)
    values (new.id, 'status_change', jsonb_build_object('from', old.status, 'to', new.status, 'lost_reason', new.lost_reason), auth.uid());
  end if;
  if new.owner_id is distinct from old.owner_id then
    insert into public.lead_activities (lead_id, kind, meta, author_id)
    values (new.id, 'assignment', jsonb_build_object('from', old.owner_id, 'to', new.owner_id), auth.uid());
  end if;
  return new;
end;
$$;
create trigger leads_log_changes after insert or update on public.leads
  for each row execute function public.log_lead_changes();

-- ---------------------------------------------------------------------------
-- Follow-ups: dated next steps on a lead or a contact, assigned to a person
-- ---------------------------------------------------------------------------
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  kind public.follow_up_kind not null default 'call',
  due_at timestamptz not null,
  assigned_to uuid references public.profiles (id) on delete set null,
  status public.follow_up_status not null default 'open',
  notes text check (notes is null or length(notes) <= 2000),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_ups_has_parent check (lead_id is not null or contact_id is not null)
);
create index follow_ups_assignee_due_idx on public.follow_ups (assigned_to, status, due_at);
create index follow_ups_lead_idx on public.follow_ups (lead_id);
create index follow_ups_contact_idx on public.follow_ups (contact_id);
create trigger follow_ups_updated_at before update on public.follow_ups
  for each row execute function public.set_updated_at();

create or replace function public.follow_up_completion()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status <> 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;
create trigger follow_ups_completion before insert or update on public.follow_ups
  for each row execute function public.follow_up_completion();

-- ---------------------------------------------------------------------------
-- Website intake. The website server calls create_website_lead with the service
-- role; the public never touches these tables directly.
-- ---------------------------------------------------------------------------
create table public.website_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ip_hash text not null,
  user_agent text,
  payload jsonb not null,
  lead_id uuid references public.leads (id) on delete set null,
  outcome text not null default 'accepted' check (outcome in ('accepted', 'rate_limited'))
);
create index website_submissions_ip_time_idx on public.website_submissions (ip_hash, created_at desc);

-- Contract agreed with the website (api/lead.ts):
--   p_payload keys: full_name, company, email, phone, service (slug), team_size, message,
--   consent (boolean), consent_text, source_page, utm_source, utm_medium, utm_campaign,
--   utm_term, utm_content. Blank values arrive as empty strings.
--   Returns {"status": "ok", "lead_id": ...} or {"status": "rate_limited"}.
create or replace function public.create_website_lead(
  p_payload jsonb,
  p_ip_hash text,
  p_user_agent text,
  p_rate_limit int default 5
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_recent int;
  v_lead_id uuid;
  v_contact_id uuid;
  v_name text := left(btrim(coalesce(p_payload ->> 'full_name', '')), 120);
  v_email text := lower(btrim(coalesce(p_payload ->> 'email', '')));
  v_phone text := nullif(left(btrim(coalesce(p_payload ->> 'phone', '')), 40), '');
  v_company text := nullif(left(btrim(coalesce(p_payload ->> 'company', '')), 160), '');
  v_consent boolean := coalesce(p_payload ->> 'consent', '') in ('true', 'yes', '1');
begin
  if coalesce(p_ip_hash, '') = '' then
    raise exception 'ip hash is required';
  end if;
  select count(*) into v_recent from public.website_submissions
   where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if v_recent >= p_rate_limit then
    insert into public.website_submissions (ip_hash, user_agent, payload, outcome)
    values (p_ip_hash, left(p_user_agent, 255), jsonb_build_object('rate_limited', true), 'rate_limited');
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- The website validates first; these checks stop anything malformed reaching the CRM.
  if length(v_name) < 2 then raise exception 'full_name is required'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'a valid email is required'; end if;

  -- Link to an existing contact with the same email, filling only blanks; otherwise create one.
  select id into v_contact_id from public.contacts where email = v_email;
  if v_contact_id is null then
    insert into public.contacts (full_name, email, phone, company, source)
    values (v_name, v_email, v_phone, v_company, 'website')
    returning id into v_contact_id;
  else
    update public.contacts
       set phone = coalesce(phone, v_phone), company = coalesce(company, v_company)
     where id = v_contact_id;
  end if;

  insert into public.leads (
    contact_id, full_name, email, phone, company, service_interest, team_size, message, source,
    source_page, utm_source, utm_medium, utm_campaign, utm_term, utm_content, consent_text, consent_at
  ) values (
    v_contact_id, v_name, v_email, v_phone, v_company,
    nullif(left(btrim(coalesce(p_payload ->> 'service', '')), 80), ''),
    nullif(left(btrim(coalesce(p_payload ->> 'team_size', '')), 40), ''),
    nullif(left(coalesce(p_payload ->> 'message', ''), 4000), ''),
    'website',
    nullif(left(coalesce(p_payload ->> 'source_page', ''), 255), ''),
    nullif(left(coalesce(p_payload ->> 'utm_source', ''), 120), ''),
    nullif(left(coalesce(p_payload ->> 'utm_medium', ''), 120), ''),
    nullif(left(coalesce(p_payload ->> 'utm_campaign', ''), 120), ''),
    nullif(left(coalesce(p_payload ->> 'utm_term', ''), 120), ''),
    nullif(left(coalesce(p_payload ->> 'utm_content', ''), 120), ''),
    case when v_consent then nullif(left(coalesce(p_payload ->> 'consent_text', ''), 300), '') end,
    case when v_consent then now() end
  ) returning id into v_lead_id;

  insert into public.website_submissions (ip_hash, user_agent, payload, lead_id)
  values (p_ip_hash, left(p_user_agent, 255), p_payload, v_lead_id);

  return jsonb_build_object('status', 'ok', 'lead_id', v_lead_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.services enable row level security;
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.follow_ups enable row level security;
alter table public.website_submissions enable row level security;
-- website_submissions has no policies: service role only.

create policy services_read on public.services for select using (public.is_active_user());
create policy services_write on public.services for all
  using (public.has_permission('settings', 'edit')) with check (public.has_permission('settings', 'edit'));

create policy contacts_read on public.contacts for select
  using (public.can_access_owned('contacts', 'view', owner_id));
create policy contacts_insert on public.contacts for insert
  with check (public.can_access_owned('contacts', 'create', owner_id));
create policy contacts_update on public.contacts for update
  using (public.can_access_owned('contacts', 'edit', owner_id))
  with check (public.can_access_owned('contacts', 'edit', owner_id));
create policy contacts_delete on public.contacts for delete
  using (public.can_access_owned('contacts', 'delete', owner_id));

create policy leads_read on public.leads for select
  using (public.can_access_owned('leads', 'view', owner_id));
create policy leads_insert on public.leads for insert
  with check (public.can_access_owned('leads', 'create', owner_id));
create policy leads_update on public.leads for update
  using (public.can_access_owned('leads', 'edit', owner_id))
  with check (public.can_access_owned('leads', 'edit', owner_id));
create policy leads_delete on public.leads for delete
  using (public.can_access_owned('leads', 'delete', owner_id));

-- Activity is visible with its lead (the subquery applies the leads policy).
create policy lead_activities_read on public.lead_activities for select
  using (exists (select 1 from public.leads l where l.id = lead_id));
create policy lead_activities_insert on public.lead_activities for insert
  with check (
    author_id = auth.uid()
    and kind in ('note', 'call', 'email', 'meeting', 'whatsapp')
    and exists (select 1 from public.leads l where l.id = lead_id and public.can_access_owned('leads', 'edit', l.owner_id)));
-- No update policy: history is never edited. No delete policy: removed only with its lead.

create policy follow_ups_read on public.follow_ups for select
  using (public.can_access_owned('follow_ups', 'view', assigned_to)
         or (created_by = auth.uid() and public.has_permission('follow_ups', 'view')));
create policy follow_ups_insert on public.follow_ups for insert
  with check (
    public.can_access_owned('follow_ups', 'create', assigned_to)
    and (lead_id is null or exists (select 1 from public.leads l where l.id = lead_id))
    and (contact_id is null or exists (select 1 from public.contacts c where c.id = contact_id)));
create policy follow_ups_update on public.follow_ups for update
  using (public.can_access_owned('follow_ups', 'edit', assigned_to))
  with check (public.can_access_owned('follow_ups', 'edit', assigned_to));
create policy follow_ups_delete on public.follow_ups for delete
  using (public.can_access_owned('follow_ups', 'delete', assigned_to));

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.lead_status_dates() from public;
revoke execute on function public.touch_lead_activity() from public;
revoke execute on function public.log_lead_changes() from public;
revoke execute on function public.follow_up_completion() from public;
revoke execute on function public.create_website_lead(jsonb, text, text, int) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.lead_status_dates() from anon, authenticated';
    execute 'revoke execute on function public.touch_lead_activity() from anon, authenticated';
    execute 'revoke execute on function public.log_lead_changes() from anon, authenticated';
    execute 'revoke execute on function public.follow_up_completion() from anon, authenticated';
    execute 'revoke execute on function public.create_website_lead(jsonb, text, text, int) from anon, authenticated';
    execute 'grant execute on function public.create_website_lead(jsonb, text, text, int) to service_role';
  end if;
end $$;
