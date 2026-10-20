-- Transport claim (2026-10-20 — the user, circling Member services › Claim rates: "然后这个 claim rate 我要换成
-- transport claim。在这里我要多一个：在 save button 旁边（或者就是 save 的右边之类的）做一个三个点。它是要能够选择
-- 什么 title 的人可以 claim 这个 transport。它跟 food claim 一样，food claim 本身也是有一个选 title 的，什么 title
-- 都可以选，so transport 也是要").
--
-- Claim rates is now called Transport claim: the member's *Submit claim* — Outstation by road, a plane ticket, an
-- Airbnb stay. HR now picks the titles that may send one, as for the food claim (20261013150000):
-- 1. `member_claim_rates.transport_title_ids`, with its own saved-at / by (a change of those alone is no change to the
--    audit). SEEDED with every title the list shows today — the Revenue sub-departments' department's titles and any
--    title somebody holds a seat on — so on the day nobody loses a claim they could send; HR unticks from there. A
--    title made later is not ticked until HR ticks it. Seeded once: a run after HR's first save changes nothing.
-- 2. `member_admin_transport_claim()` is HR's list (every such title, the highest level first, with how many hold a
--    seat on it today), `member_admin_save_transport_claim(titles)` saves it — the back office's door
--    (member_requests_manage) AND Member services · Edit (member.manage), as the food claim's save. Member Services'
--    Edit is the only box for member.manage: no tab_write_guard.
-- 3. `member_transport_claim_open(staff, sub)` refuses a member whose seat title in the sub-department claimed for is
--    not ticked (`IS NOT TRUE`: no seat, no title, lets nobody through). `member_claim_detail_for` asks it for
--    Outstation and Airbnb, `member_prepare_request` for an old-style claim sent with no claimType — production's
--    bodies, one statement added each (pg_temp.swap_check: refuses when production changed since; a second run
--    changes nothing).
-- 4. `member_claim_settings()` hands the member's form the ticked titles' names (`transport.titles`), so *Submit claim*
--    shows only to them — production's body, one statement added.
--
-- No new table. Comments stay outside the function bodies.

-- ── 1. HR's setting ─────────────────────────────────────────────────────────

ALTER TABLE public.member_claim_rates
  ADD COLUMN IF NOT EXISTS transport_title_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS transport_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS transport_updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.member_claim_rates.transport_title_ids IS
  'The titles whose holders may send a transport claim — Outstation, a plane ticket, an Airbnb stay (2026-10-20): the member''s seat title in the sub-department claimed for. Written by member_admin_save_transport_claim only.';

SELECT public.audit_register('member_claim_rates', 'Claim rates', 'Member services', '{member_requests_manage}',
  p_labels => '{base_name}', p_ignore => '{food_updated_at,food_updated_by,transport_updated_at,transport_updated_by}');

-- Every title the list shows today, ticked — once.
UPDATE public.member_claim_rates r
   SET transport_title_ids = coalesce((
         SELECT array_agg(t.id ORDER BY t.id)
           FROM public.titles t
          WHERE (t.is_active AND t.department_id IN (SELECT d.department_id FROM public.comm_sub_departments d WHERE d.is_active))
             OR EXISTS (SELECT 1 FROM public.comm_hierarchy h
                          JOIN public.comm_schemes c ON c.id = h.scheme_id
                          JOIN public.comm_sub_departments d ON d.id = c.sub_department_id
                         WHERE h.title_id = t.id AND d.is_active AND c.is_active
                           AND h.effective_from <= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
                           AND (h.effective_to IS NULL OR h.effective_to >= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date))
       ), '{}'::uuid[])
 WHERE r.id AND r.transport_updated_at IS NULL AND cardinality(r.transport_title_ids) = 0;

-- ── 2. HR's list, and its Save ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_admin_transport_claim()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_rates public.member_claim_rates%ROWTYPE;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR request management access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_rates FROM public.member_claim_rates WHERE id;
  RETURN jsonb_build_object(
    'titleIds', to_jsonb(coalesce(v_rates.transport_title_ids, '{}'::uuid[])),
    'updatedAt', v_rates.transport_updated_at,
    'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = v_rates.transport_updated_by),
    'titles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'active', t.is_active, 'level', l.name,
        'people', (SELECT count(DISTINCT h.staff_id) FROM public.comm_hierarchy h
                     JOIN public.comm_schemes c ON c.id = h.scheme_id
                     JOIN public.comm_sub_departments d ON d.id = c.sub_department_id
                    WHERE h.title_id = t.id AND d.is_active AND c.is_active
                      AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today)
                      AND c.effective_from <= v_today AND (c.effective_to IS NULL OR c.effective_to >= v_today)))
        ORDER BY l.rank DESC NULLS LAST, t.name)
      FROM public.titles t
      LEFT JOIN public.title_levels l ON l.id = t.level_id
      WHERE (t.is_active AND t.department_id IN (SELECT d.department_id FROM public.comm_sub_departments d WHERE d.is_active))
         OR t.id = ANY (coalesce(v_rates.transport_title_ids, '{}'::uuid[]))
         OR EXISTS (SELECT 1 FROM public.comm_hierarchy h
                      JOIN public.comm_schemes c ON c.id = h.scheme_id
                      JOIN public.comm_sub_departments d ON d.id = c.sub_department_id
                     WHERE h.title_id = t.id AND d.is_active AND c.is_active
                       AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today))
    ), '[]'::jsonb));
END
$fn$;

COMMENT ON FUNCTION public.member_admin_transport_claim() IS
  'Member services › Transport claim''s Who can claim (2026-10-20): every Revenue title — the sub-departments'' department''s, any title held on a seat today, any ticked — the highest level first, with how many hold a seat on it today, and which are ticked.';

REVOKE ALL ON FUNCTION public.member_admin_transport_claim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_transport_claim() TO authenticated;

CREATE OR REPLACE FUNCTION public.member_admin_save_transport_claim(p_titles uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_titles uuid[];
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE
     OR public.has_any_action(ARRAY['member.manage']) IS NOT TRUE THEN
    RAISE EXCEPTION 'HR request management access is required' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[]) INTO v_titles
    FROM unnest(coalesce(p_titles, '{}'::uuid[])) x WHERE x IS NOT NULL;
  IF cardinality(v_titles) > 60 THEN
    RAISE EXCEPTION 'Keep it to 60 titles';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_titles) x WHERE NOT EXISTS (SELECT 1 FROM public.titles t WHERE t.id = x)) THEN
    RAISE EXCEPTION 'A title picked is no longer in People. Reload the page and pick again';
  END IF;
  INSERT INTO public.member_claim_rates (id, transport_title_ids, transport_updated_at, transport_updated_by)
  VALUES (true, v_titles, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE SET transport_title_ids = EXCLUDED.transport_title_ids,
    transport_updated_at = EXCLUDED.transport_updated_at, transport_updated_by = EXCLUDED.transport_updated_by;
  RETURN public.member_admin_transport_claim();
END
$fn$;

COMMENT ON FUNCTION public.member_admin_save_transport_claim(uuid[]) IS
  'Member services › Transport claim''s Who can claim, saved (2026-10-20): the titles whose holders may send a transport claim. The back office''s door and Member services · Edit.';

REVOKE ALL ON FUNCTION public.member_admin_save_transport_claim(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_save_transport_claim(uuid[]) TO authenticated;

-- ── 3. Who may send one ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_transport_claim_open(p_staff uuid, p_sub uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_title uuid;
  v_title_name text;
BEGIN
  SELECT h.title_id, t.name INTO v_title, v_title_name
    FROM public.comm_hierarchy h
    JOIN public.comm_schemes c ON c.id = h.scheme_id
    LEFT JOIN public.titles t ON t.id = h.title_id
   WHERE h.staff_id = p_staff AND c.sub_department_id = p_sub AND c.is_active
     AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today)
     AND c.effective_from <= v_today AND (c.effective_to IS NULL OR c.effective_to >= v_today)
   ORDER BY c.effective_from DESC
   LIMIT 1;
  IF (v_title = ANY (coalesce((SELECT r.transport_title_ids FROM public.member_claim_rates r WHERE r.id), '{}'::uuid[]))) IS NOT TRUE THEN
    RAISE EXCEPTION 'A transport claim is not open to %. HR picks the titles that may claim it.', coalesce(v_title_name, 'your title')
      USING ERRCODE = '42501';
  END IF;
END
$fn$;

COMMENT ON FUNCTION public.member_transport_claim_open(uuid, uuid) IS
  'A transport claim (Outstation, a plane ticket, an Airbnb stay) is the ticked titles'' (2026-10-20): refuses a member whose seat title in the sub-department claimed for is not in member_claim_rates.transport_title_ids. Called by member_claim_detail_for and member_prepare_request only.';

REVOKE ALL ON FUNCTION public.member_transport_claim_open(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_transport_claim_open(uuid, uuid) TO service_role;

-- ── 3 and 4. Production's bodies, one statement added each ──────────────────

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- 3a. Outstation, a plane ticket, an Airbnb stay: worked out here, asked first.
SELECT pg_temp.swap_check('public.member_claim_detail_for(jsonb, uuid, uuid)'::regprocedure,
  $old$IF v_type IS NULL OR v_type NOT IN ('outstation','airbnb') THEN RAISE EXCEPTION 'Choose Outstation or Airbnb'; END IF;$old$,
  $new$IF v_type IS NULL OR v_type NOT IN ('outstation','airbnb') THEN RAISE EXCEPTION 'Choose Outstation or Airbnb'; END IF;
 PERFORM public.member_transport_claim_open(p_staff, p_sub);$new$);

-- 3b. An old-style claim (no claimType: an accommodation claim with its own amount) is a transport claim too.
SELECT pg_temp.swap_check('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)'::regprocedure,
  $old$ELSIF p_kind='claim' THEN$old$,
  $new$ELSIF p_kind='claim' THEN
 PERFORM public.member_transport_claim_open(v_staff, p_sub_department);$new$);

-- 4. The member's form: who may send one.
SELECT pg_temp.swap_check('public.member_claim_settings()'::regprocedure,
  $old$'food',jsonb_build_object('subDepartmentId',public.member_food_claim_sub(),$old$,
  $new$'transport',jsonb_build_object('titles',coalesce((SELECT jsonb_agg(t.name ORDER BY t.name) FROM public.titles t WHERE t.id=ANY(coalesce((SELECT transport_title_ids FROM public.member_claim_rates WHERE id),'{}'::uuid[]))),'[]'::jsonb)),
  'food',jsonb_build_object('subDepartmentId',public.member_food_claim_sub(),$new$);

NOTIFY pgrst, 'reload schema';
