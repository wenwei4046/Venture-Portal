-- A reply from anyone clears the chat's unread count (user 2026-10-09, choice B:
-- 谁回复都清零). Before, only the customer's own salesperson's reply did, so a
-- chat the Principal or the Director had already answered stayed "11 unread"
-- for its owner, inviting a second answer. Opening a chat still clears it only
-- for its owner (crm_mark_read): a manager looking in leaves the owner's
-- reminder alone.
--
-- One statement swapped in place in PRODUCTION's bodies (pg_get_functiondef),
-- refused unless it is there exactly once — crm_record_reply has drifted from
-- its last migration copy, so neither function is re-created from a file.
do $migration$
declare
  v_fn   text;
  v_def  text;
  v_old  constant text := 'unread = case when assigned_to = v_me then 0 else unread end';
  v_new  constant text := 'unread = 0';
begin
  foreach v_fn in array array['crm_record_out', 'crm_record_reply'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p where p.proname = v_fn and p.pronamespace = 'public'::regnamespace;
    if v_def is null then raise exception '% is missing', v_fn; end if;
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
      raise exception '%: the unread line is not there exactly once', v_fn;
    end if;
    execute replace(v_def, v_old, v_new);
  end loop;
end
$migration$;
