-- "+ New template" asks a name and the views it can see (2026-10-11 — the user: a floating window
-- to fill in the template's name, then tick which views it can see; and, from a note they passed
-- on, its sensitive fields too, since HR's pay pages open only with Salary amounts ticked).
--
-- Until now "+ New template" copied the template open (permission_template_create with
-- p_copy_from, then its ticks saved over the copy — two calls). The window makes a BLANK one:
-- View on every tab of the views picked, the cells those ticks stand for (worked out by the app's
-- server from the ticks, as every save is — lib/permission-tabs.ts › cellRows) and its sensitive
-- fields, all in ONE transaction, so a refused part leaves no half-made template behind.
--
-- Its hidden kind (base_role, which `sync_user_role` gives its holders' accounts) is worked out here
-- from the ticks, never handed in: only Revenue app tabs → revenue_member (its holders sign in to
-- the Revenue app, as the Revenue Team / Revenue Director templates' do); anything else → staff, a
-- portal account with no role defaults (permission_template_create's own default). A Principal-kind
-- template is never made this way — the Principal's own powers (Settings, Audit Log › Access, view
-- switching, the Product List, managing permissions) stay with the full-access templates, and the
-- table says so on a box ticked for them (permission-tabs › heldTabs).
--
-- Asks Logins & invites · Manage (accounts.manage) — the action its app gate asks — and the two
-- functions it runs ask whoever manages permissions again, as they always have.

CREATE OR REPLACE FUNCTION public.permission_template_new(p_name text, p_tabs text[], p_grants jsonb, p_sensitive text[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['accounts.manage']) THEN
    RAISE EXCEPTION 'Only whoever manages permissions makes a template' USING ERRCODE = '42501';
  END IF;
  IF p_tabs IS NULL OR cardinality(p_tabs) = 0 THEN
    RAISE EXCEPTION 'Pick at least one view it can see';
  END IF;
  -- The name's checks (1–80 characters, used once) and the template itself, a staff-kind blank.
  v_id := public.permission_template_create(p_name, NULL, NULL);
  IF NOT EXISTS (SELECT 1 FROM unnest(p_tabs) t WHERE t IS NULL OR t !~ '^rev\.') THEN
    UPDATE public.permission_templates SET base_role = 'revenue_member' WHERE id = v_id;
  END IF;
  -- Its ticks, their cells and its sensitive fields: nobody holds it yet, so nobody's boxes lie over it.
  PERFORM public.permission_template_tabs_save(v_id, 1, p_tabs, p_grants, p_sensitive, '[]'::jsonb);
  RETURN v_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.permission_template_new(text, text[], jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_template_new(text, text[], jsonb, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
