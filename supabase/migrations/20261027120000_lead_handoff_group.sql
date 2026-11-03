-- Lead View › hand a lead to the brand's sales GROUP (2026-10-27 — the user: no salespeople in Lead View for now,
-- "客服可能就复制了，直接发到他们WA 群组中，有需要我再加", then "1": copy the message for the WhatsApp group and still count
-- the hand-over; .claude/rules/leads/lead-view.md › HANDED TO THE SALES GROUP).
--
-- A hand-over no longer needs a salesperson: handed_at with no handed_sales_id = "to the sales group". Every reader
-- already decides "handed" by handed_at and joins the salesperson LEFT (lead_contact_json), so such a lead shows as
-- handed with no name. The CHECK keeps the other half: a salesperson is never named on a lead that is not handed.
--
-- lead_handoff_group(contact) is lead_handoff (production's body) without the salesperson: Lead View · Edit, a phone
-- first, the phone confirmed, the timeline told. Its page guard (/leads, as lead_handoff's) comes in 20261027120100.

ALTER TABLE public.lead_contacts DROP CONSTRAINT lead_contacts_handed;
ALTER TABLE public.lead_contacts ADD CONSTRAINT lead_contacts_handed CHECK (handed_sales_id IS NULL OR handed_at IS NOT NULL);

CREATE OR REPLACE FUNCTION public.lead_handoff_group(p_contact uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
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
$fn$;
REVOKE ALL ON FUNCTION public.lead_handoff_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_handoff_group(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
