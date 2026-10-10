-- ============================================================================
-- 20261011010000_permission_tabs.sql
-- Permissions by view › tab › View / Create / Edit / Approve (HR revamp 8,
-- 2026-10-11; the user's choice B for People › Permissions).
-- ============================================================================
--
-- A title's template is now ticked per TAB of each view (HR view, Finance
-- view, Principal view, Department view, Revenue app — the catalog is
-- `src/lib/permission-tabs.ts`), four boxes a tab, and one person may be
-- raised or lowered on a box. The database keeps asking for FUNCTION cells
-- (`current_actions()` and every guard since PR3 — the user's point 6): each
-- save writes the ticks AND the cells they stand for, in one transaction,
-- through the very functions that wrote the cells before
-- (`permission_template_save`, `permission_user_cells_set`), so their checks
-- and their audit trail are unchanged.
--
-- Nothing is moved by this migration: a template with no ticks stored yet is
-- shown with the ticks its cells give (the app derives them, losing no cell —
-- `permission-tabs.test.ts` proves it on all eleven); its first save stores
-- them. So nobody's access changes when this runs.
--
--   permission_template_tabs  (template, tab, action)           — a ticked box
--   user_permission_tabs      (user, tab, action, granted)      — one person's box
--   permission_template_tabs_save(...)  — the ticks + their cells, one save
--   permission_user_tabs_set(...)       — a person's boxes + their cells
--   permission_template_delete(...)     — the handoff's Delete (no title on it)

-- ── The ticks ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permission_template_tabs (
  template_id uuid NOT NULL REFERENCES public.permission_templates(id) ON DELETE CASCADE,
  tab_id      text NOT NULL CHECK (tab_id ~ '^(hr|fin|pri|dept|rev)\.[a-z_]{2,40}$'),
  action      text NOT NULL CHECK (action IN ('view', 'create', 'edit', 'approve')),
  PRIMARY KEY (template_id, tab_id, action)
);
ALTER TABLE public.permission_template_tabs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permission_template_tabs_read ON public.permission_template_tabs;
-- Read as the cells are (permission_template_grants_read): every signed-in session.
CREATE POLICY permission_template_tabs_read ON public.permission_template_tabs FOR SELECT TO authenticated USING (true);
COMMENT ON TABLE public.permission_template_tabs IS
  'A template''s ticked boxes, view › tab › action (2026-10-11). Written with the function cells they stand for by permission_template_tabs_save(); a template with none shows the ticks its cells give.';

CREATE TABLE IF NOT EXISTS public.user_permission_tabs (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tab_id     text NOT NULL CHECK (tab_id ~ '^(hr|fin|pri|dept|rev)\.[a-z_]{2,40}$'),
  action     text NOT NULL CHECK (action IN ('view', 'create', 'edit', 'approve')),
  -- true = raised above the title's template, false = held back from it.
  granted    boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, tab_id, action)
);
ALTER TABLE public.user_permission_tabs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_permission_tabs_read ON public.user_permission_tabs;
-- Read as a person's cells are (user_permission_cells_read).
CREATE POLICY user_permission_tabs_read ON public.user_permission_tabs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.has_perm('team')) OR (SELECT public.has_perm('permissions_manage')));
COMMENT ON TABLE public.user_permission_tabs IS
  'One person''s boxes raised or held back from their title''s template (2026-10-11), with user_permission_cells written to match by permission_user_tabs_set().';

SELECT public.audit_register('permission_template_tabs', 'Template boxes', 'People', '{permissions_manage}', 'all',
  p_keys => '{template_id,tab_id,action}', p_labels => '{template_id,tab_id,action}');
SELECT public.audit_register('user_permission_tabs', 'Personal boxes', 'People', '{permissions_manage}', 'all',
  p_keys => '{user_id,tab_id,action}', p_labels => '{user_id,tab_id,action}');

-- ── One save of a template: its ticks and the cells they stand for ───────────

CREATE OR REPLACE FUNCTION public.permission_template_tabs_save(
  p_template uuid, p_version integer, p_tabs text[], p_grants jsonb, p_sensitive text[], p_reset jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_bad text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions changes a template' USING ERRCODE = '42501';
  END IF;
  IF p_tabs IS NULL OR cardinality(p_tabs) > 400 THEN RAISE EXCEPTION 'The boxes must be sent as a list'; END IF;
  SELECT coalesce(t, 'An empty box') INTO v_bad FROM unnest(p_tabs) t
   WHERE t IS NULL OR t !~ '^(hr|fin|pri|dept|rev)\.[a-z_]{2,40}\.(view|create|edit|approve)$' LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION '% is not a box of the matrix', v_bad; END IF;

  -- The cells first: their checks (the version, each cell valid, nothing past its View) refuse the whole save.
  PERFORM public.permission_template_save(p_template, p_version, p_grants, p_sensitive, p_reset);

  DELETE FROM public.permission_template_tabs t
   WHERE t.template_id = p_template
     AND NOT (t.tab_id || '.' || t.action = ANY (p_tabs));
  INSERT INTO public.permission_template_tabs (template_id, tab_id, action)
  SELECT DISTINCT p_template, regexp_replace(t, '\.[a-z]+$', ''), substring(t FROM '\.([a-z]+)$')
    FROM unnest(p_tabs) t
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('version', (SELECT version FROM public.permission_templates WHERE id = p_template),
                            'titles', (SELECT count(*) FROM public.titles WHERE template_id = p_template));
END
$fn$;

-- ── One person's boxes, the whole set, and the cells to match ────────────────

CREATE OR REPLACE FUNCTION public.permission_user_tabs_set(p_user uuid, p_tabs jsonb, p_cells jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_bad text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions sets a person''s own permissions' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_tabs) IS DISTINCT FROM 'array' OR jsonb_array_length(p_tabs) > 400 THEN
    RAISE EXCEPTION 'The boxes must be sent as a list';
  END IF;
  SELECT coalesce(b.tab, '?') || '.' || coalesce(b.action, '?') INTO v_bad
    FROM jsonb_to_recordset(p_tabs) AS b(tab text, action text, granted boolean)
   WHERE b.tab IS NULL OR b.tab !~ '^(hr|fin|pri|dept|rev)\.[a-z_]{2,40}$'
      OR b.action IS NULL OR b.action NOT IN ('view', 'create', 'edit', 'approve') OR b.granted IS NULL
   LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% is not a box of the matrix', v_bad; END IF;

  -- The cells first (their own checks), then the boxes.
  PERFORM public.permission_user_cells_set(p_user, p_cells);

  DELETE FROM public.user_permission_tabs u
   WHERE u.user_id = p_user
     AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_tabs) AS b(tab text, action text, granted boolean)
                      WHERE b.tab = u.tab_id AND b.action = u.action);
  INSERT INTO public.user_permission_tabs AS u (user_id, tab_id, action, granted, updated_by)
  SELECT DISTINCT ON (b.tab, b.action) p_user, b.tab, b.action, b.granted, auth.uid()
    FROM jsonb_to_recordset(p_tabs) AS b(tab text, action text, granted boolean)
  ON CONFLICT (user_id, tab_id, action) DO UPDATE
    SET granted = EXCLUDED.granted, updated_at = now(), updated_by = auth.uid()
    WHERE u.granted IS DISTINCT FROM EXCLUDED.granted;
END
$fn$;

-- ── Delete (the handoff's): a template no title points at ────────────────────

CREATE OR REPLACE FUNCTION public.permission_template_delete(p_template uuid, p_version integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t public.permission_templates%ROWTYPE;
  v_titles integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions deletes a template' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM public.permission_templates WHERE id = p_template FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That template is gone'; END IF;
  IF t.version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION '% was changed by somebody else since you opened it. Reload and try again', t.name;
  END IF;
  SELECT count(*) INTO v_titles FROM public.titles WHERE template_id = p_template;
  IF v_titles > 0 THEN
    RAISE EXCEPTION '% is on % title%. Move % to another template first', t.name, v_titles,
      CASE WHEN v_titles = 1 THEN '' ELSE 's' END, CASE WHEN v_titles = 1 THEN 'it' ELSE 'them' END;
  END IF;
  -- Its cells, sensitive fields and boxes go with it (ON DELETE CASCADE); the audit keeps each.
  DELETE FROM public.permission_templates WHERE id = p_template;
END
$fn$;

REVOKE ALL ON FUNCTION public.permission_template_tabs_save(uuid, integer, text[], jsonb, text[], jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.permission_user_tabs_set(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.permission_template_delete(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_template_tabs_save(uuid, integer, text[], jsonb, text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permission_user_tabs_set(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permission_template_delete(uuid, integer) TO authenticated;
