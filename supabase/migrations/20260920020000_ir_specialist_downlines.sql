-- IR Revenue Specialists may lead downlines, including other Specialists.
-- Recruitment is configured per sub-department ladder; Fair keeps its own rule.
-- Preserve the existing rates, direct-line capacity and reporting assignments.
do $ir$
declare
  v_scheme uuid := 'caeaf2eb-3931-40be-b3bd-b033814f8046';
begin
  -- Other installations need not have this company's IR scheme.
  if not exists (select 1 from public.comm_schemes where id = v_scheme) then
    return;
  end if;

  if (select count(*)
        from public.comm_ranks r
        join public.titles t on t.id = r.title_id
       where r.scheme_id = v_scheme and r.rank_key = 'rs_3'
         and t.name = 'Revenue Specialist') <> 1 then
    raise exception 'IR Revenue Specialist rung has changed. Review its title ladder before enabling downlines.';
  end if;

  update public.comm_ranks
     set can_recruit = true
   where scheme_id = v_scheme and rank_key = 'rs_3'
     and can_recruit is distinct from true;
end;
$ir$;

-- One person may hold independent Fair and IR positions. Following their
-- other scheme's row can hide a cycle in the IR chain being edited.
CREATE OR REPLACE FUNCTION public.comm_hierarchy_reject_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
    v_cursor UUID := NEW.upline_staff_id;
    v_depth  INTEGER := 0;
BEGIN
    WHILE v_cursor IS NOT NULL AND v_depth < 20 LOOP
        IF v_cursor = NEW.staff_id THEN
            RAISE EXCEPTION
                'comm_hierarchy: upline chain for staff % is cyclic', NEW.staff_id;
        END IF;

        SELECT h.upline_staff_id INTO v_cursor
        FROM comm_hierarchy h
        WHERE h.staff_id = v_cursor
          AND h.scheme_id = NEW.scheme_id
          AND h.id IS DISTINCT FROM NEW.id
          AND daterange(h.effective_from, h.effective_to, '[]')
              && daterange(NEW.effective_from, NEW.effective_to, '[]')
        LIMIT 1;

        v_depth := v_depth + 1;
    END LOOP;

    IF v_depth >= 20 THEN
        RAISE EXCEPTION
            'comm_hierarchy: upline chain for staff % exceeds 20 levels', NEW.staff_id;
    END IF;

    RETURN NEW;
END;
$body$;
