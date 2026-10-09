-- The Principal / Director in someone's chat keep Share and Move beside Assign
-- to (user 2026-10-09: 3个功能都要有 share, move, assign). Move hands a
-- customer to the direct superior — of the person whose customer it is when
-- the Principal / Director move it for them (they have no superior of their
-- own in the CRM, so "your direct superior" refused them). Share already let
-- them invite anyone (crm_sees_all).
--
-- One statement swapped in place in PRODUCTION's body (pg_get_functiondef),
-- refused unless it is there exactly once.
do $migration$
declare
  v_def text;
  v_old constant text := 'v_up := crm_upline_of(v_me);';
  v_new constant text := 'v_up := case when crm_sees_all() and c.assigned_to is not null and c.assigned_to <> v_me then crm_upline_of(c.assigned_to) else crm_upline_of(v_me) end;';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.proname = 'crm_invite' and p.pronamespace = 'public'::regnamespace;
  if v_def is null then raise exception 'crm_invite is missing'; end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'crm_invite: the move line is not there exactly once';
  end if;
  execute replace(v_def, v_old, v_new);
end
$migration$;
