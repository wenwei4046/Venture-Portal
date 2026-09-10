-- ============================================================================
-- MEMBERSHIPS PER SUB-DEPARTMENT (user, 2026-09-10, an hour after ONE LINE)
--
-- "一个人在不同的 sub department，他会有不同的 title … 在 Fair 我的 title 是
--  Team Leader；在 IR 我的 title 是 Senior Team Leader … Lucas report 给
--  Stanley 在 Fair，在 IR 可能是 Stanley report 给 Lucas"
--
-- A sub-department is a world of its own: its own tree, and for each person
-- in it, its own TITLE and its own RANK. So a person may hold one position
-- per sub-department, and a position now carries the title it was earned
-- under. Three things change here:
--
--   1. `comm_hierarchy.title_id` — the title held IN THAT SUB-DEPARTMENT.
--      The company title on `hr_staff_costs` stays what HR calls the person
--      (it grants permissions and draws the People chart); the home
--      sub-department's membership mirrors it, every other sub-department's
--      membership has its own.
--   2. `one_position_at_a_time` (one position per person across every
--      scheme, 2026-08-31) becomes `one_position_per_scheme`. Being paid by
--      two sub-departments is now the design, not the bug: each pays its own
--      orders through its own tree.
--   3. ONE LINE (migration 20260910120000) narrows to the HOME sub-department
--      — the department's oldest active one, Fair. `reports_to` and the
--      company title drive the home membership; other sub-departments are
--      drawn and edited on their own chart, membership by membership.
--
-- The apply-run title ratchet follows: a run raises the title of the
-- MEMBERSHIP it paid, and the company title as well only when the run was the
-- home sub-department's. A rank always follows its membership's title: the
-- floor rung when the membership opens, raised when the title climbs, never
-- lowered — the same ratchet, now inside the position row itself.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The title a membership was earned under.
-- ----------------------------------------------------------------------------

alter table public.comm_hierarchy
  add column if not exists title_id uuid references public.titles(id) on delete set null;

comment on column public.comm_hierarchy.title_id is
  'The title held IN THIS SUB-DEPARTMENT (2026-09-10). Home membership mirrors hr_staff_costs.title_id; every other membership has its own. A run''s ratchet raises this one.';

update public.comm_hierarchy h
   set title_id = s.title_id
  from public.hr_staff_costs s
 where s.id = h.staff_id
   and h.title_id is null;

create index if not exists idx_comm_hierarchy_scheme_open
  on public.comm_hierarchy (scheme_id, staff_id)
  where effective_to is null;

-- ----------------------------------------------------------------------------
-- 2. One position per person PER SCHEME.
-- ----------------------------------------------------------------------------

alter table public.comm_hierarchy drop constraint if exists one_position_at_a_time;

alter table public.comm_hierarchy
  add constraint one_position_per_scheme exclude using gist (
    scheme_id with =,
    staff_id with =,
    daterange(effective_from, effective_to, '[]') with &&
  );

comment on constraint one_position_per_scheme on public.comm_hierarchy is
  'A person holds at most one open position per sub-department. Several sub-departments at once is the design (2026-09-10): each pays its own orders through its own tree.';

-- ----------------------------------------------------------------------------
-- 3. Rank follows the membership's title — inside the row.
--
-- BEFORE INSERT OR UPDATE OF title_id: a membership opened with a title and
-- no rank gets the title's floor rung on this scheme; a title raised to one
-- whose floor stands above the rank raises the rank. Nothing here lowers one.
-- A title the scheme's ladder does not carry cannot open a membership —
-- there is no rank to pay from — and says so (SQLSTATE 23RNK).
-- ----------------------------------------------------------------------------

create or replace function public.comm_hierarchy_rank_follows_title()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_floor uuid;
  v_name  text;
begin
  if new.title_id is null then
    if new.rank_id is null then
      raise exception 'A position needs a title on this sub-department''s ladder before it can have a rank'
        using errcode = '23RNK';
    end if;
    return new;
  end if;

  v_floor := public.comm_floor_rank(new.scheme_id, new.title_id);

  if v_floor is null then
    if new.rank_id is null then
      select name into v_name from public.titles where id = new.title_id;
      raise exception '% has no rung on this sub-department''s ladder — give it a rank under Rules › Title ladder first',
        coalesce(v_name, 'That title')
        using errcode = '23RNK';
    end if;
    return new;
  end if;

  if new.rank_id is null
     or (tg_op = 'UPDATE' and new.title_id is distinct from old.title_id
         and (select sort_order from public.comm_ranks where id = v_floor)
           > (select sort_order from public.comm_ranks where id = new.rank_id)) then
    new.rank_id := v_floor;
  end if;

  return new;
end;
$$;

drop trigger if exists comm_hierarchy_rank_follows_title on public.comm_hierarchy;
create trigger comm_hierarchy_rank_follows_title
  before insert or update of title_id on public.comm_hierarchy
  for each row execute function public.comm_hierarchy_rank_follows_title();

-- ----------------------------------------------------------------------------
-- 4. The home sync now writes the title too, and only the home scheme.
-- ----------------------------------------------------------------------------

create or replace function public.comm_sync_position(p_staff_id uuid, p_actor uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status      text;
  v_reports_to  uuid;
  v_title       uuid;
  v_department  uuid;
  v_on_comm     boolean;
  cur           public.comm_hierarchy%rowtype;
  v_scheme      uuid;
  v_floor       uuid;
  v_rank        uuid;
  v_from        date := public.comm_period_start();
begin
  select s.status, s.reports_to, s.title_id, s.department_id,
         coalesce(d.payroll_source = 'commission', false)
    into v_status, v_reports_to, v_title, v_department, v_on_comm
    from public.hr_staff_costs s
    left join public.departments d on d.id = s.department_id
   where s.id = p_staff_id;
  if not found then
    return;
  end if;

  -- Inactive people are on neither chart. Their positions are left exactly as
  -- they are: closing them at the end of last month would drop the commission
  -- of the month they left in, and that is payroll's call, not a trigger's.
  if v_status <> 'active' then
    return;
  end if;

  -- The HOME sub-department: the one `reports_to` and the company title
  -- describe. Other sub-departments' memberships are their own charts'
  -- business and are never touched from here.
  v_scheme := public.comm_scheme_for_department(v_department);

  if not v_on_comm then
    -- Left the commission department: every membership closes, along with
    -- the reporting line that no longer exists there.
    for cur in
      select h.* from public.comm_hierarchy h
       where h.staff_id = p_staff_id and h.effective_to is null
    loop
      if cur.effective_from >= v_from then
        delete from public.comm_hierarchy where id = cur.id;
      else
        update public.comm_hierarchy set effective_to = v_from - 1 where id = cur.id;
      end if;
    end loop;
    return;
  end if;

  -- A commission department with no live scheme yet has nothing to hold a
  -- position in. This is a setup gap, not a fact about the person.
  if v_scheme is null then
    return;
  end if;

  select h.* into cur
    from public.comm_hierarchy h
   where h.staff_id = p_staff_id
     and h.scheme_id = v_scheme
     and h.effective_to is null
   order by h.effective_from desc
   limit 1;

  v_floor := public.comm_floor_rank(v_scheme, v_title);

  if cur.id is null then
    v_rank := v_floor;
  else
    v_rank := cur.rank_id;
    -- The ratchet: a title whose floor stands above the rank raises the rank;
    -- nothing here ever lowers one.
    if v_floor is not null and v_floor <> cur.rank_id
       and (select sort_order from public.comm_ranks where id = v_floor)
         > (select sort_order from public.comm_ranks where id = cur.rank_id) then
      v_rank := v_floor;
    end if;
  end if;

  -- No rung for their title on the home ladder: no rank yet, and `rank_id` is
  -- NOT NULL. The chart says so; a membership they already hold is kept.
  if v_rank is null then
    return;
  end if;

  -- Already the truth.
  if cur.id is not null
     and cur.upline_staff_id is not distinct from v_reports_to
     and cur.rank_id = v_rank
     and cur.title_id is not distinct from v_title then
    return;
  end if;

  -- Started this month: nothing has been computed from it, edit in place.
  if cur.id is not null and cur.effective_from >= v_from then
    update public.comm_hierarchy
       set upline_staff_id = v_reports_to,
           rank_id = v_rank,
           title_id = v_title
     where id = cur.id;
    return;
  end if;

  -- Older: close it and open the replacement from this month. The ranges abut
  -- without overlapping, which is what `one_position_per_scheme` demands.
  if cur.id is not null then
    update public.comm_hierarchy set effective_to = v_from - 1 where id = cur.id;
  end if;

  insert into public.comm_hierarchy
    (scheme_id, staff_id, title_id, upline_staff_id, rank_id, rate_mode, effective_from, created_by)
  values
    (v_scheme, p_staff_id, v_title, v_reports_to, v_rank, cur.rate_mode, v_from, p_actor);
end;
$$;

comment on function public.comm_sync_position(uuid, uuid) is
  'Derive one person''s HOME sub-department membership from hr_staff_costs: upline = reports_to, title = the company title, rank = that title''s floor (ratcheted up only). Other sub-departments'' memberships are never touched. Effective-dated. Called by trigger; not for direct use.';

-- The recruit rule on the company reporting line asks the HOME ladder, not
-- every ladder in the department — a title that may lead in IR says nothing
-- about who it may lead in Fair.
create or replace function public.comm_title_can_recruit(p_department_id uuid, p_title_id uuid)
returns boolean
language sql
stable
as $$
  select bool_or(r.can_recruit)
    from public.comm_ranks r
   where r.scheme_id = public.comm_scheme_for_department(p_department_id)
     and r.title_id = p_title_id
$$;

-- The same question for one scheme: may a member holding this title lead
-- here? Null when this ladder does not carry the title.
create or replace function public.comm_title_can_recruit_in(p_scheme_id uuid, p_title_id uuid)
returns boolean
language sql
stable
as $$
  select bool_or(r.can_recruit)
    from public.comm_ranks r
   where r.scheme_id = p_scheme_id
     and r.title_id = p_title_id
$$;

-- ----------------------------------------------------------------------------
-- 5. The apply-run ratchet raises the MEMBERSHIP title — and the company
--    title as well only for the home sub-department.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_commission_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role         TEXT := current_user_role();
    v_run          comm_runs%ROWTYPE;
    v_blocked      INTEGER;
    v_payroll_run  TEXT;
    v_staff        INTEGER := 0;
    v_released     INTEGER := 0;
    v_promoted     INTEGER := 0;
    v_clash        TEXT;
    v_p            RECORD;
    v_hit_pos      INTEGER;
    v_cur_pos      INTEGER;
    v_title_name   TEXT;
    v_ladder_msg   TEXT;
    v_home_scheme  UUID;
BEGIN
    IF v_role NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may apply a commission run';
    END IF;

    SELECT * INTO v_run FROM comm_runs WHERE id = p_run_id FOR UPDATE;
    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    IF v_run.status <> 'computed' THEN
        RAISE EXCEPTION 'Only a computed run can be applied — this one is %', v_run.status;
    END IF;

    -- The warnings are not advisory. Every one of them is a case where the run
    -- knows it paid the wrong amount: an unclassified item group, a
    -- salesperson with sales and no rank, a placement that should not exist.
    IF jsonb_array_length(COALESCE(v_run.warnings, '[]'::JSONB)) > 0 THEN
        RAISE EXCEPTION 'This run has % unresolved warning(s). Clear them and recompute before applying.',
            jsonb_array_length(v_run.warnings);
    END IF;

    -- Invariant 4, half one: the payroll RUN for the month must still be open.
    SELECT status::TEXT INTO v_payroll_run
      FROM payroll_runs
     WHERE period_month = v_run.period_month
       AND status IN ('submitted', 'approved', 'paid')
     ORDER BY CASE status WHEN 'paid' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END
     LIMIT 1;
    IF v_payroll_run IS NOT NULL THEN
        RAISE EXCEPTION 'The % payroll run is % — reopen it before changing commission',
            to_char(v_run.period_month, 'Mon YYYY'), v_payroll_run;
    END IF;

    -- Invariant 4, half two: and so must every row we are about to write.
    SELECT COUNT(*) INTO v_blocked
      FROM comm_statements s
      JOIN hr_monthly_payroll p
        ON p.staff_id = s.staff_id AND p.period_month = v_run.period_month
     WHERE s.run_id = p_run_id AND p.status <> 'draft';

    IF v_blocked > 0 THEN
        RAISE EXCEPTION '% payroll row(s) for % are no longer draft — commission cannot be written into a submitted month',
            v_blocked, to_char(v_run.period_month, 'Mon YYYY');
    END IF;

    -- Invariant 5, checked before writing anything so the message names the
    -- order rather than surfacing a raw constraint violation.
    SELECT r.order_no INTO v_clash
      FROM jsonb_array_elements(v_run.released_orders) AS o
      JOIN comm_order_releases r ON r.order_no = o ->> 'order_no'
     WHERE r.run_id <> p_run_id
     LIMIT 1;

    IF v_clash IS NOT NULL THEN
        RAISE EXCEPTION 'Order % has already been paid by an earlier run. Recompute this month so it is excluded.', v_clash;
    END IF;

    -- ── Payroll ────────────────────────────────────────────────────────────
    -- commission_amount is the ONLY payroll field this module writes. Since
    -- 2026-09-10 several sub-departments may pay the same person the same
    -- month, so the figure is the SUM of every applied run's statement for
    -- that person and month: this run's, plus whatever other sub-departments
    -- have already applied. A re-apply of this sub-department replaces only
    -- its own share (the earlier run was reopened, so it is not 'applied').
    INSERT INTO hr_monthly_payroll (staff_id, period_month, commission_amount, source, status, created_by)
    SELECT s.staff_id,
           v_run.period_month,
           s.total_commission + COALESCE((
             SELECT SUM(os.total_commission)
               FROM comm_statements os
               JOIN comm_runs orr ON orr.id = os.run_id
              WHERE os.staff_id = s.staff_id
                AND orr.period_month = v_run.period_month
                AND orr.status = 'applied'
                AND orr.id <> p_run_id
           ), 0),
           'commission', 'draft', auth.uid()
      FROM comm_statements s
     WHERE s.run_id = p_run_id
    ON CONFLICT (staff_id, period_month) DO UPDATE
       SET commission_amount = EXCLUDED.commission_amount,
           source            = 'commission',
           updated_at        = NOW();

    GET DIAGNOSTICS v_staff = ROW_COUNT;

    -- ── Releases ───────────────────────────────────────────────────────────
    INSERT INTO comm_order_releases (
        order_no, run_id, staff_id, period_month, order_period_month, product_revenue
    )
    SELECT
        o ->> 'order_no',
        p_run_id,
        (o ->> 'staff_id')::UUID,
        v_run.period_month,
        (o ->> 'order_period_month')::DATE,
        COALESCE((o ->> 'product_revenue')::DECIMAL, 0)
      FROM jsonb_array_elements(v_run.released_orders) AS o
    ON CONFLICT (order_no) DO NOTHING;

    GET DIAGNOSTICS v_released = ROW_COUNT;

    -- ── The title ratchet ──────────────────────────────────────────────────
    -- "Title 只会上，不会下" (user 2026-09-02). The month somebody is PAID a
    -- rank whose title sits higher on this ladder than the title they hold
    -- HERE, their membership's title is raised to it and stays there. The
    -- rank follows inside the row (comm_hierarchy_rank_follows_title).
    --
    -- The company title rises with it only when this run is the HOME
    -- sub-department's — that is the title HR calls them by and the People
    -- chart draws. An IR promotion is IR's; Fair's is everybody's.
    FOR v_p IN
        SELECT s.staff_id, s.rank_title_id, h.id AS membership_id,
               h.title_id AS current_title_id, st.employee_name, st.department_id
          FROM comm_statements s
          JOIN comm_hierarchy h
            ON h.staff_id = s.staff_id AND h.scheme_id = v_run.scheme_id AND h.effective_to IS NULL
          JOIN hr_staff_costs st ON st.id = s.staff_id
         WHERE s.run_id = p_run_id
           AND s.rank_title_id IS NOT NULL
           AND s.rank_title_id IS DISTINCT FROM h.title_id
    LOOP
        SELECT MIN(sort_order) INTO v_hit_pos
          FROM comm_ranks
         WHERE scheme_id = v_run.scheme_id AND title_id = v_p.rank_title_id;
        SELECT MIN(sort_order) INTO v_cur_pos
          FROM comm_ranks
         WHERE scheme_id = v_run.scheme_id AND title_id = v_p.current_title_id;

        IF v_hit_pos IS NOT NULL AND (v_cur_pos IS NULL OR v_hit_pos > v_cur_pos) THEN
            SELECT name INTO v_title_name FROM titles WHERE id = v_p.rank_title_id;

            UPDATE comm_hierarchy
               SET title_id = v_p.rank_title_id
             WHERE id = v_p.membership_id;

            v_home_scheme := comm_scheme_for_department(v_p.department_id);
            IF v_home_scheme = v_run.scheme_id THEN
                -- `designation` mirrors the title's name (titles migration,
                -- 2026-09-01): the payroll export reads it.
                --
                -- hr_staff_respects_ladder (the People org chart's rule,
                -- SQLSTATE 23LAD) may refuse this if the raised title would
                -- stand above the person's reports_to line on the company
                -- ladder. That is a People-chart fact commission cannot
                -- settle, so the apply stops here, says whose line it is, and
                -- the whole month rolls back.
                BEGIN
                    UPDATE hr_staff_costs
                       SET title_id = v_p.rank_title_id,
                           designation = v_title_name
                     WHERE id = v_p.staff_id;
                EXCEPTION WHEN SQLSTATE '23LAD' THEN
                    v_ladder_msg := SQLERRM;
                    RAISE EXCEPTION 'Could not raise %''s title to % — %. Fix their reporting line on People (or where that title sits on the company ladder), then apply again.',
                        v_p.employee_name, v_title_name, v_ladder_msg;
                END;
            END IF;

            INSERT INTO comm_title_promotions (
                run_id, staff_id, period_month, from_title_id, to_title_id, promoted_by
            )
            VALUES (
                p_run_id, v_p.staff_id, v_run.period_month,
                v_p.current_title_id, v_p.rank_title_id, auth.uid()
            );

            v_promoted := v_promoted + 1;
        END IF;
    END LOOP;

    UPDATE comm_runs
       SET status = 'applied', applied_at = NOW(), applied_by = auth.uid()
     WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'run_id', p_run_id,
        'period_month', v_run.period_month,
        'staff_written', v_staff,
        'orders_released', v_released,
        'titles_promoted', v_promoted,
        'total_commission', v_run.total_commission
    );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 6. Reopening a run gives back only THIS sub-department's share of the
--    month's commission; another sub-department's applied share stays.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reopen_commission_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role        TEXT := current_user_role();
    v_run         comm_runs%ROWTYPE;
    v_payroll_run TEXT;
    v_blocked     INTEGER;
    v_zeroed      INTEGER := 0;
    v_dropped     INTEGER := 0;
BEGIN
    IF v_role NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may reopen a commission run';
    END IF;

    SELECT * INTO v_run FROM comm_runs WHERE id = p_run_id FOR UPDATE;
    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    IF v_run.status NOT IN ('applied', 'computed') THEN
        RAISE EXCEPTION 'Nothing to reopen — the run is %', v_run.status;
    END IF;

    SELECT status::TEXT INTO v_payroll_run
      FROM payroll_runs
     WHERE period_month = v_run.period_month
       AND status IN ('submitted', 'approved', 'paid')
     ORDER BY CASE status WHEN 'paid' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END
     LIMIT 1;
    IF v_payroll_run IS NOT NULL THEN
        RAISE EXCEPTION 'The % payroll run is % — reopen that first',
            to_char(v_run.period_month, 'Mon YYYY'), v_payroll_run;
    END IF;

    SELECT COUNT(*) INTO v_blocked
      FROM comm_statements s
      JOIN hr_monthly_payroll p
        ON p.staff_id = s.staff_id AND p.period_month = v_run.period_month
     WHERE s.run_id = p_run_id AND p.status <> 'draft';

    IF v_blocked > 0 THEN
        RAISE EXCEPTION '% payroll row(s) for % are no longer draft',
            v_blocked, to_char(v_run.period_month, 'Mon YYYY');
    END IF;

    IF v_run.status = 'applied' THEN
        -- Not zero: what the OTHER sub-departments' applied runs still pay
        -- this person for the month. This run is still 'applied' here, so it
        -- is excluded by id rather than by status.
        UPDATE hr_monthly_payroll p
           SET commission_amount = COALESCE((
                 SELECT SUM(os.total_commission)
                   FROM comm_statements os
                   JOIN comm_runs orr ON orr.id = os.run_id
                  WHERE os.staff_id = p.staff_id
                    AND orr.period_month = v_run.period_month
                    AND orr.status = 'applied'
                    AND orr.id <> p_run_id
               ), 0),
               updated_at = NOW()
          FROM comm_statements s
         WHERE s.run_id = p_run_id
           AND p.staff_id = s.staff_id
           AND p.period_month = v_run.period_month;
        GET DIAGNOSTICS v_zeroed = ROW_COUNT;

        DELETE FROM comm_order_releases WHERE run_id = p_run_id;
        GET DIAGNOSTICS v_dropped = ROW_COUNT;
    END IF;

    UPDATE comm_runs
       SET status = 'draft', applied_at = NULL, applied_by = NULL,
           reopened_at = NOW(), reopened_by = auth.uid()
     WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'run_id', p_run_id,
        'payroll_rows_zeroed', v_zeroed,
        'releases_dropped', v_dropped
    );
END;
$function$;


-- ----------------------------------------------------------------------------
-- Guard: every open membership carries a title, and every active person's home
-- membership still tells the truth about their line and their company title.
-- ----------------------------------------------------------------------------

do $$
declare
  v_untitled integer;
  v_drift    integer;
begin
  select count(*) into v_untitled
    from public.comm_hierarchy h
    join public.hr_staff_costs s on s.id = h.staff_id
   where h.effective_to is null
     and h.title_id is null
     and s.title_id is not null;

  select count(*) into v_drift
    from public.comm_hierarchy h
    join public.hr_staff_costs s on s.id = h.staff_id
   where h.effective_to is null
     and s.status = 'active'
     and h.scheme_id = public.comm_scheme_for_department(s.department_id)
     and (h.upline_staff_id is distinct from s.reports_to
          or h.title_id is distinct from s.title_id);

  if v_untitled > 0 or v_drift > 0 then
    raise exception 'memberships: % open positions without a title, % home memberships off the roster',
      v_untitled, v_drift;
  end if;
end
$$;
