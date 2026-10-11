-- People › Permissions › Revenue app gains the rest of Profile (2026-10-11 — the user: every
-- page of every view has its row): Profile · My honours, Profile · My brand weeks and Profile ·
-- Commission scheme (lib/permission-tabs.ts; Memos & notifications stays open to all, the user's
-- choice — HR counts every member as needing to acknowledge a memo). Each is a View box: unticked,
-- the app neither lists nor opens the page (lib/member/app-pages.ts).
--
-- My brand weeks is the one of the three that writes: the member saves the brand worked each fair
-- weekend. The app refuses the save once the page's View box was unticked for them
-- (saveMemberArenaBrandWeeks); the database asked only that the caller is a member of the
-- sub-department, so a save sent straight to member_arena_save_brand_week_picks with the member's
-- own session walked round the box. Now it asks tab_box_closed (mig 20261011150000, the twin of
-- closedBoxes) first, as the Revenue app's requests do since mig 20261011220200. My honours is
-- read by the server with the service role after the app's own check (no tabs to ask there), and
-- the scheme's sheet draws what the app already holds.
--
-- Production's body, one statement put after its BEGIN (the DECLARE's member_staff_id() still runs
-- first, so a caller who is no member is refused as before). Run twice, it changes nothing.

CREATE OR REPLACE FUNCTION pg_temp.tab_guard_put(p_sig text, p_guard text)
RETURNS void
LANGUAGE plpgsql
AS $g$
DECLARE
  v_oid oid := p_sig::regprocedure;
  v_src text;
  v_def text;
  v_at  integer;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position(p_guard IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF position('tab_box_closed' IN v_src) > 0 THEN
    RAISE EXCEPTION '% already asks another box — change that guard with swap_check', p_sig;
  END IF;
  v_at := regexp_instr(v_src, '\mBEGIN\M', 1, 1, 1, 'i');
  IF v_at = 0 THEN
    RAISE EXCEPTION '% has no BEGIN', p_sig;
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF length(v_def) - length(replace(v_def, v_src, '')) <> length(v_src) THEN
    RAISE EXCEPTION '% — its body is not in its definition exactly once', p_sig;
  END IF;
  EXECUTE replace(v_def, v_src, left(v_src, v_at - 1) || E'\n  ' || p_guard || substr(v_src, v_at));
END
$g$;

SELECT pg_temp.tab_guard_put('public.member_arena_save_brand_week_picks(uuid, text, jsonb)',
  'IF public.tab_box_closed(''rev.brand_weeks'', ''view'') THEN RAISE EXCEPTION ''My brand weeks is not open to your account.'' USING ERRCODE = ''42501''; END IF;');
