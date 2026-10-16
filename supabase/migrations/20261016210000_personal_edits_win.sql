-- ════════════════════════════════════════════════════════════════════════════
-- A person's own permissions win; the account's kind gates no key (2026-10-16)
-- ════════════════════════════════════════════════════════════════════════════
-- The owner: "权限逻辑应该是这样分两层：1. 第一层是 Title 对应的 Template…2. 第二层是
-- Custom 的设定：我可以手动去勾选她能 View 哪些内容，这个会 override 掉第一层的设定…
-- Edit Permission 的优先级是高于 Title 和 Template 的" — "如果我在 Permission 那边勾选
-- 允许她 View 和 Edit，那她 supposed to be 就可以去那个 Page 或者 App 查看" — and, shown
-- where it still did not hold, "2. yes can". Two things a tick could not open:
--
--   1. SALARY AMOUNTS, NRIC / IC and BANK ACCOUNTS were the template's alone
--      (permission_template_sensitive). Now one person is ticked on or off a field
--      over it (user_permission_sensitive, granted true / false): current_sensitive_
--      fields() and current_permissions()'s Salary tick (which opens the pay keys —
--      HR Costing, Director Salary / Pool, Revenue, People with pay) read the person's
--      own tick first. An account with no template keeps its kind's fields, as before.
--   2. Eight keys — Approvals, Settings, Audit log, Invite users, Manage permissions,
--      Department mode, Corrections, Switch views — opened only for a template whose
--      hidden KIND is the Principal's (permission_cell_keys.gate = 'principal'), so a
--      tick on them did nothing for anybody else, the person's own included. A gate
--      that reads the kind is not a permission (CLAUDE.md: every gate reads a
--      permission, never a role): those rows lose it, and a ticked cell opens its key
--      as any other does. The Salary and Treasury gates stay — they read ticks.
--
-- What opening an admin-domain key for somebody else reaches was checked on
-- production (2026-10-16): every PERMISSIVE admin-scope write has a RESTRICTIVE
-- needs_action_* (may_write) beside it, so the key alone writes nothing; of the
-- admin-scope reads with no restrictive guard, the login record (access_log) now also
-- asks Audit log · View, and the old per-key exceptions (user_permissions) Logins &
-- invites · View or Manage, beyond each person's own rows. Still the KIND's, on
-- purpose (the owner is asked): which app the account lands in, approving one's own
-- request, reopening a closed payroll month, and a Revenue app account opening only
-- the Revenue app.
--
-- On production nobody's access moves (checked 2026-10-16): the templates that tick
-- a gated cell without the Principal's kind — Director, Finance · Checker, Finance AM,
-- Executive office — have no login on them; no person's own cell is a gated one; no
-- person has a sensitive tick yet.
--
-- Statements swapped in PRODUCTION's bodies (current_permissions md5 fc4662a3…,
-- current_sensitive_fields 91ccf7f9…), each found exactly once or the migration
-- stops.
--
-- Rollback, in words (the database tool refuses the keyword): put 'principal' back
-- as the gate of the eight rows, current_permissions' Salary statement and
-- current_sensitive_fields' template statement as they were, and the two policies'
-- USING clauses; then the function and the table can go.
-- ════════════════════════════════════════════════════════════════════════════

-- ── One person's sensitive fields ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_permission_sensitive (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  field      text NOT NULL CHECK (field IN ('salary', 'nric', 'bank')),
  -- true = sees it although the template does not; false = held back from it.
  granted    boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, field)
);
ALTER TABLE public.user_permission_sensitive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_permission_sensitive_read ON public.user_permission_sensitive;
-- Read as a person's boxes are (user_permission_tabs_read); written only through permission_user_sensitive_set().
CREATE POLICY user_permission_sensitive_read ON public.user_permission_sensitive FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.has_perm('team')) OR (SELECT public.has_perm('permissions_manage')));
COMMENT ON TABLE public.user_permission_sensitive IS
  'One person''s Salary amounts / NRIC / Bank accounts ticked on or off over their title''s template (2026-10-16). Read first by current_sensitive_fields() and current_permissions(); written by permission_user_sensitive_set().';

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('user_permission_sensitive', ARRAY['accounts.manage', 'accounts.view', 'team.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('user_permission_sensitive');

SELECT public.audit_register('user_permission_sensitive', 'Personal sensitive fields', 'People', '{permissions_manage}', 'all',
  p_keys => '{user_id,field}', p_labels => '{user_id,field}');

-- The person's whole list: what is not in it goes (back to the template), what is, is kept.
CREATE OR REPLACE FUNCTION public.permission_user_sensitive_set(p_user uuid, p_fields jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_bad text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions sets a person''s own permissions' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user) THEN RAISE EXCEPTION 'That account is gone'; END IF;
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'array' OR jsonb_array_length(p_fields) > 3 THEN
    RAISE EXCEPTION 'The sensitive fields must be sent as a list';
  END IF;
  SELECT coalesce(f.field, '?') INTO v_bad
    FROM jsonb_to_recordset(p_fields) AS f(field text, granted boolean)
   WHERE f.field IS NULL OR f.field NOT IN ('salary', 'nric', 'bank') OR f.granted IS NULL
   LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% is not a sensitive field', v_bad; END IF;
  SELECT f.field INTO v_bad FROM jsonb_to_recordset(p_fields) AS f(field text, granted boolean)
   GROUP BY f.field HAVING count(*) > 1 LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% is listed twice', v_bad; END IF;

  DELETE FROM public.user_permission_sensitive u
   WHERE u.user_id = p_user
     AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_fields) AS f(field text, granted boolean) WHERE f.field = u.field);
  INSERT INTO public.user_permission_sensitive AS u (user_id, field, granted, updated_by)
  SELECT p_user, f.field, f.granted, auth.uid() FROM jsonb_to_recordset(p_fields) AS f(field text, granted boolean)
  ON CONFLICT (user_id, field) DO UPDATE
    SET granted = EXCLUDED.granted, updated_at = now(), updated_by = auth.uid()
    WHERE u.granted IS DISTINCT FROM EXCLUDED.granted;
END
$fn$;
REVOKE ALL ON FUNCTION public.permission_user_sensitive_set(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_user_sensitive_set(uuid, jsonb) TO authenticated, service_role;

-- ── The readers ask the person's own tick first ────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.swap_once(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_def   text := pg_get_functiondef(p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: the statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  FOR v_found IN SELECT DISTINCT m[1] FROM regexp_matches(v_src, '(' || v_pat || ')', 'g') AS m LOOP
    v_def := replace(v_def, v_found, p_new);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

-- current_permissions(): their own Salary tick decides before the template's.
SELECT pg_temp.swap_once('public.current_permissions()',
  $q$SELECT EXISTS(SELECT 1 FROM public.permission_template_sensitive s
   WHERE s.template_id=(SELECT id FROM my_template) AND s.field='salary') AS yes$q$,
  $q$SELECT coalesce((SELECT p.granted FROM public.user_permission_sensitive p WHERE p.user_id=(SELECT id FROM me) AND p.field='salary' AND EXISTS(SELECT 1 FROM my_template)),
   EXISTS(SELECT 1 FROM public.permission_template_sensitive s WHERE s.template_id=(SELECT id FROM my_template) AND s.field='salary')) AS yes$q$);

-- current_sensitive_fields(): the template's NRIC / Bank less what was held back from them, and what was given to them.
SELECT pg_temp.swap_once('public.current_sensitive_fields()',
  $q$SELECT s.field AS f FROM public.permission_template_sensitive s
     WHERE s.template_id = (SELECT template_id FROM my_title)$q$,
  $q$SELECT s.field AS f FROM public.permission_template_sensitive s
     WHERE s.template_id = (SELECT template_id FROM my_title)
       AND NOT EXISTS (SELECT 1 FROM public.user_permission_sensitive p
                        WHERE p.user_id = (SELECT id FROM me) AND p.field = s.field AND NOT p.granted)
    UNION
    SELECT p.field FROM public.user_permission_sensitive p
     WHERE p.user_id = (SELECT id FROM me) AND p.granted AND (SELECT template_id FROM my_title) IS NOT NULL$q$);

-- ── No key waits for the account's kind ────────────────────────────────────

UPDATE public.permission_cell_keys SET gate = NULL WHERE gate = 'principal';

-- ── What an admin-domain key opens on its own, now that more than the Principal may hold one ──

-- The login record: each person's own (access_log_self_select), else Audit log · View with it.
ALTER POLICY access_log_principal_select ON public.access_log
  USING ((SELECT public.has_scope(ARRAY['admin'])) AND (SELECT public.has_action('audit_log', 'view', 'all')));
-- The old per-key exceptions: each person's own, else Logins & invites · View or Manage with it.
ALTER POLICY user_permissions_read ON public.user_permissions
  USING ((user_id = auth.uid()) OR ((SELECT public.has_scope(ARRAY['admin'])) AND (SELECT public.has_any_action(ARRAY['accounts.view', 'accounts.manage']))));
