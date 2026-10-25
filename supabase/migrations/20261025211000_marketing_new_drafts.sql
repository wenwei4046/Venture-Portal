-- 20261025211000_marketing_new_drafts.sql
-- 2026-10-25 — Marketing: New Project kept as a draft while it is typed. The user, on a side agent's note about the meeting
-- minutes New Project is to hold: "New Project 本身，它 supposed to be 是一有输入就会自动进 draft（草稿）那边，这样的话内容
-- 就不会丢了". Until now nothing was kept before Create: a page closed, a refresh or a crash lost all that was typed.
--   The drafts   mkt_new_drafts — a login's own, one for each New Project form it started (a login shared on two PCs keeps
--                each its own), the form as typed (`data`, an object of at most 512 KB) and its count (`rev`); nobody's to
--                read or write but the functions below, and each of those the caller's own rows alone.
--   Read         mkt_new_drafts() — Marketing · Create: the caller's drafts, newest first, each without its form (what the
--                list shows: its kind, title, subsidiary, product, when it was last saved); mkt_new_draft(id) — one of them
--                with its form.
--   Saved        mkt_new_draft_save(id, rev, data) — Marketing · Create: a new one (id null; 30 a login at most), or the
--                caller's own on the count it was last saved on — another window's save is never written over.
--   Dropped      mkt_new_draft_drop(id) — Marketing · Create, the caller's own: Discard, or the project made from it.
-- PGlite: tests/member-sql/validate-marketing-new-drafts.mjs.

CREATE TABLE IF NOT EXISTS public.mkt_new_drafts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  data       jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 524288),
  rev        integer NOT NULL DEFAULT 1 CHECK (rev >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mkt_new_drafts_user ON public.mkt_new_drafts (user_id, updated_at DESC);
ALTER TABLE public.mkt_new_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_new_drafts FROM anon, authenticated;
SELECT public.audit_register('mkt_new_drafts', 'Marketing New Project drafts', 'Marketing', '{}', 'none',
  p_reason => 'A login''s own New Project form, kept as it is typed so nothing is lost; the project made from it is recorded on its own trail');

-- ── Read: the caller's drafts, newest first — what the list shows of each ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_new_drafts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.create'], 'Starting a project is not open to your account.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', d.id, 'rev', d.rev,
             'mode', CASE WHEN d.data ->> 'mode' IN ('product', 'task', 'recurring') THEN d.data ->> 'mode' END,
             'title', CASE WHEN jsonb_typeof(d.data -> 'title') = 'string' THEN left(btrim(d.data ->> 'title'), 140) END,
             'sub', CASE WHEN jsonb_typeof(d.data -> 'sub') = 'string' THEN left(d.data ->> 'sub', 40) END,
             'product', CASE WHEN jsonb_typeof(d.data -> 'product') = 'string' THEN left(d.data ->> 'product', 40) END,
             'createdAt', d.created_at, 'updatedAt', d.updated_at)
           ORDER BY d.updated_at DESC, d.id)
      FROM public.mkt_new_drafts d
     WHERE d.user_id = auth.uid()), '[]'::jsonb);
END
$fn$;

-- ── Read: one of the caller's drafts with its form ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_new_draft(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_d public.mkt_new_drafts;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.create'], 'Starting a project is not open to your account.');
  SELECT * INTO v_d FROM public.mkt_new_drafts WHERE id = p_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('id', v_d.id, 'rev', v_d.rev, 'data', v_d.data, 'createdAt', v_d.created_at,
                            'updatedAt', v_d.updated_at);
END
$fn$;

-- ── Saved as typed: a new draft, or the caller's own on the count it was last saved on ─────────────────────────
-- Answers { id, rev, updatedAt }.
CREATE OR REPLACE FUNCTION public.mkt_new_draft_save(p_id uuid, p_rev integer, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  v_d  public.mkt_new_drafts;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.create'], 'Starting a project is not open to your account.');
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to keep.' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_data::text) > 524288 THEN
    RAISE EXCEPTION 'Too much for one draft — 512 KB at most.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    -- One login's new drafts one at a time, so the count holds.
    PERFORM pg_advisory_xact_lock(hashtext('mkt_new_drafts:' || v_me::text));
    IF (SELECT count(*) FROM public.mkt_new_drafts WHERE user_id = v_me) >= 30 THEN
      RAISE EXCEPTION 'You have 30 drafts — discard one to keep another.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.mkt_new_drafts (user_id, data) VALUES (v_me, p_data) RETURNING * INTO v_d;
  ELSE
    SELECT * INTO v_d FROM public.mkt_new_drafts WHERE id = p_id AND user_id = v_me FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That draft is not there any more.' USING ERRCODE = 'P0002';
    END IF;
    IF p_rev IS DISTINCT FROM v_d.rev THEN
      RAISE EXCEPTION 'This draft was changed in another window since you opened it — reload to see it.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.mkt_new_drafts SET data = p_data, rev = rev + 1, updated_at = now() WHERE id = v_d.id
    RETURNING * INTO v_d;
  END IF;
  RETURN jsonb_build_object('id', v_d.id, 'rev', v_d.rev, 'updatedAt', v_d.updated_at);
END
$fn$;

-- ── Dropped: Discard, or the project made from it — the caller's own ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_new_draft_drop(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_n integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.create'], 'Starting a project is not open to your account.');
  DELETE FROM public.mkt_new_drafts WHERE id = p_id AND user_id = auth.uid();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('dropped', v_n > 0);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_new_drafts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_new_draft(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_new_draft_save(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_new_draft_drop(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_new_drafts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_new_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_new_draft_save(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_new_draft_drop(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
