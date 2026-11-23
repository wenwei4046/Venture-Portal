-- The CRM apart by the Revenue app's view (2026-11-23 — the owner, over the Fair view's Insight and Assignment showing The
-- Conts and Dream Crafter together: "IR 的 view 就只可以看到 IR，DC 就只可以看到 DC，同等的 fair 也只能看到 fair。现在全部绑在一起，
-- 我不要这样"; "Management 这边也不是统一的，IR 是 IR，DC 是 DC"; "每个 segment 分开就对了"). The screens hold themselves to the
-- view (lib/member/crm-view.ts); the database gives them what they need for it:
--
-- 1. member_data_snapshot: a sub-department one holds in the CRM ALONE — no seat there, not directed — is listed after the
--    rest as a membership flagged 'crm', so the Revenue app's switch offers its view and the CRM can be opened on it (asked
--    who answers Dream Crafter's customers from IR's roster, the owner: "give them" — HECTOR, LIM YAU WEI, and KRIS, who is
--    in charge of DC). Nobody of its roster comes with it, and the app reads none of its sales there (no seat: the database
--    refuses those reads). One statement added to production's body (md5 71c6ee7c…), after the directors' memberships.
-- 2. crm_people: each person's CRM brands (crm_brands_of_user) — a view lists only its own brand's people. Null for
--    somebody with no login.
-- 3. PETER's own DC tick in the CRM goes ("peter dont need, cause he dint in charge dc" — mig 20261120010000 ticked it): his
--    CRM reach is again what he handles, Fair and IR. Dream Crafter's leads the dealer gave him as the Revenue Director who
--    held DC (an enquiry from no ad) now wait in DC's Team inbox to be sent by hand.

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

-- ── 1. A CRM-only view ──────────────────────────────────────────────────────
SELECT pg_temp.swap_once('public.member_data_snapshot(boolean)',
  $q$WHERE x.staff_id=v_staff AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) m WHERE m->>'id'=d.id::text));$q$,
  $q$WHERE x.staff_id=v_staff AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) m WHERE m->>'id'=d.id::text));
 -- A sub-department one holds in the CRM alone (2026-11-23, mig 20261124200000): no seat there, not directed — listed after
 -- the rest, flagged 'crm', so the app opens the CRM on it. Nobody of its roster; the app reads none of its sales.
 v_memberships:=v_memberships||(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'schemeId',sc.id,'name',d.name,'code',coalesce(d.code,d.name),
  'title',coalesce(t.name,''),'rank','','rate',0,'calculator',false,
  'effective',coalesce(sc.effective_from,v_today),'capacity',cap.headcount_limit,'occupied',public.member_occupied(d.id,v_today),
  'people','[]'::jsonb,'crm',true) ORDER BY d.created_at,d.id),'[]'::jsonb)
 FROM public.comm_sub_departments d
 LEFT JOIN LATERAL (SELECT c.id,c.effective_from FROM public.comm_schemes c WHERE c.sub_department_id=d.id AND c.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today) ORDER BY c.effective_from DESC,c.id LIMIT 1) sc ON true
 LEFT JOIN public.hr_staff_costs s ON s.id=v_staff
 LEFT JOIN public.titles t ON t.id=s.title_id
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE d.is_active AND public.crm_my_role() IS NOT NULL
  AND d.id IN (SELECT public.crm_brand_sub(b) FROM unnest(public.crm_my_brands()) AS b)
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) m WHERE m->>'id'=d.id::text));$q$);

-- ── 2. Each person's brands ─────────────────────────────────────────────────
-- Both branches (no CRM sub-department set, and IR's): the same field.
SELECT pg_temp.swap_once('public.crm_people()',
  $q$'title', t.name, 'login', s.user_id is not null, 'paused', coalesce(cs.paused, false))$q$,
  $q$'title', t.name, 'login', s.user_id is not null, 'paused', coalesce(cs.paused, false),
               'brands', case when s.user_id is null then null else to_jsonb(public.crm_brands_of_user(s.user_id)) end)$q$);
SELECT pg_temp.swap_once('public.crm_people()',
  $q$'title', coalesce(mt.name, t.name), 'login', s.user_id is not null, 'paused', coalesce(cs.paused, false))$q$,
  $q$'title', coalesce(mt.name, t.name), 'login', s.user_id is not null, 'paused', coalesce(cs.paused, false),
             'brands', case when s.user_id is null then null else to_jsonb(public.crm_brands_of_user(s.user_id)) end)$q$);

-- ── 3. PETER's DC tick ──────────────────────────────────────────────────────
DELETE FROM public.user_sub_department_reach r
 USING public.comm_sub_departments sd
 WHERE r.user_id = 'de910eeb-d294-411a-bde8-8b8d03dccf76' AND r.area = 'crm'
   AND r.sub_department_id = sd.id AND upper(sd.code) = 'DC';
