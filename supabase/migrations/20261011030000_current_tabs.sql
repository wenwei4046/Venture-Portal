-- ============================================================================
-- 20261011030000_current_tabs.sql
-- The tabs a templated account holds, for its pages and sidebar (HR revamp 8b,
-- 2026-10-11 — the user's point 6: app gates go per tab).
-- ============================================================================
--
-- Pages and the sidebars now ask the tab's View on top of the gate each
-- already had (src/lib/page-tabs.ts). An account's tabs are worked out in the
-- app (lib/page-tabs `userTabs`) from its cells and keys — what
-- current_actions() / current_permissions() already answer — except where its
-- template STORES ticks, or the person has boxes of their own: those live in
-- tables the app would otherwise read three times on every request. This
-- hands them back in one call, for the caller only, found exactly as
-- current_actions() finds a template (their staff row's title). NULL for an
-- account with no template, or no portal account.
--
--   { "ticks": [...] | null, "boxes": [{tab, action, granted}], "cells": bool }
--
-- `cells` = they have cells of their own (user_permission_cells) — then, with
-- no boxes, their tabs are what their cells give (they predate tabs).

CREATE OR REPLACE FUNCTION public.current_tabs()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_me uuid;
  v_template uuid;
BEGIN
  SELECT id INTO v_me FROM public.users WHERE id = auth.uid() AND is_active;
  IF v_me IS NULL THEN RETURN NULL; END IF;
  SELECT t.template_id INTO v_template
    FROM public.hr_staff_costs s JOIN public.titles t ON t.id = s.title_id
   WHERE s.user_id = v_me LIMIT 1;
  IF v_template IS NULL OR NOT EXISTS (SELECT 1 FROM public.permission_templates WHERE id = v_template) THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'ticks', (SELECT array_agg(g.tab_id || '.' || g.action ORDER BY g.tab_id, g.action)
                FROM public.permission_template_tabs g WHERE g.template_id = v_template),
    'boxes', coalesce((SELECT jsonb_agg(jsonb_build_object('tab', b.tab_id, 'action', b.action, 'granted', b.granted)
                                        ORDER BY b.tab_id, b.action)
                         FROM public.user_permission_tabs b WHERE b.user_id = v_me), '[]'::jsonb),
    'cells', EXISTS (SELECT 1 FROM public.user_permission_cells c WHERE c.user_id = v_me));
END
$fn$;

REVOKE ALL ON FUNCTION public.current_tabs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tabs() TO authenticated;
