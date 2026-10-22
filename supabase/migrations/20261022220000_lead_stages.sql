-- Lead View › Leads v2 (2026-10-22, the redesign v2 handoff `docs/design_handoff_lead_view_inbox/Leads.dc.html` — the
-- user: "照 claude design 最新版本"): every customer who wrote, on a pipeline Customer Service keeps (the salespeople
-- are not in the system) — No phone · Not handed · Handed · Contacted · Appointment · Came · Closed · Lost.
--
-- A conversation keeps WHEN it reached each step past the hand-over, a closed sale's value and why it was lost. Where
-- it stands is worked out from those (lib/leads/stage.ts): lost, else the furthest step reached. The Inbox's
-- Appointment / Came (appt, shown) stay and move with the steps, so both screens say the same.
--
-- Readers: lead_leads(from, to) — by the office day of the last update, either bound NULL = all time. Writers (Lead
-- View · Edit, as the outcome): lead_set_stage, lead_mark_lost, lead_reopen. No table, page or box is new: the
-- registry is not seeded.

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS contacted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS appt_at       timestamptz,
  ADD COLUMN IF NOT EXISTS came_at       timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS sale_value    numeric(15,2) CHECK (sale_value IS NULL OR (sale_value >= 0 AND sale_value < 1000000000)),
  ADD COLUMN IF NOT EXISTS lost_at       timestamptz,
  ADD COLUMN IF NOT EXISTS lost_reason   text NOT NULL DEFAULT '' CHECK (length(lost_reason) <= 200),
  ADD COLUMN IF NOT EXISTS stage_by_name text NOT NULL DEFAULT '' CHECK (length(stage_by_name) <= 120);

-- The card: production's lead_contact_json (mig 20261018110000's) with the steps' keys.
DO $do$
DECLARE
  v_def text := pg_get_functiondef('public.lead_contact_json(public.lead_contacts)'::regprocedure);
  v_old text := '''adLink'', coalesce(a.link, ''''))';
  v_new text := '''adLink'', coalesce(a.link, ''''), ''contactedAt'', c.contacted_at, ''apptAt'', c.appt_at, '
    || '''cameAt'', c.came_at, ''closedAt'', c.closed_at, ''saleValue'', c.sale_value, ''lostAt'', c.lost_at, '
    || '''lostReason'', c.lost_reason, ''stageByName'', c.stage_by_name, ''updatedAt'', c.updated_at)';
BEGIN
  IF position('''contactedAt''' IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF length(v_def) - length(replace(v_def, v_old, '')) <> length(v_old) THEN
    RAISE EXCEPTION 'lead_contact_json is not the body this migration expects';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;

-- Everybody who wrote, by the office day of their last update (a message, or a change to their card).
CREATE OR REPLACE FUNCTION public.lead_leads(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  IF (p_from IS NULL) <> (p_to IS NULL) OR (p_from IS NOT NULL AND (p_to <= p_from OR p_to - p_from > 400)) THEN
    RAISE EXCEPTION 'Pick a period of a year or less, or all time.' USING ERRCODE = '22023';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(public.lead_contact_json(c) ORDER BY greatest(c.last_at, c.updated_at) DESC)
      FROM (SELECT * FROM public.lead_contacts x
             WHERE p_from IS NULL
                OR ((greatest(x.last_at, x.updated_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= p_from
                    AND (greatest(x.last_at, x.updated_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date < p_to)
             ORDER BY greatest(x.last_at, x.updated_at) DESC
             LIMIT 5000) c), '[]'::jsonb);
END
$fn$;

-- A step past the hand-over: handed (back to it), contacted, appt, came, closed (p_value = the sale, RM). The steps
-- before it keep their day (or take now), the ones after it are cleared; a lost lead is open again.
CREATE OR REPLACE FUNCTION public.lead_set_stage(p_contact uuid, p_stage text, p_value numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c public.lead_contacts;
  v_i integer;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'The status needs Lead View · Edit.');
  v_i := array_position(ARRAY['handed', 'contacted', 'appt', 'came', 'closed'], p_stage) - 1;
  IF v_i IS NULL THEN
    RAISE EXCEPTION 'Unknown status.' USING ERRCODE = '22023';
  END IF;
  IF p_value IS NOT NULL AND (p_stage <> 'closed' OR p_value < 0 OR p_value >= 1000000000) THEN
    RAISE EXCEPTION 'A sale value is for a closed lead, in ringgit.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF c.handed_at IS NULL THEN
    RAISE EXCEPTION 'Hand the lead over first.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.lead_contacts SET
    contacted_at = CASE WHEN v_i >= 1 THEN coalesce(contacted_at, now()) END,
    appt_at      = CASE WHEN v_i >= 2 THEN coalesce(appt_at, now()) END,
    came_at      = CASE WHEN v_i >= 3 THEN coalesce(came_at, now()) END,
    closed_at    = CASE WHEN v_i >= 4 THEN coalesce(closed_at, now()) END,
    sale_value   = CASE WHEN v_i >= 4 THEN coalesce(p_value, sale_value) END,
    appt         = CASE WHEN v_i >= 2 THEN 'booked' WHEN appt = 'booked' THEN 'unknown' ELSE appt END,
    shown        = CASE WHEN v_i >= 3 THEN 'came' WHEN shown = 'came' THEN 'unknown' ELSE shown END,
    lost_at      = NULL,
    lost_reason  = '',
    stage_by_name = public.lead_actor_name(),
    updated_at   = now()
  WHERE id = c.id;
  PERFORM public.lead_event(c.id, CASE p_stage
    WHEN 'handed' THEN 'Status: back to handed'
    WHEN 'contacted' THEN 'Contacted by sales'
    WHEN 'appt' THEN 'Appointment booked'
    WHEN 'came' THEN 'Came to the showroom'
    ELSE 'Closed · bought' || CASE WHEN coalesce(p_value, c.sale_value) IS NOT NULL
      THEN ' · RM ' || to_char(coalesce(p_value, c.sale_value), 'FM999,999,990.00') ELSE '' END END);
END
$fn$;

-- Lost, with why. Not for a customer without a phone, nor a closed sale.
CREATE OR REPLACE FUNCTION public.lead_mark_lost(p_contact uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c public.lead_contacts;
  v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'No reason'), 200);
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'The status needs Lead View · Edit.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF c.phone IS NULL THEN
    RAISE EXCEPTION 'A customer with no phone yet is not a lead to lose.' USING ERRCODE = '22023';
  END IF;
  IF c.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This lead is closed — it bought.' USING ERRCODE = '22023';
  END IF;
  IF c.lost_at IS NOT NULL THEN
    RETURN;
  END IF;
  UPDATE public.lead_contacts SET lost_at = now(), lost_reason = v_reason, stage_by_name = public.lead_actor_name(), updated_at = now()
   WHERE id = c.id;
  PERFORM public.lead_event(c.id, 'Marked lost · ' || v_reason);
END
$fn$;

-- A lost lead open again, where it stood before.
CREATE OR REPLACE FUNCTION public.lead_reopen(p_contact uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c public.lead_contacts;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'The status needs Lead View · Edit.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF c.lost_at IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.lead_contacts SET lost_at = NULL, lost_reason = '', stage_by_name = public.lead_actor_name(), updated_at = now()
   WHERE id = c.id;
  PERFORM public.lead_event(c.id, 'Reopened');
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_leads(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_set_stage(uuid, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_mark_lost(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_reopen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_leads(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_set_stage(uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_mark_lost(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_reopen(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
