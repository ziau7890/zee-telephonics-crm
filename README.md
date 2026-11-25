# Zee Telephonics CRM

The private team CRM for Zee Telephonics. Website enquiries arrive here automatically, and staff work them as leads, contacts, logged calls and follow-ups, with roles and permissions and reports.

It follows the Business Care CRM (same structure and security model) in the Zee Telephonics colours: midnight navy, electric cyan and white.

## What's in it

| Page | What it does |
| --- | --- |
| Dashboard | Your follow-ups due today and overdue, open leads, leads waiting for an owner, pipeline, newest leads |
| Leads | Every enquiry. Filter by status, owner and source. Each lead has its message, call and email buttons, a timeline, status, priority, owner and follow-ups |
| Lead timeline | Log a call with its outcome (connected, interested, no answer, voicemail, meeting booked, do not call...) and length, or add a note, email, meeting or WhatsApp entry. Status changes and reassignments are recorded automatically and can't be edited |
| Contacts | People and companies. A website enquiry creates a contact, or links to an existing one with the same email |
| Follow-ups | Dated next steps (call, email, meeting, WhatsApp) on a lead or contact, assigned to a person. Due now, upcoming, done. Overdue ones are flagged |
| Reports | New leads, won, lost, win rate, calls, sources, services, call outcomes, follow-up discipline, a per-person table, and a CSV download |
| Teams | A team leader plus agents. Team Leaders see their team's records |
| Users | Invite staff by email, deactivate or reactivate them, assign roles. See sign-in history |
| Roles | Five built-in roles plus your own custom roles. Edit what each role can do, module by module |
| Audit log | Every important change and every sign-in, filterable |
| Settings | The services list (matches the website's services) |

### Roles

| Role | Can do |
| --- | --- |
| Super Admin | Everything, including roles and permissions. The last Super Admin can't be removed or deactivated |
| Admin | All leads, contacts and follow-ups, reports, teams, settings, invite and deactivate staff. Can't change permissions or hand out roles |
| Sales Manager | All leads, contacts and follow-ups, assigning work, reports and CSV export, teams |
| Team Leader | The leads, contacts and follow-ups owned by their team, team reports |
| Agent | Only the leads, contacts and follow-ups assigned to them |

New website enquiries are unassigned, so only roles with access to all leads (Super Admin, Admin, Sales Manager) see them until someone assigns them.

## How it is built

- **Next.js 15** (runs on Vercel) for the screens.
- **Supabase** for the database (PostgreSQL) and sign-in. Accounts are invite-only. Staff sign in with a password or a 6-digit email code. Five wrong attempts lock the email for 15 minutes.
- **Two layers of security.** Every action checks the person's permissions first, and the database checks again with row-level security. So even a bug in a screen can't show an agent someone else's leads.
- **One database for the website and the CRM.** The website's contact form calls the database function `create_website_lead` with a server-only key. The public can never read or write CRM tables.

## Website integration (agreed contract)

The website (repo `zee-telephonics-website`, file `api/lead.ts`) sends each enquiry to
`POST {SUPABASE_URL}/rest/v1/rpc/create_website_lead` using the service role key, with:

```
p_payload    { full_name, company, email, phone, service, team_size, message, consent, consent_text,
               source_page, utm_source, utm_medium, utm_campaign, utm_term, utm_content }
p_ip_hash    sha256 of the visitor IP plus a salt (never the raw IP)
p_user_agent browser user agent
p_rate_limit 5 (enquiries per hour per IP hash)
```

It returns `{"status":"ok","lead_id":"..."}` or `{"status":"rate_limited"}`. The CRM saves the lead (status New, source Website, unassigned), creates or links the contact, and keeps the raw submission in `website_submissions`. `service` is the website's service slug; the Settings page holds the matching names.

This repository owns all database migrations. The website repository has none.

## Set it up (step by step)

You need: the Supabase project **zee-telephonics-crm** (already created) and the Vercel project **zee-telephonics-crm** (already created, in the Business Care team).

### 1. Database

The migrations in `supabase/migrations` have been applied to the Supabase project. For a new project, open **Supabase > SQL Editor** and run each file in order (`...100001_foundation.sql`, then `...100002_crm.sql`, then `...100003_seed_roles.sql`).

### 2. Supabase sign-in settings

In the Supabase dashboard for **zee-telephonics-crm**:

1. **Authentication > Sign In / Providers > Email**: turn **off** "Allow new users to sign up" (accounts are invite-only). Keep "Confirm email" on.
2. **Authentication > URL Configuration**: set **Site URL** to the CRM address (for now the Vercel address, for example `https://zee-telephonics-crm.vercel.app`). Under **Redirect URLs** add `https://<that address>/crm/auth/callback` and `https://<that address>/crm/auth/confirm`.
3. **Authentication > Emails > Templates**:
   - **Invite user**: change the link to `{{ .SiteURL }}/crm/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
   - **Reset password**: change the link to `{{ .SiteURL }}/crm/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
   - **Magic link**: add `Your sign-in code is {{ .Token }}` so staff get the 6-digit code.
4. Supabase's built-in email is only for testing (a few emails per hour). Before inviting the whole team, connect an email sender under **Authentication > Emails > SMTP Settings**. That is a Phase 3 step; nothing needs to be bought to test with a few people.

### 3. Vercel

1. In Vercel, open the **zee-telephonics-crm** project > **Settings > Git** and connect the GitHub repo **zee-telephonics-crm**.
2. **Settings > Environment Variables**, add (from Supabase > Project Settings > API):
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon / publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` = the service_role / secret key (keep it secret; never put it in the website's browser code)
   - `NEXT_PUBLIC_SITE_URL` = the CRM address from step 2
   - `COMPANY_EMAIL_DOMAINS` = optional, for example `zeetelephonicsbpo.com` once staff have company mailboxes. Leave empty to allow any invited address.
3. Deploy (Deployments > Redeploy, or push to `main`).

### 4. Create the first Super Admin

1. Supabase > **Authentication > Users > Invite user**, enter your email.
2. Open the invitation email and click the link. Set your name and password on the **Activate** page.
3. Supabase > **SQL Editor**, run (with your email):

```sql
insert into public.user_roles (user_id, role_id)
select p.id, r.id from public.profiles p, public.roles r
where p.email = 'you@example.com' and r.key = 'super_admin';
```

4. Sign in at `/crm/login`. From now on, invite everyone else from **CRM > Users**.

### 5. Connect the website

On the Vercel project **zee-telephonics-website**, add `SUPABASE_SERVICE_ROLE_KEY` (same value as above). `SUPABASE_URL` is already set there. Send a test enquiry from the website's contact page and check it appears in **CRM > Leads**.

## Run it on your computer (optional)

```bash
npm install
cp .env.example .env.local   # fill in the values from Supabase
npm run dev                  # http://localhost:3000/crm
```

## Tests

```bash
npm run lint && npm run typecheck && npm test   # unit tests
npm run test:db                                 # database + security tests, needs a local PostgreSQL (PGHOST, PGUSER, PGPASSWORD)
npm run build
```

`supabase/tests/crm_test.sql` loads every migration into a throwaway database and checks the permission rules for each role (agents only see their own records, team leaders only their team's, admins can't hand out Super Admin, the last Super Admin is protected, history can't be forged), and the website intake (exact payload, contact linking, consent, rate limit, malformed input refused, and that the public can't call it).

## Security notes

- The service role key is only used on the server, for activating invited accounts, sending invitations and writing security logs.
- Every page is `noindex`, `robots.txt` blocks everything, and CRM pages are never cached.
- Deactivated staff are signed out on their next request and see nothing, even with a valid session.
- Deleting a lead or contact keeps a copy of its details in the audit log.

## Not built yet

These were not part of this phase: email sending from inside the CRM, calendar sync, file attachments, client accounts and campaigns, invoicing. The website's provisional services can be renamed in Settings.

`supabase/one-off/drop_draft_schema_2026-11-19.sql` is a record of the one-time cleanup of an earlier, empty draft schema in the Supabase project. It is not needed for a new project.
