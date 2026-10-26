-- ============================================================================
-- 20261016300000_leads_permission.sql
-- Lead View (2026-10-16, the user: a customer-service system for the group's brands
-- — 2990s, 2990s mini, Carress, more later — where Customer Service answers
-- Messenger / Instagram enquiries, gets the customer's phone and hands it to that
-- brand's sales, who are not in the system). A new module joins the permission
-- matrix ahead of its pages.
-- ============================================================================
--
-- 1. One function, every reach "all" (every brand's enquiries are the company's):
--      leads  View · Create · Edit · Manage
--             View    Inbox, Leads, Insight, Settings (read)
--             Create  reply to a customer; send a test enquiry (Settings › Test)
--             Edit    the customer card (phone, interest, showroom …), hand a
--                     lead to a salesperson, its appointment / show-up outcome,
--                     claim a conversation
--             Manage  the brands and their salespeople (Settings)
-- 2. One key, scope none (the module's tables are read and written only
--    through its own functions, which ask has_any_action): leads.
-- 3. Accounts with no template: the Principal.
-- 4. Templates: Ultimate and Full every new cell. Customer Service's own
--    template is made on People › Permissions (+ New template, Lead View's
--    tabs) once HR sets up the title — nobody holds Lead View on the day but
--    the full-access accounts.
--
-- Nobody loses anything; no page reads these cells until the pages land.

INSERT INTO public.permission_functions (key, label, section, actions, scopes, description, sort_order) VALUES
  ('leads', 'Lead View', 'Daily', ARRAY['view', 'create', 'edit', 'manage'], ARRAY['all'],
   'Customer Service''s inbox for the brands'' Messenger and Instagram enquiries. Create = reply, send a test enquiry; Edit = the customer card, hand a lead to sales, its outcome; Manage = the brands and their salespeople.',
   135)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order) VALUES
  ('leads', 'Lead View', 'Daily', 'none',
   'Lead View: Inbox, Leads, Insight and Settings. Opened by Lead View · View.', 135)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate) VALUES
  ('leads', 'view', 'leads', 'all', NULL)
ON CONFLICT (function_key, action, legacy_key) DO NOTHING;

INSERT INTO public.permission_key_actions (legacy_key, function_key, action) VALUES
  ('leads', 'leads', 'view'), ('leads', 'leads', 'create'),
  ('leads', 'leads', 'edit'), ('leads', 'leads', 'manage')
ON CONFLICT (legacy_key, function_key, action) DO NOTHING;

INSERT INTO public.role_default_permissions (role, permission_key) VALUES
  ('principal', 'leads')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'leads', a, 'all'
  FROM public.permission_templates t, unnest(ARRAY['view', 'create', 'edit', 'manage']) a
 WHERE t.key IN ('ultimate', 'full')
ON CONFLICT (template_id, function_key, action) DO NOTHING;

UPDATE public.permission_templates SET version = version + 1, updated_at = now()
 WHERE key IN ('ultimate', 'full');
