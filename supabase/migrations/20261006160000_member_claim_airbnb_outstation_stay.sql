-- ════════════════════════════════════════════════════════════════════════════
-- Airbnb is for an outstation fair only, and a stay is at most 7 nights around
-- its fair (2026-10-06, user: "airbnb only allow claim outstation fair, then
-- date stay limit in 7 days")
--
-- Until now an Airbnb claim never asked where its fair was: a member's brand
-- week at MID VALLEY (KL, local) could claim a stay as readily as one in Penang,
-- and its dates were checked only against each other — up to 31 nights, any
-- dates at all. Now, in `member_claim_detail_for`:
--
--   1. THE FAIR IS OUTSTATION. The region HR set for the fair's venue (the same
--      lookup an outstation claim makes) must be away from the base — spots
--      above 0, or flown to. A local venue (KL, 0 spots) has no Airbnb claim; a
--      venue without a region cannot be claimed for until HR sets one.
--   2. AT MOST 7 NIGHTS (check-out − check-in), down from 31.
--   3. THE STAY COVERS THE FAIR: in on or before its last day and out after its
--      first. A fair 25–27 Sep takes 24→28, 27→28 (the last night), 21→28 (7
--      nights); not 23→25 (out the day it opens) nor 1→3 Sep.
--
-- The stored claim now names the fair's region (`region`, `regionName`) for HR.
-- Outstation claims are unchanged. Money: no claim exists yet (0 requests).
--
-- `member_claim_detail_for` was taken from 20261006150000, whose body equals
-- production's (md5 98ee5e2869d0fc6f1a4c9c3ea40b5ab8, checked before this was
-- written). Rollback: that body.
-- ════════════════════════════════════════════════════════════════════════════

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
  RAISE EXCEPTION 'A claim is for your own brand week, and you have none that weekend. Pick it in My brand weeks, or ask HR.';
 END IF;
 v_fair := (v_booth->>'fairId')::uuid;
 SELECT e.venue_key, coalesce(nullif(btrim(v.display_name),''), e.venue_key), e.start_date, e.end_date INTO v_venue_key, v_venue, v_fair_start, v_fair_end
  FROM public.comm_venue_events e LEFT JOIN public.comm_venues v ON v.venue_key=e.venue_key WHERE e.id=v_fair;
 -- What the claim is for comes from the database's own records, over whatever the phone sent.
 v_fair_facts := jsonb_build_object('week',v_week,'fairId',v_fair,'brand',v_booth->>'brand','location',v_venue,
  'venueKey',v_venue_key,'brandWeekPicked',coalesce((v_booth->>'picked')::boolean,false));
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
