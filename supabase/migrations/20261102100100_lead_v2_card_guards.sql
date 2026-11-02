-- Lead View v2 › Leads' bulk *Hand over to sales* (2026-11-02, the v2 handoff §7.2): the ticked leads go to their brand's
-- sales group as the Inbox's hand-over does, so handLeadToGroup's gate (lib/leads/actions.ts) names both pages — /leads
-- and /leads/list. Lead View · Edit's boxes are those two pages' and no other's, so a gate on both narrows nothing: with
-- both unticked the cell itself is gone, and lead_need already refuses. The function's page guard (mig
-- 20261027120100, /leads only) would refuse a Leads-only box, so it goes: PRODUCTION's body (md5
-- 3f611e3a93e94b9504c6f32f10763042, checked 2026-11-02) less its one guard line. Dropped and made again, so the
-- registry of guards (src/test/tab-guards-scan.ts) forgets it; its grants as before (authenticated, not anon).

DO $guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_handoff_group(uuid)'::regprocedure) <> '3f611e3a93e94b9504c6f32f10763042' THEN
    RAISE EXCEPTION 'lead_handoff_group is not the body this migration was written from';
  END IF;
END
$guard$;

DROP FUNCTION public.lead_handoff_group(uuid);

CREATE FUNCTION public.lead_handoff_group(p_contact uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.lead_contacts;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'Handing a lead over needs Lead View · Edit.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF c.phone IS NULL THEN
    RAISE EXCEPTION 'Get the customer''s phone before handing them over.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.lead_contacts
     SET handed_sales_id = NULL, handed_at = now(), handed_by = auth.uid(), handed_by_name = public.lead_actor_name(),
         phone_state = 'confirmed', updated_at = now()
   WHERE id = c.id;
  PERFORM public.lead_event(c.id, CASE WHEN c.handed_at IS NULL THEN 'Handed to the sales group' ELSE 'Handed again, to the sales group' END);
END
$function$;

REVOKE ALL ON FUNCTION public.lead_handoff_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_handoff_group(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
