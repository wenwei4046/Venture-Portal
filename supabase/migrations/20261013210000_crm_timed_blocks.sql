-- CRM round 2 (rev 1011 §8, user OK 2026-10-13): a showroom's blocked dates can close set hours instead of the whole day.
-- A block in crm_showrooms.blocks (jsonb, saved as written by crm_save_showroom_full) may carry t1 / t2 ("HH:MM"): then
-- only a slot starting at or after t1 and before t2 is closed on those dates; a block without them still closes the day.
-- The app asks the same (sales/vm/chat.ts › roomClosed / slotBlocked).
--
-- Production's body of 2026-10-13 (md5(prosrc) 5542256434ad30ae2dc26207258e95e3); only the closed-day check changes: a
-- whole-day block keeps "closed that day", a timed one answers "closed at that time".
CREATE OR REPLACE FUNCTION public.crm_slot_check(p_showroom text, p_start timestamp with time zone, p_except uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r       crm_showrooms;
  v_local timestamp := p_start at time zone 'Asia/Kuala_Lumpur';
  v_date  text := to_char(v_local, 'YYYY-MM-DD');
  v_hhmm  text := to_char(v_local, 'HH24:MI');
  v_mon0  text := ((extract(isodow from v_local)::int + 6) % 7)::text; -- 0 = Monday
  v_taken integer;
begin
  select * into r from crm_showrooms where id = trim(p_showroom);
  if r.id is null or not r.active then raise exception 'Choose a showroom that is open.' using errcode = '22023'; end if;
  if extract(dow from v_local)::int = any (r.weekly)
     or exists (select 1 from jsonb_array_elements(r.blocks) b where v_date between b ->> 'a' and coalesce(b ->> 'b', b ->> 'a')
                  and (coalesce(b ->> 't1', '') = '' or coalesce(b ->> 't2', '') = '')) then
    raise exception '% is closed that day.', r.name using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(r.blocks) b where v_date between b ->> 'a' and coalesce(b ->> 'b', b ->> 'a')
               and coalesce(b ->> 't1', '') <> '' and coalesce(b ->> 't2', '') <> ''
               and v_hhmm >= b ->> 't1' and v_hhmm < b ->> 't2') then
    raise exception '% is closed at that time.', r.name using errcode = '22023';
  end if;
  if not exists (select 1 from unnest(r.slots) s
                  where split_part(s, '@', 1) = v_hhmm
                    and (position('@' in s) = 0 or position(v_mon0 in split_part(s, '@', 2)) > 0)) then
    raise exception '% does not take bookings at that time.', r.name using errcode = '22023';
  end if;
  select count(*) into v_taken from crm_appointments
   where showroom = r.id and start_at = p_start and state = 'booked' and id is distinct from p_except;
  if v_taken >= r.cap then raise exception 'That time is full at %. Choose another.', r.name using errcode = '22023'; end if;
end $function$;
