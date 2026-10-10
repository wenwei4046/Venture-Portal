-- ============================================================================
-- 20261011060000_round2_permission_functions.sql
-- HR revamp ROUND 2 (2026-10-11): four new modules join the permission
-- matrix ahead of their pages — Documentation, Hiring, Meeting rooms and
-- the Guest link (the Claude Design handoff "Sidebar design revamp from HR",
-- second package, README sections 10–16).
-- ============================================================================
--
-- 1. Four functions, every reach "all" (each module is the company's):
--      documentation  View · Create · Edit
--                     View   the Documents, Data center, Letters and Publish
--                            tabs; Create = upload a document, file a letter,
--                            publish a memo or letter; Edit = remove a
--                            document, set the letter types (add, compulsory,
--                            remove)
--      hiring         View · Create · Edit · Approve
--                     View   requests, the listing, a request's page, the
--                            insights and the Talent Bank; Create = a new
--                            request, a candidate, a talent; Edit = candidates,
--                            the candidate fields, Form settings, the hiring
--                            sources, a talent's notes; Approve = decide
--                            somebody else's request: acknowledge, ask for more
--                            information, decline, mark filled, cancel, reopen,
--                            change its owner
--      rooms          View · Create · Edit
--                     View   the schedule; Create = book a room (and change or
--                            cancel your own booking); Edit = the Rooms tab
--                            (add, change, remove rooms, bookable or not) and
--                            cancelling a booking made through the guest link
--      guest_link     View · Edit — the guest link's settings page
-- 2. Five keys, all scope none (no table's row policy opens for them — the
--    modules' tables are read and written only through their own functions,
--    which ask has_any_action): documentation, hiring, meeting_rooms (book),
--    meeting_rooms_manage (the rooms themselves), guest_link.
-- 3. Accounts with no template (the shared logins): the Principal and HR get
--    all five; Finance and a department manager get meeting_rooms — the user:
--    Meeting Rooms in every view, "hr, principal, finance as well".
-- 4. Templates: Ultimate, Full and HR every new cell; every other portal
--    template (Director, Executive office, Finance · Checker / Maker,
--    Department head, Staff · Basic) Meeting rooms · View and Create. The two
--    Revenue app templates get none: their members book from the Revenue app.
--
-- Nobody loses anything; what is gained is listed above, and no page reads
-- these cells until the modules' own pull requests land.

-- ── 1. The functions ───────────────────────────────────────────────────────

INSERT INTO public.permission_functions (key, label, section, actions, scopes, description, sort_order) VALUES
  ('documentation', 'Documentation', 'People', ARRAY['view', 'create', 'edit'], ARRAY['all'],
   'The files HR shares by department, the letters kept on each person''s record, and the memos and letters HR publishes. Create = upload, file a letter, publish; Edit = remove a document and set the letter types.',
   126),
  ('hiring', 'Hiring', 'People', ARRAY['view', 'create', 'edit', 'approve'], ARRAY['all'],
   'Manpower requests, their candidates, the insights and the Talent Bank. Create = a new request, a candidate, a talent; Edit = candidates, Form settings, hiring sources, talent notes; Approve = acknowledge, ask for more information, decline, mark filled, cancel or reopen a request.',
   127),
  ('rooms', 'Meeting rooms', 'Admin', ARRAY['view', 'create', 'edit'], ARRAY['all'],
   'The meeting-room schedule. Create = book a room and change or cancel your own booking; Edit = add, change and remove the rooms, and cancel a booking made through the guest link.',
   216),
  ('guest_link', 'Guest link', 'Admin', ARRAY['view', 'edit'], ARRAY['all'],
   'The link subsidiary staff use without an account: on or off, what it offers, the rooms it books, the subsidiaries and their departments.',
   218)
ON CONFLICT (key) DO NOTHING;

-- ── 2. The keys ─────────────────────────────────────────────────────────────

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order) VALUES
  ('documentation', 'Documentation', 'People', 'none',
   'Documentation: shared documents, each person''s letters, memos and letters to publish. Opened by Documentation · View.', 126),
  ('hiring', 'Hiring', 'People', 'none',
   'Hiring requests, candidates, insights and the Talent Bank. Opened by Hiring · View.', 127),
  ('meeting_rooms', 'Meeting rooms', 'Admin', 'none',
   'The meeting-room schedule: book a room, cancel your own booking. Opened by Meeting rooms · View.', 216),
  ('meeting_rooms_manage', 'Manage meeting rooms', 'Admin', 'none',
   'Add, change and remove the meeting rooms; cancel a booking made through the guest link. Opened by Meeting rooms · Edit.', 217),
  ('guest_link', 'Guest link', 'Admin', 'none',
   'The guest link''s settings. Opened by Guest link · View.', 218)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate) VALUES
  ('documentation', 'view', 'documentation', 'all', NULL),
  ('hiring', 'view', 'hiring', 'all', NULL),
  ('rooms', 'view', 'meeting_rooms', 'all', NULL),
  ('rooms', 'edit', 'meeting_rooms_manage', 'all', NULL),
  ('guest_link', 'view', 'guest_link', 'all', NULL)
ON CONFLICT (function_key, action, legacy_key) DO NOTHING;

INSERT INTO public.permission_key_actions (legacy_key, function_key, action) VALUES
  ('documentation', 'documentation', 'view'), ('documentation', 'documentation', 'create'), ('documentation', 'documentation', 'edit'),
  ('hiring', 'hiring', 'view'), ('hiring', 'hiring', 'create'), ('hiring', 'hiring', 'edit'), ('hiring', 'hiring', 'approve'),
  ('meeting_rooms', 'rooms', 'view'), ('meeting_rooms', 'rooms', 'create'),
  ('meeting_rooms_manage', 'rooms', 'view'), ('meeting_rooms_manage', 'rooms', 'create'), ('meeting_rooms_manage', 'rooms', 'edit'),
  ('guest_link', 'guest_link', 'view'), ('guest_link', 'guest_link', 'edit')
ON CONFLICT (legacy_key, function_key, action) DO NOTHING;

-- ── 3. The accounts with no template ────────────────────────────────────────

INSERT INTO public.role_default_permissions (role, permission_key) VALUES
  ('principal', 'documentation'), ('principal', 'hiring'), ('principal', 'meeting_rooms'), ('principal', 'meeting_rooms_manage'), ('principal', 'guest_link'),
  ('hr', 'documentation'), ('hr', 'hiring'), ('hr', 'meeting_rooms'), ('hr', 'meeting_rooms_manage'), ('hr', 'guest_link'),
  ('finance', 'meeting_rooms'),
  ('dept_manager', 'meeting_rooms')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ── 4. The templates ────────────────────────────────────────────────────────

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, g.fn, g.action, 'all'
  FROM public.permission_templates t,
       (VALUES ('documentation', 'view'), ('documentation', 'create'), ('documentation', 'edit'),
               ('hiring', 'view'), ('hiring', 'create'), ('hiring', 'edit'), ('hiring', 'approve'),
               ('rooms', 'view'), ('rooms', 'create'), ('rooms', 'edit'),
               ('guest_link', 'view'), ('guest_link', 'edit')) AS g(fn, action)
 WHERE t.key IN ('ultimate', 'full', 'hr')
ON CONFLICT (template_id, function_key, action) DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'rooms', a, 'all'
  FROM public.permission_templates t, unnest(ARRAY['view', 'create']) a
 WHERE t.key IN ('director', 'office', 'fin_checker', 'fin_maker', 'dept_head', 'staff')
ON CONFLICT (template_id, function_key, action) DO NOTHING;

-- An editor left open on any of them saves over nothing it did not see.
UPDATE public.permission_templates SET version = version + 1, updated_at = now()
 WHERE key IN ('ultimate', 'full', 'hr', 'director', 'office', 'fin_checker', 'fin_maker', 'dept_head', 'staff');
