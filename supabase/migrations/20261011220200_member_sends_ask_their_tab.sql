-- Plan C, the database side (2026-10-11), part 3: the Revenue app's requests ask
-- their page's Create box too.
--
-- The app refuses a claim once Requests' Create box was unticked for the member,
-- and a waiting list or a replacement once Waiting list & replacements' was
-- (lib/member/app-pages.ts › requestPageOf; mustSend in lib/member/server.ts —
-- drafting, sending and withdrawing alike). The database asked only the Request
-- access key, so a request sent straight to member_prepare_request /
-- member_submit_request / member_cancel_request walked round the box. Now each
-- asks member_send_guard(kind) first: tab_box_closed (mig 20261011150000), the
-- twin of closedBoxes. Book a room asks rev.rooms since that migration; a quote is
-- priced by the server after the app's own check (the service role has no tabs to
-- ask, so the app's gate is the only one there).

CREATE OR REPLACE FUNCTION public.member_send_guard(p_kind text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.tab_box_closed(CASE WHEN p_kind = 'claim' THEN 'rev.requests' ELSE 'rev.track' END, 'create') THEN
    RAISE EXCEPTION '%', CASE WHEN p_kind = 'claim'
      THEN 'Sending a claim is not open to your account.'
      ELSE 'Sending a waiting list or a replacement is not open to your account.' END
      USING ERRCODE = '42501';
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.member_send_guard(text) FROM PUBLIC, anon, authenticated;

-- The same insertion as mig 20261011220100 (a pg_temp function lives for one session).
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
  IF position('member_send_guard' IN v_src) > 0 THEN
    RAISE EXCEPTION '% already asks another tab — change that guard with swap_check', p_sig;
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

SELECT pg_temp.tab_guard_put('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)',
  'PERFORM public.member_send_guard(p_kind);');
SELECT pg_temp.tab_guard_put('public.member_submit_request(uuid)',
  'PERFORM public.member_send_guard((SELECT mr.kind FROM public.member_requests mr WHERE mr.id = p_request));');
SELECT pg_temp.tab_guard_put('public.member_cancel_request(uuid)',
  'PERFORM public.member_send_guard((SELECT mr.kind FROM public.member_requests mr WHERE mr.id = p_request));');
