-- Notifications are read one by one now (rev 1010 §6, user OK 2026-10-11), so the
-- 500 read keys kept per person must be the NEWEST 500: `select distinct … limit 500`
-- kept an arbitrary 500, and an old key could push out the one just read.
-- Keys are kept oldest → newest; a key read again moves to the end.
--
-- One statement swapped in place in PRODUCTION's body (pg_get_functiondef),
-- refused unless it is there exactly once — the CRM's event trigger
-- (crm_keeps_its_permission_checks) still sees crm_me() / crm_deny untouched.
do $migration$
declare
  v_def text;
  v_old constant text := 'notif_read = case when p_all then ''{}'' else (select array_agg(k) from (select distinct k from unnest(crm_staff_prefs.notif_read || coalesce(p_keys, ''{}'')) k limit 500) x) end;';
  v_new constant text := 'notif_read = case when p_all then ''{}'' else (select array_agg(k order by o) from (select k, max(o) as o from unnest(crm_staff_prefs.notif_read || coalesce(p_keys, ''{}'')) with ordinality as t(k, o) group by k order by max(o) desc limit 500) x) end;';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.proname = 'crm_read_notifs' and p.pronamespace = 'public'::regnamespace;
  if v_def is null then raise exception 'crm_read_notifs is missing'; end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'crm_read_notifs: the keep-500 line is not there exactly once';
  end if;
  execute replace(v_def, v_old, v_new);
end
$migration$;
