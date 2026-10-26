-- 20261025037000_marketing_pet_levels.sql
-- 2026-10-24 — Marketing ⑦-5: the pet's levels, XP, energy and states, and the trophies (`My Space Bento.dc.html`; the
-- user's answers 32–34).
--   XP (answer 32)        +10 a stage finished, +20 a product project's (its own or a deliverable's) — to whoever did it,
--                         once a stage, nothing taken back; approvals and subtasks earn none. A stage finished earns a
--                         snack too; a pet begins with three (the handoff's).
--   Energy (answer 33)    never falls with time: 64 to begin with; a snack fed gives 20 (up to 100); a workout takes 15 and
--                         gives 10 XP — the first three a day (the office's day), none after.
--   Levels (the handoff)  0 · 100 · 250 · 450 · 700 · 1000 XP: Lv 1–6 — the pet grows, and evolves at Lv 3 and Lv 5.
--   Trophies (answer 34)  projects finished this quarter (the office's) where you did any stage — a product project once,
--                         through its deliverables; a series by its runs; six listed at most, all counted.
-- New: mkt_pet_log — the pet's ledger: a line a stage finished, a snack fed, a workout (RLS on, nothing granted).
-- Replaced from production's body (md5 equal — 20261025032000's): mkt_advance  + the finished stage's XP and snack.
-- New functions:
--   mkt_pet_of(staff)    a person's pet in numbers (internal)
--   mkt_pet()            Marketing · View: the caller's own
--   mkt_pet_care(what)   Marketing · Edit: 'feed' or 'workout' the caller's own pet — on the roster, set up
-- Stages finished before ⑦-5 are credited once, to whoever did them.
-- PGlite: tests/member-sql/validate-marketing-pet.mjs.

CREATE TABLE IF NOT EXISTS public.mkt_pet_log (
  id         bigserial PRIMARY KEY,
  staff      uuid NOT NULL REFERENCES public.hr_staff_costs(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('stage', 'feed', 'workout')),
  xp         integer NOT NULL DEFAULT 0 CHECK (xp BETWEEN 0 AND 20),
  energy     integer NOT NULL DEFAULT 0 CHECK (energy BETWEEN -15 AND 20),
  snacks     integer NOT NULL DEFAULT 0 CHECK (snacks BETWEEN -1 AND 1),
  project_id uuid REFERENCES public.mkt_projects(id) ON DELETE CASCADE,
  stage_idx  integer,
  day        date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date),
  at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'stage') = (project_id IS NOT NULL AND stage_idx IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_pet_log_stage ON public.mkt_pet_log (project_id, stage_idx, staff) WHERE kind = 'stage';
CREATE INDEX IF NOT EXISTS mkt_pet_log_staff ON public.mkt_pet_log (staff, day);
ALTER TABLE public.mkt_pet_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_pet_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.mkt_pet_log_id_seq FROM anon, authenticated;
SELECT public.audit_register('mkt_pet_log', 'Marketing pets', 'Marketing', '{}', 'none',
  p_reason => 'The pet''s own ledger — a line a stage finished, a snack fed, a workout; written once by the functions');

-- ── A stage finished: its XP and a snack to whoever did it ───────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_advance(p_project uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p    public.mkt_projects;
  v_next public.mkt_stages;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  UPDATE public.mkt_stages SET status = 'done', done_at = now(), appr_idx = 0
   WHERE project_id = v_p.id AND idx = v_p.cur;
  -- The pet's XP (⑦-5 — the user's answer 32): whoever did the stage, +10 — +20 a product project's (or a deliverable's) —
  -- and a snack; once a stage and person, nothing taken back.
  INSERT INTO public.mkt_pet_log (staff, kind, xp, snacks, project_id, stage_idx)
  SELECT s.owner_staff, 'stage', CASE WHEN v_p.kind IN ('product', 'deliverable') THEN 20 ELSE 10 END, 1, v_p.id, s.idx
    FROM public.mkt_stages s
   WHERE s.project_id = v_p.id AND s.idx = v_p.cur AND s.owner_staff IS NOT NULL
  ON CONFLICT DO NOTHING;
  SELECT * INTO v_next FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur + 1;
  IF NOT FOUND THEN
    UPDATE public.mkt_projects SET status = 'done', done_at = now(), updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'closed');
    IF v_p.series_id IS NOT NULL THEN
      PERFORM public.mkt_series_settle(v_p.series_id);
    END IF;
    -- A deliverable done: its product project is, once its last one is (②b-2a).
    IF v_p.parent_id IS NOT NULL THEN
      PERFORM public.mkt_product_settle(v_p.parent_id);
    END IF;
    RETURN;
  END IF;
  UPDATE public.mkt_projects SET cur = v_next.idx, updated_at = now() WHERE id = v_p.id;
  UPDATE public.mkt_stages SET status = 'todo', entered_at = now(), appr_idx = 0, changes = NULL
   WHERE project_id = v_p.id AND idx = v_next.idx;
  PERFORM public.mkt_log(v_p.id, 'opened', v_next.idx, v_next.name, public.mkt_staff_name(v_next.owner_staff));
  IF v_next.owner_staff IS NOT NULL THEN
    PERFORM public.mkt_notify(v_next.owner_staff, v_p.id, 'Your turn: ' || v_next.name,
                              v_p.track_id || ' · ' || v_p.title, 'open');
  END IF;
END
$fn$;

-- Stages finished before ⑦-5: credited once, on the day each was finished.
INSERT INTO public.mkt_pet_log (staff, kind, xp, snacks, project_id, stage_idx, day, at)
SELECT s.owner_staff, 'stage', CASE WHEN p.kind IN ('product', 'deliverable') THEN 20 ELSE 10 END, 1, s.project_id, s.idx,
       (coalesce(s.done_at, now()) AT TIME ZONE 'Asia/Kuala_Lumpur')::date, coalesce(s.done_at, now())
  FROM public.mkt_stages s
  JOIN public.mkt_projects p ON p.id = s.project_id
 WHERE s.status = 'done' AND s.owner_staff IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── A person's pet in numbers ────────────────────────────────────────────────────────
-- Energy 64 to begin with, each feed and workout on top (they keep it within 0–100); three snacks, those earned, less
-- those fed;
-- today's workouts; this quarter's trophies — six listed, all counted.
CREATE OR REPLACE FUNCTION public.mkt_pet_of(p_staff uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_q     date := date_trunc('quarter', (now() AT TIME ZONE 'Asia/Kuala_Lumpur'))::date;
  v_xp    integer;
  v_en    integer;
  v_sn    integer;
  v_ex    integer;
BEGIN
  SELECT coalesce(sum(l.xp), 0)::integer, coalesce(sum(l.energy), 0)::integer, coalesce(sum(l.snacks), 0)::integer,
         (count(*) FILTER (WHERE l.kind = 'workout' AND l.day = v_today))::integer
    INTO v_xp, v_en, v_sn, v_ex
    FROM public.mkt_pet_log l
   WHERE l.staff = p_staff;
  RETURN jsonb_build_object('xp', v_xp, 'energy', greatest(0, least(100, 64 + v_en)), 'snacks', greatest(0, 3 + v_sn), 'workouts', v_ex,
    'trophies', coalesce((
      SELECT jsonb_agg(jsonb_build_object('track', t.track_id, 'title', t.title, 'at', t.done_at) ORDER BY t.done_at DESC, t.track_id)
        FROM (SELECT p.track_id, p.title, p.done_at
                FROM public.mkt_projects p
               WHERE p.status = 'done' AND p.kind <> 'deliverable' AND NOT (p.kind = 'recurring' AND p.series_id IS NULL)
                 AND (p.done_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= v_q
                 AND EXISTS (SELECT 1 FROM public.mkt_stages s
                              WHERE s.owner_staff = p_staff AND s.status = 'done'
                                AND (s.project_id = p.id
                                     OR s.project_id IN (SELECT d.id FROM public.mkt_projects d WHERE d.parent_id = p.id)))
               ORDER BY p.done_at DESC, p.track_id
               LIMIT 6) t), '[]'::jsonb),
    'trophyCount', (SELECT count(*)::integer
                      FROM public.mkt_projects p
                     WHERE p.status = 'done' AND p.kind <> 'deliverable' AND NOT (p.kind = 'recurring' AND p.series_id IS NULL)
                       AND (p.done_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= v_q
                       AND EXISTS (SELECT 1 FROM public.mkt_stages s
                                    WHERE s.owner_staff = p_staff AND s.status = 'done'
                                      AND (s.project_id = p.id
                                           OR s.project_id IN (SELECT d.id FROM public.mkt_projects d WHERE d.parent_id = p.id)))));
END
$fn$;

-- ── The caller's own ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_pet()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  -- A pet lives in the room of somebody on Marketing's roster: anybody else has none.
  v_me := public.mkt_me_staff();
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.mkt_roster() r WHERE r.staff_id = v_me) THEN
    RETURN NULL;
  END IF;
  RETURN public.mkt_pet_of(v_me);
END
$fn$;

-- ── Feed it, or work it out ───────────────────────────────────────────────────────────
-- Somebody on the roster, their pet set up. A feed: a snack, +20 energy (to 100) — none left, or full: refused. A
-- workout: −15 energy, +10 XP the first three a day — too tired (under 15): refused. One at a time a person.
CREATE OR REPLACE FUNCTION public.mkt_pet_care(p_what text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid;
  v_pet  jsonb;
  v_name text;
  v_now  jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Changing your space is not open to your account.');
  v_me := public.mkt_me_staff();
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.mkt_roster() r WHERE r.staff_id = v_me) THEN
    RAISE EXCEPTION 'A pet lives in the room of somebody on Marketing''s roster.' USING ERRCODE = '22023';
  END IF;
  SELECT sp.pet INTO v_pet FROM public.mkt_spaces sp WHERE sp.user_id = auth.uid();
  IF NOT coalesce((v_pet ->> 'onboarded')::boolean, false) THEN
    RAISE EXCEPTION 'Set up your pet first.' USING ERRCODE = '22023';
  END IF;
  v_name := coalesce(nullif(btrim(coalesce(v_pet ->> 'name', '')), ''), 'Your pet');
  PERFORM pg_advisory_xact_lock(hashtext('mkt_pet:' || v_me::text));
  v_now := public.mkt_pet_of(v_me);
  IF p_what = 'feed' THEN
    IF (v_now ->> 'snacks')::integer < 1 THEN
      RAISE EXCEPTION 'No snacks left — finish a stage to earn more.' USING ERRCODE = '22023';
    END IF;
    IF (v_now ->> 'energy')::integer >= 100 THEN
      RAISE EXCEPTION '% is full.', v_name USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.mkt_pet_log (staff, kind, energy, snacks)
    VALUES (v_me, 'feed', least(20, 100 - (v_now ->> 'energy')::integer), -1);
  ELSIF p_what = 'workout' THEN
    IF (v_now ->> 'energy')::integer < 15 THEN
      RAISE EXCEPTION '% is too tired — feed it first.', v_name USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.mkt_pet_log (staff, kind, energy, xp)
    VALUES (v_me, 'workout', -15, CASE WHEN (v_now ->> 'workouts')::integer < 3 THEN 10 ELSE 0 END);
  ELSE
    RAISE EXCEPTION 'Feed it, or work it out.' USING ERRCODE = '22023';
  END IF;
  RETURN public.mkt_pet_of(v_me);
END
$fn$;

-- ── Who may call what ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_pet_of(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_pet_of(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_pet() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_pet_care(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_pet() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_pet_care(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
