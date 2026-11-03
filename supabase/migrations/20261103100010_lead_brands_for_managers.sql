-- Lead View: a person's brands hold with Lead View · Manage too (2026-11-03 — the user, on Reply templates' + New:
-- "只要是可以登入的，要有可以加的按钮，这是让他们自己操作的", then "包含AI agent 全部").
--
-- The set-up pages' Edit (Reply templates, Reply rules, Step library, AI Agent, Data Center, AI corrections, Campaigns)
-- stands for Lead View · Manage, so Customer Service ticked on them holds Manage — and `lead_my_brands()` gave every brand
-- to anybody with Manage, so Settings › Team's brands stopped narrowing them. Now ticks narrow whoever has them; nobody
-- ticked (the Principal, any login with no rows) still reads every brand, and the service role (no sign-in) too.
-- Settings › Team itself stays behind Settings' own Edit box (`tab_write_guard` on /leads/settings).
--
-- PRODUCTION's body, md5 checked (2e76a517…), its one condition swapped.

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_my_brands()'::regprocedure;
  v_src text;
  v_def text;
  v_old text := $$IF auth.uid() IS NULL OR public.has_any_action(ARRAY['leads.manage']) THEN$$;
  v_new text := $$IF auth.uid() IS NULL THEN  -- Manage is narrowed by its ticks too (mig 20261103100000)$$;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position('mig 20261103100000' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM '2e76a5172b0dfd925068a2a02498e370' THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
  END IF;
  v_def := pg_get_functiondef(v_sig);
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;

NOTIFY pgrst, 'reload schema';
