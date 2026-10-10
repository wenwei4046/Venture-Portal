-- ============================================================================
-- 20261011010100_permission_tabs_reads.sql
-- A person's boxes ask for the action too (HR revamp 8, 2026-10-11).
-- ============================================================================
--
-- `user_permission_tabs` is read as `user_permission_cells` is (its own row,
-- or People's `team` / `permissions_manage` keys) — a domain policy, so like
-- every table one opens it also asks for an action (PR3d's rule,
-- 20261009080000): the readers are People › Permissions and the person
-- window (Team · View, Logins & invites · View / Manage). Nobody reads their
-- own boxes from the app; when the pages follow the tabs (8c) that read is a
-- DEFINER function's.

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('user_permission_tabs', ARRAY['accounts.manage', 'accounts.view', 'team.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;

SELECT public.permission_reads_guard('user_permission_tabs');
