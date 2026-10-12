-- Brand weeks come from the Houzs ERP (2026-10-12, the user).
--
-- "Houzs ERP side got add on the sales attending for every project fair, so
-- our sales is no more needed to select brand week … arena only calculate the
-- correct point for current work week by detecting brand week … this will
-- never get auto predict or selection by sales, cause their work location is
-- fixed by Houzs ERP side." And for the booths nobody is listed at: "we set 2
-- layer. 1 layer is use track by erp houzs, if fail, then go with auto
-- detect, same engine with previous one."
--
-- So a seller's brand week — the ONE booth a weekend whose Fair result earns
-- points, and the fair a claim is for — is:
--   1. the booth the ERP's Sales Attending lists them at for that weekend
--      (member_erp_brand_weeks, mig 20261012140000; listed at two that
--      weekend → the one they wrote the most bills at);
--   2. else, as before, the brand they opened the most bills for that week,
--      at the fair with the most bills for it.
-- Nobody picks one any more: My brand weeks only shows it, HR's grid only
-- reads it, and the four ways of saving a pick are gone. To change a brand
-- week, change who attends the booth in the ERP.
--
-- Each function below is production's body (md5 checked 2026-10-12) with its
-- brand-week statements swapped; nothing else in them moves.

-- ── The booth boards (the Arena's Fair results, the claim form, HR's grid) ────
-- Production md5 ab3aa84479cb9e039f399418b714cb7f. Changed: erp_weeks (new),
-- guessed (only where the ERP lists nobody), week_brand / fits / placed (the
-- two layers), each person's `source` (and `confirmed` = listed by the ERP,
-- for an app that still reads it), the fair's organiser, and `weeks` — every
-- seller's brand week of this month's weekends and the two months' before, the
-- ERP's upcoming ones too.
CREATE OR REPLACE FUNCTION public.member_arena_booth_history_for_staff(p_sub_department uuid, p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_current date:=date_trunc('month',v_today)::date;
  -- The brand weeks the app shows (My brand weeks, Today, the claim form): this
  -- month's weekends and the two months' before — the month still being worked
  -- can be two back early in a month.
  v_weeks_from date:=(date_trunc('month',v_today)-interval '2 months')::date;
  v_weeks_until date:=(date_trunc('month',v_today)+interval '1 month')::date;
  v_result jsonb;
BEGIN
  WITH roster AS (
    SELECT DISTINCT s.id,s.employee_name AS name FROM comm_hierarchy h
    JOIN hr_staff_costs s ON s.id=h.staff_id
    LEFT JOIN titles t ON t.id=h.title_id LEFT JOIN titles st ON st.id=s.title_id
    WHERE h.scheme_id=p_scheme AND s.status='active'
      AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
      AND NOT coalesce(t.is_department_head,false) AND NOT coalesce(st.is_department_head,false)
  ), sources AS (
    SELECT DISTINCT ON (so.order_no) so.* FROM sales_orders so
    JOIN sales_import_batches ib ON ib.id=so.batch_id
    WHERE ib.sub_department_id=p_sub_department AND ib.status='committed' AND so.period_month<=v_current
    ORDER BY so.order_no,so.created_at DESC,so.id
  ), scoped AS (
    SELECT so.*,c.enable_kpi,coalesce(r.period_month,v_current) AS recognition_month,
      r.id IS NOT NULL OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
        OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS cleared,
      -- The booth the salesperson picked in the ERP, while that pick is the
      -- bill's fair (lib/exhibitions.ts boothOf + brandCodeFor).
      CASE WHEN so.fair_source='erp' AND coalesce(so.raw->'fair'->>'status','')<>'cancelled'
                AND nullif(btrim(so.raw->'fair'->>'brand'),'') IS NOT NULL
           THEN coalesce(erp_sync_brand_code(so.raw->'fair'->>'brand'),
                         upper(regexp_replace(btrim(so.raw->'fair'->>'brand'),'\s+',' ','g'))) END AS booth_pick,
      nullif(btrim(so.brand_code),'') AS own_brand
    FROM sources so JOIN comm_schemes c ON c.id=p_scheme
    LEFT JOIN comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=p_sub_department
    WHERE NOT so.cancelled AND so.order_date<=v_today AND so.staff_id IN (SELECT id FROM roster)
  ), kpi AS (
    SELECT h.order_id,sum(h.qty*h.unit_amount) AS amount
    FROM comm_schemes c
    CROSS JOIN LATERAL (SELECT DISTINCT s.recognition_month FROM scoped s WHERE c.enable_kpi) m
    CROSS JOIN LATERAL comm_kpi_hits(p_scheme,
      ARRAY(SELECT s.id FROM scoped s WHERE s.recognition_month=m.recognition_month),
      (m.recognition_month+interval '1 month - 1 day')::date) h
    WHERE c.id=p_scheme
    GROUP BY h.order_id
  ), line_scope AS (
    SELECT o.id,o.staff_id,o.fair_event_id,o.booth_pick,o.own_brand,o.cleared,l.line_amount,
      EXISTS(SELECT 1 FROM comm_item_groups g WHERE g.scheme_id=p_scheme
        AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods
    FROM scoped o JOIN sales_order_lines l ON l.order_id=o.id
  ), bills AS (
    SELECT l.id,l.staff_id,l.fair_event_id,l.booth_pick,l.own_brand,l.cleared,
      coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods,bool_or(l.is_goods) AS has_goods
    FROM line_scope l
    GROUP BY l.id,l.staff_id,l.fair_event_id,l.booth_pick,l.own_brand,l.cleared
  ), order_facts AS (
    SELECT b.id,b.staff_id,b.fair_event_id,b.booth_pick,b.own_brand,b.cleared,b.goods-coalesce(k.amount,0) AS revenue
    FROM bills b LEFT JOIN kpi k ON k.order_id=b.id
    WHERE b.has_goods OR k.order_id IS NOT NULL
  ), fairs AS (
    SELECT e.id,coalesce(nullif(btrim(v.display_name),''),e.venue_key) AS venue,
      coalesce(nullif(btrim(org.name),''),nullif(btrim(e.erp_organiser_text),'')) AS organizer,
      e.start_date,e.end_date,e.period_month,
      -- The fair weekend: the Friday of the Monday–Sunday week it opens in.
      (date_trunc('week',e.start_date::timestamp)::date+4) AS week
    FROM comm_venue_events e LEFT JOIN comm_venues v ON v.venue_key=e.venue_key
    LEFT JOIN comm_organisers org ON org.id=e.organiser_id
    WHERE e.start_date IS NOT NULL AND e.end_date IS NOT NULL AND e.end_date<=v_today
  ), erp_weeks AS (
    -- The first layer: the booth the ERP's Sales Attending lists each seller
    -- at, for the weekend its fair opens in.
    SELECT w.* FROM public.member_erp_brand_weeks(p_sub_department) w
    WHERE w.staff_id IN (SELECT id FROM roster)
  ), written AS (
    -- What each seller wrote each week, by the brand each bill names — its
    -- booth pick, else its own brand. Only for guessing the week's brand.
    SELECT f.week,o.staff_id,coalesce(o.booth_pick,o.own_brand) AS brand,
      sum(o.revenue) AS amount,count(*) AS bills
    FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id
    WHERE coalesce(o.booth_pick,o.own_brand) IS NOT NULL
    GROUP BY f.week,o.staff_id,coalesce(o.booth_pick,o.own_brand)
  ), guessed AS (
    -- The second layer, only where the ERP lists them at no booth that
    -- weekend — the engine as it was: the brand they opened the most bills
    -- for that week, then the most sales.
    SELECT DISTINCT ON (w.staff_id,w.week) w.staff_id,w.week,w.brand
    FROM written w
    WHERE NOT EXISTS (SELECT 1 FROM erp_weeks e WHERE e.staff_id=w.staff_id AND e.week=w.week)
    ORDER BY w.staff_id,w.week,w.bills DESC,w.amount DESC,w.brand
  ), week_brand AS (
    SELECT e.staff_id,e.week,e.brand,'erp'::text AS source FROM erp_weeks e
    UNION ALL
    SELECT g.staff_id,g.week,g.brand,'auto'::text FROM guessed g
  ), fits AS (
    -- At each fair that week, what can be a guessed seller's booth's: the
    -- bills picked at that brand's booth, and the bills with no pick.
    SELECT f.id AS fair_id,f.week,o.staff_id,wb.brand,
      sum(o.revenue) AS amount,count(*) AS bills
    FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id
    JOIN week_brand wb ON wb.staff_id=o.staff_id AND wb.week=f.week AND wb.source='auto'
    WHERE o.booth_pick IS NULL OR o.booth_pick=wb.brand
    GROUP BY f.id,f.week,o.staff_id,wb.brand
  ), placed AS (
    -- The ONE booth a week that scores: the one the ERP lists them at; else
    -- their guessed brand, at the fair with the most bills for it.
    SELECT e.fair_id,e.week,e.staff_id,e.brand,'erp'::text AS source FROM erp_weeks e WHERE e.fair_id IS NOT NULL
    UNION ALL
    (SELECT DISTINCT ON (x.staff_id,x.week) x.fair_id,x.week,x.staff_id,x.brand,'auto'::text
     FROM fits x
     ORDER BY x.staff_id,x.week,x.bills DESC,x.amount DESC,x.fair_id)
  ), appearances AS (
    -- Every bill at a completed fair, at the booth it was written at: its
    -- pick, else the booth its seller worked that week, else its own brand
    -- (NULL: the fair's no-brand board).
    SELECT o.id,o.staff_id,o.fair_event_id,o.cleared,o.revenue,
      coalesce(o.booth_pick,wb.brand,o.own_brand) AS booth,wb.source
    FROM order_facts o JOIN fairs f ON f.id=o.fair_event_id
    LEFT JOIN week_brand wb ON wb.staff_id=o.staff_id AND wb.week=f.week
  ), booth_people AS (
    SELECT a.fair_event_id AS fair_id,a.booth,a.staff_id,
      max(a.source) AS source,
      EXISTS(SELECT 1 FROM placed pl WHERE pl.staff_id=a.staff_id AND pl.fair_id=a.fair_event_id
        AND pl.brand IS NOT DISTINCT FROM a.booth) AS scoring,
      coalesce(sum(a.revenue) FILTER(WHERE a.cleared),0) AS sales,
      coalesce(sum(a.revenue) FILTER(WHERE NOT a.cleared),0) AS held,
      count(*) FILTER(WHERE a.cleared) AS orders
    FROM appearances a
    GROUP BY a.fair_event_id,a.booth,a.staff_id
  ), events AS (
    SELECT f.id AS fair_id,bp.booth,f.venue,f.organizer,f.start_date,f.end_date,f.period_month,f.week,
      public.member_arena_week_closes_on(f.week) AS closes_on,
      jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'sales',bp.sales,'held',bp.held,
        'orders',bp.orders,'source',bp.source,'confirmed',bp.source='erp','scoring',bp.scoring) ORDER BY p.name,p.id) AS people
    FROM booth_people bp JOIN fairs f ON f.id=bp.fair_id JOIN roster p ON p.id=bp.staff_id
    GROUP BY f.id,bp.booth,f.venue,f.organizer,f.start_date,f.end_date,f.period_month,f.week
  ), loose AS (
    SELECT count(*) AS orders,coalesce(sum(o.revenue),0) AS sales
    FROM order_facts o WHERE o.fair_event_id IS NULL AND o.cleared
  ), off_week AS (
    -- On a board without scoring: another booth than the seller's brand week,
    -- a second fair that week, or the no-brand board.
    SELECT coalesce(sum(bp.orders),0) AS orders,coalesce(sum(bp.sales),0) AS sales
    FROM booth_people bp WHERE NOT bp.scoring
  ), shown_weeks AS (
    -- Each seller's brand week, this month's weekends and the two months'
    -- before: where the ERP lists them (upcoming weekends too), else where the
    -- second layer placed them by their bills.
    SELECT e.staff_id,e.week,'erp'::text AS source,e.brand,e.fair_id,e.venue,e.organizer,e.start_date,e.end_date,e.booths
    FROM erp_weeks e WHERE e.week>=v_weeks_from AND e.week<v_weeks_until
    UNION ALL
    SELECT pl.staff_id,pl.week,'auto'::text,pl.brand,pl.fair_id,f.venue,f.organizer,f.start_date,f.end_date,NULL::integer
    FROM placed pl JOIN fairs f ON f.id=pl.fair_id
    WHERE pl.source='auto' AND pl.week>=v_weeks_from AND pl.week<v_weeks_until
  )
  SELECT jsonb_build_object(
    'asOf',now(),'provisional',true,
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.fair_id::text||'|'||coalesce(e.booth,''),'fairId',e.fair_id,
      'brand',e.booth,'venue',e.venue,'organizer',e.organizer,'start',e.start_date,'end',e.end_date,'week',e.week,
      'closesOn',e.closes_on,'locked',v_today>e.closes_on,
      'periodMonth',to_char(e.period_month,'YYYY-MM'),'people',e.people)
      ORDER BY e.end_date,e.start_date,e.fair_id,e.booth NULLS LAST) FROM events e),'[]'::jsonb),
    'weeks',coalesce((SELECT jsonb_agg(jsonb_build_object('staffId',w.staff_id,'week',w.week,'source',w.source,
      'brand',w.brand,'fairId',w.fair_id,'venue',w.venue,'organizer',w.organizer,'start',w.start_date,'end',w.end_date,
      'booths',w.booths) ORDER BY w.week,w.staff_id) FROM shown_weeks w),'[]'::jsonb),
    'unassignedOrders',(SELECT orders FROM loose),
    'unassignedSales',(SELECT sales FROM loose),
    'offWeekOrders',(SELECT orders FROM off_week),
    'offWeekSales',(SELECT sales FROM off_week),
    'championship',jsonb_build_object('status','pending',
      'reason','Championship totals need every ranking source and a settled scoring ledger. Fair finishes stand on their own until then.'))
  INTO v_result;
  RETURN v_result;
END $function$;

-- ── The member's and the Principal's reads: their own brand weeks only ───────
-- Production md5 172bba59438f338011738f3a60d3696f / af1bce2fc9a4016bced8fb7d85e27030;
-- the gate runs first as before, then `weeks` is cut to the one person read.
CREATE OR REPLACE FUNCTION public.member_arena_booth_history(p_sub_department uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_history jsonb; v_staff uuid;
BEGIN
  v_history:=public.member_arena_booth_history_for_staff(p_sub_department,public.member_arena_scheme(p_sub_department));
  v_staff:=public.member_staff_id();
  RETURN v_history||jsonb_build_object('weeks',coalesce((SELECT jsonb_agg(w ORDER BY ord)
    FROM jsonb_array_elements(coalesce(v_history->'weeks','[]'::jsonb)) WITH ORDINALITY x(w,ord)
    WHERE w->>'staffId'=v_staff::text),'[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.member_principal_arena_booth_history(p_staff uuid, p_sub_department uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_history jsonb;
BEGIN
  v_history:=public.member_arena_booth_history_for_staff(p_sub_department,public.member_principal_context(p_staff,p_sub_department));
  RETURN v_history||jsonb_build_object('weeks',coalesce((SELECT jsonb_agg(w ORDER BY ord)
    FROM jsonb_array_elements(coalesce(v_history->'weeks','[]'::jsonb)) WITH ORDINALITY x(w,ord)
    WHERE w->>'staffId'=p_staff::text),'[]'::jsonb));
END $function$;

-- ── A claim is for your brand week ───────────────────────────────────────────
-- Production md5 5fa5bdb150c589d23b625488b81da3e8. Changed: the ERP's booth
-- first (its fair when the portal knows it, else the ERP's own place and days,
-- so a weekend the ERP sent somebody to can be claimed before a bill is
-- written there); the saved pick (gone) no longer asked.
CREATE OR REPLACE FUNCTION public.member_claim_brand_week(p_staff uuid, p_sub uuid, p_week date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date; v_scheme uuid; v_events jsonb; v_event jsonb; v_erp record;
BEGIN
 SELECT c.id INTO v_scheme FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id
  WHERE h.staff_id=p_staff AND c.sub_department_id=p_sub AND c.is_active
   AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
   AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  ORDER BY c.effective_from DESC LIMIT 1;
 IF v_scheme IS NULL THEN RETURN NULL; END IF;
 -- The first layer: the booth the ERP's Sales Attending lists them at that weekend.
 SELECT * INTO v_erp FROM public.member_erp_brand_weeks(p_sub,p_staff) w WHERE w.week=p_week LIMIT 1;
 IF FOUND THEN
  RETURN jsonb_build_object('id',coalesce(v_erp.fair_id::text,'erp-'||v_erp.erp_project_id)||'|'||coalesce(v_erp.brand,''),
   'fairId',v_erp.fair_id,'erpProjectId',v_erp.erp_project_id,'brand',v_erp.brand,'venue',v_erp.venue,
   'venueKey',v_erp.venue_key,'organizer',v_erp.organizer,'start',v_erp.start_date,'end',v_erp.end_date,
   'week',v_erp.week,'source','erp','picked',true);
 END IF;
 -- The second layer: the booth the Arena placed them at by their bills.
 v_events:=coalesce(public.member_arena_booth_history_for_staff(p_sub,v_scheme)->'events','[]'::jsonb);
 SELECT e INTO v_event FROM jsonb_array_elements(v_events) e
  WHERE e->>'week'=p_week::text AND EXISTS(SELECT 1 FROM jsonb_array_elements(e->'people') p
   WHERE p->>'id'=p_staff::text AND coalesce((p->>'scoring')::boolean,true))
  LIMIT 1;
 IF v_event IS NULL THEN RETURN NULL; END IF;
 RETURN (v_event - 'people') || jsonb_build_object('source','auto','picked',false);
END $function$;

-- Production md5 6d09344f0bcd08b878840da48c1ab84f. Changed: the refusal when
-- there is no brand week (nothing to pick any more), a booth the portal has no
-- fair for read at the ERP's own place and days, and `brandWeekSource`.
CREATE OR REPLACE FUNCTION public.member_claim_detail_for(p_detail jsonb, p_staff uuid, p_sub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_type text := p_detail->>'claimType'; v_rates public.member_claim_rates%ROWTYPE; v_region public.member_claim_regions%ROWTYPE;
 v_week date; v_booth jsonb; v_fair uuid; v_venue_key text; v_venue text; v_fair_facts jsonb; v_fair_start date; v_fair_end date;
 v_start date; v_end date; v_pax integer; v_nights integer; v_group boolean; v_cap numeric; v_invoice numeric;
BEGIN
 IF v_type IS NULL OR v_type NOT IN ('outstation','airbnb') THEN RAISE EXCEPTION 'Choose Outstation or Airbnb'; END IF;
 IF coalesce(p_detail->>'week','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Choose the brand week the claim is for'; END IF;
 v_week := (p_detail->>'week')::date;
 v_booth := public.member_claim_brand_week(p_staff, p_sub, v_week);
 IF v_booth IS NULL THEN
  RAISE EXCEPTION 'A claim is for your own brand week, and you have none that weekend: the ERP''s Sales Attending lists you at no booth and you wrote no fair bills. Ask HR to add you in the ERP.';
 END IF;
 v_fair := (v_booth->>'fairId')::uuid;
 SELECT e.venue_key, coalesce(nullif(btrim(v.display_name),''), e.venue_key), e.start_date, e.end_date INTO v_venue_key, v_venue, v_fair_start, v_fair_end
  FROM public.comm_venue_events e LEFT JOIN public.comm_venues v ON v.venue_key=e.venue_key WHERE e.id=v_fair;
 -- A booth the portal has no fair for yet (nothing written there): the ERP's place and days.
 IF v_fair IS NULL THEN
  v_venue_key := nullif(v_booth->>'venueKey','');
  v_venue := coalesce(nullif(v_booth->>'venue',''), v_venue_key);
  v_fair_start := nullif(v_booth->>'start','')::date;
  v_fair_end := nullif(v_booth->>'end','')::date;
 END IF;
 -- What the claim is for comes from the database's own records, over whatever the phone sent.
 v_fair_facts := jsonb_build_object('week',v_week,'fairId',v_fair,'brand',v_booth->>'brand','location',v_venue,
  'venueKey',v_venue_key,'brandWeekPicked',coalesce((v_booth->>'picked')::boolean,false),'brandWeekSource',v_booth->>'source');
 SELECT * INTO v_rates FROM public.member_claim_rates WHERE id;
 IF v_type='outstation' THEN
  SELECT g.* INTO v_region FROM public.member_claim_venue_regions m
   JOIN public.member_claim_regions g ON g.id=m.region_id AND g.is_active
   WHERE m.venue_key=v_venue_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR has not set the region for % yet, so an outstation claim for it cannot be sent.', v_venue; END IF;
  IF v_region.plane_ticket THEN
   IF coalesce(p_detail->>'invoiceHash','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Add the plane ticket''s invoice'; END IF;
   IF coalesce(p_detail->>'amount','')!~'^\d{1,9}(\.\d{1,2})?$' OR (p_detail->>'amount')::numeric<=0 THEN
    RAISE EXCEPTION 'Enter the plane ticket''s price, as its invoice shows';
   END IF;
   RETURN (p_detail - 'region' - 'regionName' - 'spots' - 'rate' - 'start' - 'end' - 'male' - 'female' - 'pax' - 'nights' - 'group' - 'cap' - 'invoiceAmount')
    || v_fair_facts || jsonb_build_object('category','Plane ticket','base',v_rates.base_name,'region',v_region.id,
     'regionName',v_region.name,'planeTicket',true,'amount',round((p_detail->>'amount')::numeric,2));
  END IF;
  IF v_region.spots<=0 THEN RAISE EXCEPTION '% is in %, local to %, so there is no outstation claim', v_venue, v_region.name, coalesce(v_rates.base_name,'Klang Valley'); END IF;
  IF coalesce(v_rates.rate_per_spot,0)<=0 THEN RAISE EXCEPTION 'HR has not set the rate per spot yet'; END IF;
  RETURN (p_detail - 'invoiceHash' - 'invoiceName' - 'start' - 'end' - 'male' - 'female' - 'pax' - 'nights' - 'amount' - 'planeTicket' - 'group' - 'cap' - 'invoiceAmount')
   || v_fair_facts || jsonb_build_object('category','Outstation','base',v_rates.base_name,'region',v_region.id,'regionName',v_region.name,
    'spots',v_region.spots,'rate',v_rates.rate_per_spot,'planeTicket',false,'amount',round(v_region.spots*v_rates.rate_per_spot,2));
 END IF;
 -- Airbnb is for an outstation fair only (user 2026-10-06): the region HR set for its venue is away
 -- from the base — spots above 0, or flown to.
 SELECT g.* INTO v_region FROM public.member_claim_venue_regions m
  JOIN public.member_claim_regions g ON g.id=m.region_id AND g.is_active
  WHERE m.venue_key=v_venue_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'HR has not set the region for % yet, so an Airbnb claim for it cannot be sent.', v_venue; END IF;
 IF v_region.spots<=0 AND NOT v_region.plane_ticket THEN
  RAISE EXCEPTION '% is in %, local to %, so there is no Airbnb claim', v_venue, v_region.name, coalesce(v_rates.base_name,'Klang Valley');
 END IF;
 IF coalesce(p_detail->>'invoiceHash','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'A verified invoice is required'; END IF;
 IF coalesce(p_detail->>'start','')!~'^\d{4}-\d{2}-\d{2}$' OR coalesce(p_detail->>'end','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Enter the check-in and check-out dates'; END IF;
 v_start := (p_detail->>'start')::date; v_end := (p_detail->>'end')::date;
 IF v_end<=v_start THEN RAISE EXCEPTION 'Check-out must be after check-in'; END IF;
 v_nights := v_end-v_start;
 IF v_nights>7 THEN RAISE EXCEPTION 'A stay is at most 7 nights'; END IF;
 -- The stay covers the fair: in on or before its last day, out after its first.
 IF v_fair_start IS NOT NULL AND v_fair_end IS NOT NULL AND (v_start>v_fair_end OR v_end<=v_fair_start) THEN
  RAISE EXCEPTION 'The stay must cover the fair''s days, % to %', to_char(v_fair_start,'FMDD Mon'), to_char(v_fair_end,'FMDD Mon YYYY');
 END IF;
 IF coalesce(p_detail->>'male','')!~'^\d{1,2}$' OR coalesce(p_detail->>'female','')!~'^\d{1,2}$' THEN RAISE EXCEPTION 'Check who stayed'; END IF;
 v_pax := (p_detail->>'male')::integer+(p_detail->>'female')::integer;
 IF v_pax<1 OR v_pax>40 THEN RAISE EXCEPTION 'Check who stayed'; END IF;
 -- By head count only. A small group claims its invoice, up to HR's cap a night; a bigger one is
 -- paid per person per night, nothing typed.
 v_group := v_pax<=coalesce(v_rates.airbnb_group_max_pax,3) AND coalesce(v_rates.airbnb_group_cap_per_night,0)>0;
 IF v_group THEN
  IF coalesce(p_detail->>'invoiceAmount','')!~'^\d{1,9}(\.\d{1,2})?$' OR (p_detail->>'invoiceAmount')::numeric<=0 THEN
   RAISE EXCEPTION 'Enter the stay''s total from its invoice';
  END IF;
  v_invoice := round((p_detail->>'invoiceAmount')::numeric,2);
  v_cap := round(v_nights*v_rates.airbnb_group_cap_per_night,2);
  RETURN (p_detail - 'region' - 'regionName' - 'spots' - 'amount' - 'planeTicket' - 'base' - 'threePax')
   || v_fair_facts || jsonb_build_object('category','Airbnb accommodation','region',v_region.id,'regionName',v_region.name,
    'pax',v_pax,'nights',v_nights,'group',true,
    'rate',v_rates.airbnb_group_cap_per_night,'cap',v_cap,'invoiceAmount',v_invoice,'amount',least(v_invoice,v_cap));
 END IF;
 IF coalesce(v_rates.airbnb_rate_per_pax_night,0)<=0 THEN RAISE EXCEPTION 'HR has not set the Airbnb rate yet'; END IF;
 RETURN (p_detail - 'region' - 'regionName' - 'spots' - 'amount' - 'planeTicket' - 'base' - 'threePax' - 'cap' - 'invoiceAmount')
  || v_fair_facts || jsonb_build_object('category','Airbnb accommodation','region',v_region.id,'regionName',v_region.name,
   'pax',v_pax,'nights',v_nights,'group',false,
   'rate',v_rates.airbnb_rate_per_pax_night,'amount',round(v_pax*v_nights*v_rates.airbnb_rate_per_pax_night,2));
END $function$;

-- ── Insight's weeks ──────────────────────────────────────────────────────────
-- Production md5 8d2754143a0849cac12834a64a6392f0. Changed: `brandWeeks` is the
-- ERP's booth for each weekend of the book (was the saved picks); a weekend it
-- names none of falls to Insight's own count of the bills, the second layer.
CREATE OR REPLACE FUNCTION public.member_order_book_for_staff(p_staff uuid, p_scheme uuid, p_from date, p_until date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH scheme AS (
  SELECT c.id,c.sub_department_id,c.enable_kpi,c.deposit_threshold_pct
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), facts AS (
  SELECT f.* FROM public.member_order_facts(p_scheme,p_from,p_until) f WHERE f.staff_id=p_staff
 ), hits AS (
  -- The KPI items of each line, in force at the end of the month its bill is
  -- recognised in (member_order_facts' as-at). None while KPI is off.
  SELECT h.line_id,sum(h.qty) AS qty
  FROM scheme c
  CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi) m
  CROSS JOIN LATERAL public.comm_kpi_hits(p_scheme,
   ARRAY(SELECT f.order_id FROM facts f WHERE f.recognition_month=m.recognition_month),
   (m.recognition_month+interval '1 month - 1 day')::date) h
  GROUP BY h.line_id
 )
 SELECT jsonb_build_object(
  'from',to_char(p_from,'YYYY-MM'),
  'through',to_char((p_until-interval '1 day')::date,'YYYY-MM'),
  'asOf',now(),
  'paysFrom',(SELECT to_char(public.comm_first_paid_month(c.sub_department_id),'YYYY-MM') FROM scheme c),
  'closedMonths',(SELECT coalesce(jsonb_agg(z.m ORDER BY z.m),'[]'::jsonb) FROM (
    SELECT to_char(x.period_month,'YYYY-MM') AS m FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
    WHERE x.staff_id=p_staff AND x.reopened_at IS NULL
    UNION
    SELECT to_char(r.period_month,'YYYY-MM') FROM public.comm_runs r
    JOIN public.comm_schemes rs ON rs.id=r.scheme_id JOIN scheme c ON c.sub_department_id=rs.sub_department_id
    WHERE r.status IN ('applied','locked')) z),
  'brandWeeks',(SELECT coalesce(jsonb_object_agg(w.week::text,w.brand),'{}'::jsonb)
    FROM scheme c CROSS JOIN LATERAL public.member_erp_brand_weeks(c.sub_department_id,p_staff) w
    WHERE w.brand IS NOT NULL AND w.week>=p_from-7 AND w.week<p_until+7),
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',f.order_id,
    'number',f.order_no,
    'ref',nullif(btrim(so.bill_ref),''),
    'customer',coalesce(nullif(btrim(so.customer_name),''),''),
    'date',f.order_date,
    'sourceMonth',to_char(f.source_period,'YYYY-MM'),
    'recognitionMonth',to_char(f.recognition_month,'YYYY-MM'),
    'brand',f.brand,
    'booth',CASE WHEN so.fair_source='erp' AND coalesce(so.raw->'fair'->>'status','')<>'cancelled'
                AND nullif(btrim(so.raw->'fair'->>'brand'),'') IS NOT NULL
           THEN coalesce(public.erp_sync_brand_code(so.raw->'fair'->>'brand'),
                         upper(regexp_replace(btrim(so.raw->'fair'->>'brand'),'\s+',' ','g'))) END,
    'venue',coalesce(nullif(btrim(so.venue),''),''),
    'fairStart',ev.start_date,
    'fairEnd',ev.end_date,
    'organiser',coalesce(org.name,nullif(btrim(ev.erp_organiser_text),'')),
    -- The fair weekend the bill belongs to, named by its Friday (a fair is in
    -- the week it opens); a bill no fair claims, by the week it was written.
    'week',(date_trunc('week',coalesce(ev.start_date,f.order_date))::date+4),
    'revenue',f.revenue,
    'margin',CASE WHEN f.margin_pct IS NULL THEN NULL ELSE round(f.margin_pct*100,2) END,
    'kpiQty',f.kpi_qty,
    'cleared',f.cleared,
    'carried',f.source_period<f.recognition_month,
    'manual',f.manual,
    'total',so.order_total,
    'paid',so.paid_amount,
    'depositNeeded',CASE WHEN c.deposit_threshold_pct IS NULL THEN NULL ELSE round(so.order_total*c.deposit_threshold_pct,2) END,
    'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name',coalesce(nullif(btrim(l.product_name),''),l.product_code,''),
      'code',l.product_code,
      'qty',l.qty,
      'amount',l.line_amount,
      'goods',EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
        AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable),
      'kpiQty',coalesce(h.qty,0))
      ORDER BY l.line_no,l.id),'[]'::jsonb)
     FROM public.sales_order_lines l LEFT JOIN hits h ON h.line_id=l.id
     WHERE l.order_id=f.order_id))
   ORDER BY f.order_date,f.order_no)
  FROM facts f
  CROSS JOIN scheme c
  JOIN public.sales_orders so ON so.id=f.order_id
  LEFT JOIN public.comm_venue_events ev ON ev.id=so.fair_event_id
  LEFT JOIN public.comm_organisers org ON org.id=ev.organiser_id),'[]'::jsonb));
$function$;

-- ── HR's grid (People › Member services › Brand weeks): read only ────────────
-- Production md5 b9476a4b6031bd7421c7ec947310b752. Changed: `erp` — each
-- member's booth the ERP lists for the month's weekends — `unlisted`, whom
-- the ERP lists that the portal cannot name, and `erpReceivedAt`, when the
-- ERP last sent it; no saved picks, no saved-by.
CREATE OR REPLACE FUNCTION public.member_admin_brand_weeks(p_sub_department uuid, p_period text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scheme uuid:=public.member_admin_brand_weeks_scheme(p_sub_department);
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_month date; v_fridays date[]; v_history jsonb;
BEGIN
  -- The month itself: a real one, not in the future.
  PERFORM public.member_arena_clean_week_picks(p_period,'{}'::jsonb);
  v_month:=(p_period||'-01')::date;
  v_fridays:=public.member_arena_month_fridays(v_month);
  v_history:=public.member_arena_booth_history_for_staff(p_sub_department,v_scheme);
  RETURN jsonb_build_object(
    'period',p_period,
    'subDepartmentId',p_sub_department,
    'asOf',now(),
    -- When the ERP last sent its Sales Attending.
    'erpReceivedAt',(SELECT max(d.applied_at) FROM public.erp_attendance_deliveries d),
    'weeks',(SELECT coalesce(jsonb_agg(jsonb_build_object('week',x.week,'closesOn',x.closes_on,
        'locked',v_today>x.closes_on) ORDER BY x.week),'[]'::jsonb)
      FROM (SELECT w AS week,public.member_arena_week_closes_on(w) AS closes_on FROM unnest(v_fridays) w) x),
    'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.staff_id,'name',r.name,'title',r.title,
        'hasLogin',r.has_login) ORDER BY r.name,r.staff_id),'[]'::jsonb)
      FROM public.member_admin_brand_weeks_roster(v_scheme) r),
    -- Where the ERP's Sales Attending lists each member, weekend by weekend.
    'erp',(SELECT coalesce(jsonb_object_agg(x.staff_id,x.weeks),'{}'::jsonb) FROM (
      SELECT w.staff_id,jsonb_object_agg(w.week::text,jsonb_build_object('brand',w.brand,'venue',w.venue,
        'organizer',w.organizer,'start',w.start_date,'end',w.end_date,'booths',w.booths,'fairId',w.fair_id)) AS weeks
      FROM public.member_erp_brand_weeks(p_sub_department) w
      WHERE w.week=ANY(v_fridays) AND w.staff_id IN (SELECT r.staff_id FROM public.member_admin_brand_weeks_roster(v_scheme) r)
      GROUP BY w.staff_id) x),
    -- Nothing is picked any more; a page from before 2026-10-12 still reads the key.
    'picks','{}'::jsonb,
    -- Whom the ERP lists at a booth of the month that the portal cannot name:
    -- no sales order of theirs has come in, or no login over there.
    'unlisted',(SELECT coalesce(jsonb_agg(DISTINCT s.name ORDER BY s.name),'[]'::jsonb)
      FROM public.erp_booth_staff s JOIN public.erp_booths b ON b.erp_project_id=s.erp_project_id
      WHERE lower(b.status) NOT IN ('cancelled','canceled')
        AND (date_trunc('week',b.start_date::timestamp)::date+4)=ANY(v_fridays)
        AND NOT EXISTS (SELECT 1 FROM public.comm_agent_aliases a WHERE a.erp_salesperson_id=s.erp_salesperson_id)),
    -- The booth boards of the month's weeks, as the member app ranks them.
    'events',(SELECT coalesce(jsonb_agg(x.e ORDER BY x.ord),'[]'::jsonb)
      FROM jsonb_array_elements(coalesce(v_history->'events','[]'::jsonb)) WITH ORDINALITY x(e,ord)
      WHERE (x.e->>'week')::date=ANY(v_fridays)));
END $function$;

-- ── Nobody picks a brand week any more ───────────────────────────────────────
-- The member's save (My brand weeks), the Principal's (the member view's back
-- office), HR's (Member services' grid) and the oldest one (a count per
-- brand), with the helper that stored them. member_arena_brand_weeks stays as
-- it is (empty on production: no pick was ever saved) for the reads that
-- still name it.
DROP FUNCTION IF EXISTS public.member_arena_save_brand_week_picks(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.member_principal_save_brand_week_picks(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.member_admin_save_brand_weeks(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.member_arena_save_brand_weeks(uuid, text, integer, jsonb);
DROP FUNCTION IF EXISTS public.member_arena_store_week_picks(uuid, uuid, date, jsonb);

NOTIFY pgrst, 'reload schema';
