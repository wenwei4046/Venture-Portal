-- Showrooms: which ones hand a unit's key over, and their order (the owner, 2026-10-29: "showroom 加一个开关，如果那个
-- showroom 需要自己拿钥匙，我打开后在 apps 就会有昨天加的上传照片的功能 … 我可以移动 showroom 的顺序").
--
-- crm_showrooms.key_handover: on, a visit there takes the key photos on the phone (collected, then returned) and is marked
-- Show up only with the key returned, No show too once collected; off (the default), a visit is marked as before the
-- photos. crm_visit_outcome (production's body, md5 ec61dad6…) asks the showroom before the two key checks — online and
-- elsewhere visits (their showroom is a label, no row) ask none. Written by crm_set_showroom_keys; the order by
-- crm_set_showroom_order (sort_order by position). Both CRM · Manage (crm_manages).

ALTER TABLE public.crm_showrooms ADD COLUMN IF NOT EXISTS key_handover boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.crm_set_showroom_keys(p_id text, p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not crm_manages() then perform crm_deny('change showrooms'); end if;
  update crm_showrooms set key_handover = coalesce(p_on, false) where id = p_id;
  if not found then raise exception 'That showroom is not there any more.' using errcode = '22023'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_set_showroom_order(p_ids text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not crm_manages() then perform crm_deny('change showrooms'); end if;
  update crm_showrooms s set sort_order = o.n
    from unnest(coalesce(p_ids, '{}')) with ordinality as o(id, n)
   where s.id = o.id;
end $function$;

REVOKE ALL ON FUNCTION public.crm_set_showroom_keys(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_set_showroom_order(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_set_showroom_keys(text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_set_showroom_order(text[]) TO authenticated, service_role;

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
  v_keys boolean;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('mark this visit'); end if;
  if a.state <> 'booked' then raise exception 'This visit is already marked.' using errcode = '22023'; end if;
  if p_came is null or p_outcome not in ('follow_up', 'won', 'lost', 'rebooked') then
    raise exception 'Choose what happened.' using errcode = '22023';
  end if;
  select coalesce(bool_or(s.key_handover), false) into v_keys from crm_showrooms s where s.id = a.showroom;
  if v_keys and p_came and a.key_back_path is null then
    raise exception 'Take a photo of the key returned first.' using errcode = '22023';
  end if;
  if v_keys and not p_came and a.key_out_path is not null and a.key_back_path is null then
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
