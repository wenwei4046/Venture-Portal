-- A visit is marked only with its key handed back on a photo (the owner, 2026-10-28; the photos: 20261028130000). Applied
-- once the app that takes them is live. crm_visit_outcome from production's body (md5 bba1f636…), two checks added: every
-- Show up needs the key returned; a No show too once the key was collected.

CREATE OR REPLACE FUNCTION public.crm_visit_outcome(p_appointment uuid, p_came boolean, p_outcome text, p_amount numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a crm_appointments;
  c crm_contacts;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('mark this visit'); end if;
  if a.state <> 'booked' then raise exception 'This visit is already marked.' using errcode = '22023'; end if;
  if p_came is null or p_outcome not in ('follow_up', 'won', 'lost', 'rebooked') then
    raise exception 'Choose what happened.' using errcode = '22023';
  end if;
  if p_came and a.key_back_path is null then
    raise exception 'Take a photo of the key returned first.' using errcode = '22023';
  end if;
  if not p_came and a.key_out_path is not null and a.key_back_path is null then
    raise exception 'The key was collected: take a photo of it returned first.' using errcode = '22023';
  end if;
  if p_outcome = 'rebooked' and p_came then raise exception 'Rebook is for a No show.' using errcode = '22023'; end if;
  if p_outcome = 'won' and not p_came then raise exception 'A customer who did not come cannot be Won here.' using errcode = '22023'; end if;
  if p_outcome = 'won' and coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount of the sale.' using errcode = '22023'; end if;
  if p_outcome = 'lost' and (p_reason is null or p_reason not in ('too_expensive', 'bought_elsewhere', 'no_response', 'not_suitable', 'not_ready', 'other')) then
    raise exception 'A Lost customer needs a reason.' using errcode = '22023';
  end if;
  if p_outcome = 'lost' and p_reason = 'other' and v_note is null then
    raise exception 'Say what happened when the reason is Other.' using errcode = '22023';
  end if;
  if p_outcome = 'lost' and p_reason = 'no_response' and p_came then
    raise exception 'Unreachable is for a No show.' using errcode = '22023';
  end if;

  update crm_appointments
     set state = case when p_came then 'attended' else 'no_show' end, outcome = p_outcome,
         marked_by = crm_me(), marked_at = now()
   where id = p_appointment returning * into a;

  update crm_contacts set
    status = case p_outcome when 'won' then 'won' when 'lost' then 'lost' when 'rebooked' then status else 'follow_up' end,
    won_amount = case when p_outcome = 'won' then round(p_amount, 2) else won_amount end,
    lost_reason = case when p_outcome = 'lost' then p_reason when p_outcome = 'won' or p_outcome = 'follow_up' then null else lost_reason end,
    lost_note = case when p_outcome = 'lost' and p_reason = 'other' then v_note when p_outcome = 'lost' then null else lost_note end,
    previous_status = null
   where id = a.contact_id returning * into c;
  return to_jsonb(a) || jsonb_build_object('contact_status', c.status, 'won_amount', c.won_amount);
end $function$;
