-- Fund contra (2026-11-04 — the user: "我想要这个contra 功能"; then, asked: the Principal approves first; companies may
-- differ, notes optional; one to many, many to one, many to many; each line principal and / or interest; "照理是A, 但也
-- 有可能是contra 本金，但是venture 还是要给利息或收利息" — interest offset is HV's income / expense, and a principal-only
-- contra leaves the interest to be paid in cash as before). A loan HV lent (Fund OUT) and a deposit HV holds (Fund IN)
-- knocked off against each other — no bank moves.
--
--   fund_contras        one contra: its day, notes, total, pending → approved | rejected | withdrawn, its approval and,
--                       once approved, its journal entry.
--   fund_contra_lines   each loan (side 'loan') and fund source (side 'source') in it, with the principal and the
--                       interest it takes off. The two sides' totals are equal.
--   file_fund_contra    Treasury · Create (Fund OUT's or Fund IN's page). Checks every deal is live and owes at least the
--                       principal taken, the sides balance, no deal is in another contra still waiting.
--   approve_fund_contra the Principal (the type has no domain, as a terms change): checks again, posts ONE journal entry —
--                         Cr the borrower's 3020 leaf (loan principal) · Cr 5027 Loan Interest (loan interest)
--                         Dr the fund source's own account (its principal) · Dr 6000 Interest Expense (its interest)
--                       — writes each side's repayment rows (a loan's principal / interest; a fund source's principal as
--                       'netting', its interest as 'interest'), the Venture Pool rows a cash repayment would have
--                       written (a loan's principal back in; a fund source's principal and interest out), and marks both
--                       rows approved, in one transaction: a refusal anywhere leaves nothing.
--   reject              as a terms change's (a contra still waiting is rejected in Approvals, its note kept).
--   undo_fund_contra    Treasury · Void, at once (the user: "有 Void 权限就直接撤回"): an approved contra taken back whole —
--                       a reversing entry (dated the contra's day, or today when that month is locked, as a repayment's
--                       void), its repayment rows removed, the Venture Pool rows countered (loan_repayment_in → fund_out,
--                       expense_out → profit_in), a deal the contra had closed active again; the contra 'reversed'.
--
-- A repayment row a contra wrote carries `fund_contra_id`; it cannot be voided, re-dated or changed on its own (the
-- contra's other side and its entry would be left standing) — a trigger refuses it.

alter type approval_request_type add value if not exists 'fund_contra';

create table if not exists fund_contras (
  id               uuid primary key default gen_random_uuid(),
  contra_date      date not null,
  notes            text,
  total            numeric(15, 2) not null check (total > 0),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'reversed')),
  approval_id      uuid references approval_requests (id),
  journal_entry_id uuid,
  reversal_journal_entry_id uuid,
  reversed_by      uuid,
  reversed_at      timestamptz,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text
);
create index if not exists fund_contras_approval_idx on fund_contras (approval_id);

create table if not exists fund_contra_lines (
  id             uuid primary key default gen_random_uuid(),
  contra_id      uuid not null references fund_contras (id) on delete cascade,
  side           text not null check (side in ('loan', 'source')),
  loan_id        uuid references loans (id),
  fund_source_id uuid references fund_sources (id),
  principal      numeric(15, 2) not null default 0 check (principal >= 0),
  interest       numeric(15, 2) not null default 0 check (interest >= 0),
  check (principal + interest > 0),
  check ((side = 'loan' and loan_id is not null and fund_source_id is null)
      or (side = 'source' and fund_source_id is not null and loan_id is null))
);
create index if not exists fund_contra_lines_contra_idx on fund_contra_lines (contra_id);
create index if not exists fund_contra_lines_loan_idx on fund_contra_lines (loan_id) where loan_id is not null;
create index if not exists fund_contra_lines_source_idx on fund_contra_lines (fund_source_id) where fund_source_id is not null;

alter table fund_contras enable row level security;
alter table fund_contra_lines enable row level security;
drop policy if exists fund_contras_select on fund_contras;
create policy fund_contras_select on fund_contras for select using ((select has_scope(array['treasury'::text])));
drop policy if exists fund_contra_lines_select on fund_contra_lines;
create policy fund_contra_lines_select on fund_contra_lines for select using ((select has_scope(array['treasury'::text])));
-- No write policy: the functions below (security definer) are the only writers.
revoke all on fund_contras from public, anon, authenticated;
revoke all on fund_contra_lines from public, anon, authenticated;
grant select on fund_contras to authenticated;
grant select on fund_contra_lines to authenticated;

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('fund_contras', ARRAY['treasury.approve', 'treasury.create', 'treasury.view']),
  ('fund_contra_lines', ARRAY['treasury.approve', 'treasury.create', 'treasury.view'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('fund_contras');
SELECT public.permission_reads_guard('fund_contra_lines');

SELECT public.audit_register('fund_contras', 'Fund contras', 'Treasury', '{}', 'none',
  p_reason => 'A contra Finance files for the Principal; its approval request, journal entry and the repayment rows it writes are recorded.');
SELECT public.audit_register('fund_contra_lines', 'Fund contra lines', 'Treasury', '{}', 'none',
  p_reason => 'The deals in a contra; written once with it, never changed.');

-- The repayment rows a contra writes.
alter table repayments add column if not exists fund_contra_id uuid references fund_contras (id);
alter table fund_source_repayments add column if not exists fund_contra_id uuid references fund_contras (id);
create index if not exists repayments_fund_contra_idx on repayments (fund_contra_id) where fund_contra_id is not null;
create index if not exists fund_source_repayments_fund_contra_idx on fund_source_repayments (fund_contra_id) where fund_contra_id is not null;

create or replace function fund_contra_rows_stay() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.fund_contra_id is not null and coalesce(current_setting('app.fund_contra_undo', true), '') <> 'on' then
    if tg_op = 'DELETE'
       or new.amount is distinct from old.amount
       or new.payment_date is distinct from old.payment_date
       or new.payment_type is distinct from old.payment_type
       or new.fund_contra_id is distinct from old.fund_contra_id then
      raise exception 'This repayment is part of a fund contra — it cannot be voided or changed on its own' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_repayments_contra_stay on repayments;
create trigger trg_repayments_contra_stay before update or delete on repayments
  for each row execute function fund_contra_rows_stay();
drop trigger if exists trg_fund_source_repayments_contra_stay on fund_source_repayments;
create trigger trg_fund_source_repayments_contra_stay before update or delete on fund_source_repayments
  for each row execute function fund_contra_rows_stay();

-- What a deal is called in a contra's words: its company (or lender) and its [LO#…] / [BI#…] tag where it has one.
create or replace function fund_contra_deal_label(p_side text, p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when p_side = 'loan' then
    (select coalesce(c.short_code, c.name, 'Loan') || coalesce(' ' || (regexp_match(coalesce(l.repayment_terms, ''), '\[[^\]]{1,24}\]'))[1], '')
       from loans l left join companies c on c.id = l.company_id where l.id = p_id)
  else
    (select coalesce(c.short_code, c.name, dp.name, nullif(f.from_freetext_name, ''), d.name, 'Fund source')
              || coalesce(' ' || (regexp_match(coalesce(f.notes, ''), '\[[^\]]{1,24}\]'))[1], '')
       from fund_sources f
       left join companies c on c.id = f.from_company_id
       left join directors d on d.id = f.from_director_id
       left join departments dp on dp.id = f.from_department_id
      where f.id = p_id)
  end
$$;

-- A line's amounts in the queue's words: ' (P 10,000.00 · I 1,200.00)', a nought left out.
create or replace function fund_contra_amounts(p_principal numeric, p_interest numeric) returns text
language sql immutable set search_path = public as $$
  select ' (' || concat_ws(' · ',
    case when p_principal > 0 then 'P ' || to_char(p_principal, 'FM999,999,990.00') end,
    case when p_interest > 0 then 'I ' || to_char(p_interest, 'FM999,999,990.00') end) || ')'
$$;

-- Each line is live and owes at least the principal it takes off (every line of a deal together). Refuses in words.
create or replace function fund_contra_check_lines(p_contra uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  for v in
    select x.side, x.deal, sum(x.principal) principal,
           case when x.side = 'loan' then (select l.status::text from loans l where l.id = x.deal)
                else (select f.status::text from fund_sources f where f.id = x.deal) end status,
           case when x.side = 'loan' then (select o.outstanding from loan_outstanding o where o.loan_id = x.deal)
                else (select o.outstanding from fund_source_outstanding o where o.fund_source_id = x.deal) end outstanding
      from (select side, coalesce(loan_id, fund_source_id) deal, principal from fund_contra_lines where contra_id = p_contra) x
     group by x.side, x.deal
  loop
    if v.status is null then raise exception 'A deal in this contra was not found'; end if;
    if v.side = 'loan' and v.status <> 'active' then
      raise exception '% is % — only an active loan can be in a contra', fund_contra_deal_label(v.side, v.deal), v.status;
    end if;
    if v.side = 'source' and v.status not in ('active', 'matured') then
      raise exception '% is % — only an active fund source can be in a contra', fund_contra_deal_label(v.side, v.deal), v.status;
    end if;
    if v.principal > coalesce(v.outstanding, 0) + 0.005 then
      raise exception '% owes RM % in principal — the contra takes off RM %', fund_contra_deal_label(v.side, v.deal),
        to_char(coalesce(v.outstanding, 0), 'FM999,999,990.00'), to_char(v.principal, 'FM999,999,990.00');
    end if;
  end loop;
end $$;

create or replace function file_fund_contra(p_date date, p_lines jsonb, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_line     jsonb;
  v_side     text;
  v_id       uuid;
  v_p        numeric;
  v_i        numeric;
  v_loan_t   numeric := 0;
  v_src_t    numeric := 0;
  v_contra   uuid;
  v_approval uuid;
  v_label    text;
begin
  PERFORM public.tab_write_guard(ARRAY['/fund-out', '/fund-in'], ARRAY['treasury.create']);
  IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.create']) THEN RAISE EXCEPTION 'file_fund_contra: needs Treasury · Create' USING ERRCODE = '42501';
  end if;
  if p_date is null then raise exception 'The contra''s date is required'; end if;
  if p_date > (now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'The contra''s date cannot be in the future'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add the loans and fund sources to contra';
  end if;

  insert into fund_contras (contra_date, notes, total, status, created_by)
  values (p_date, nullif(trim(p_notes), ''), 1, 'pending', auth.uid())
  returning id into v_contra;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_side := v_line ->> 'side';
    v_id   := nullif(v_line ->> 'id', '')::uuid;
    v_p    := round(coalesce(nullif(v_line ->> 'principal', '')::numeric, 0), 2);
    v_i    := round(coalesce(nullif(v_line ->> 'interest', '')::numeric, 0), 2);
    if v_side not in ('loan', 'source') or v_id is null then raise exception 'Every line needs its loan or fund source'; end if;
    if v_p < 0 or v_i < 0 then raise exception 'Amounts cannot be negative'; end if;
    if v_p + v_i <= 0 then raise exception 'Every line needs a principal or an interest amount'; end if;
    if exists (select 1 from fund_contra_lines where contra_id = v_contra and coalesce(loan_id, fund_source_id) = v_id) then
      raise exception '% is in the contra twice', fund_contra_deal_label(v_side, v_id);
    end if;
    if exists (select 1 from fund_contra_lines l join fund_contras c on c.id = l.contra_id
                where c.status = 'pending' and c.id <> v_contra and coalesce(l.loan_id, l.fund_source_id) = v_id) then
      raise exception '% is already in a contra waiting for the Principal', fund_contra_deal_label(v_side, v_id);
    end if;
    insert into fund_contra_lines (contra_id, side, loan_id, fund_source_id, principal, interest)
    values (v_contra, v_side, case when v_side = 'loan' then v_id end, case when v_side = 'source' then v_id end, v_p, v_i);
    if v_side = 'loan' then v_loan_t := v_loan_t + v_p + v_i; else v_src_t := v_src_t + v_p + v_i; end if;
  end loop;

  if v_loan_t <= 0 then raise exception 'Add at least one Fund OUT loan'; end if;
  if v_src_t <= 0 then raise exception 'Add at least one Fund IN fund source'; end if;
  if abs(v_loan_t - v_src_t) >= 0.005 then
    raise exception 'The two sides must be equal — Fund OUT RM %, Fund IN RM %',
      to_char(v_loan_t, 'FM999,999,990.00'), to_char(v_src_t, 'FM999,999,990.00');
  end if;
  perform fund_contra_check_lines(v_contra);

  -- The queue's words: each deal with what it takes off (P principal · I interest), the loans ↔ the fund sources.
  select string_agg(fund_contra_deal_label('loan', loan_id) || fund_contra_amounts(principal, interest), ', ' order by loan_id) filter (where side = 'loan')
           || ' ↔ ' ||
         string_agg(fund_contra_deal_label('source', fund_source_id) || fund_contra_amounts(principal, interest), ', ' order by fund_source_id) filter (where side = 'source')
    into v_label from fund_contra_lines where contra_id = v_contra;

  update fund_contras set total = v_loan_t where id = v_contra;
  insert into approval_requests (request_type, reference_id, reference_table, submitted_by, description, amount, status, workflow_state)
  values ('fund_contra', v_contra, 'fund_contras', auth.uid(),
          'Contra · ' || coalesce(v_label, '—') || ' · RM ' || to_char(v_loan_t, 'FM999,999,990.00'), v_loan_t, 'pending', 'submitted')
  returning id into v_approval;
  update fund_contras set approval_id = v_approval where id = v_contra;
  return v_contra;
end $$;

create or replace function approve_fund_contra(p_approval_id uuid, p_notes text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_a      approval_requests%rowtype;
  v_c      fund_contras%rowtype;
  v        record;
  v_lines  jsonb := '[]'::jsonb;
  v_leaf   text;
  v_acct   text;
  v_je     uuid;
  v_note   text;
  v_label  text;
begin
  PERFORM public.tab_write_guard(ARRAY['/approvals'], ARRAY['approvals.approve', 'treasury.approve']);
  IF NOT public.approver_may_request(auth.uid(), p_approval_id) THEN
    RAISE EXCEPTION 'approve_fund_contra: you may not decide this request' USING ERRCODE = 'insufficient_privilege';
  END IF;
  select * into v_a from approval_requests where id = p_approval_id for update;
  if not found or v_a.request_type::text <> 'fund_contra' then raise exception 'That is not a fund contra request'; end if;
  if v_a.status <> 'pending' then raise exception 'That request was already decided'; end if;
  select * into v_c from fund_contras where approval_id = p_approval_id for update;
  if not found or v_c.status <> 'pending' then raise exception 'That contra is no longer waiting'; end if;

  -- The deals as they stand now: still live, still owing what the contra takes off.
  perform 1 from loans where id in (select loan_id from fund_contra_lines where contra_id = v_c.id) for update;
  perform 1 from fund_sources where id in (select fund_source_id from fund_contra_lines where contra_id = v_c.id) for update;
  perform fund_contra_check_lines(v_c.id);

  select string_agg(fund_contra_deal_label('loan', loan_id), ', ' order by loan_id) filter (where side = 'loan')
           || ' ↔ ' ||
         string_agg(fund_contra_deal_label('source', fund_source_id), ', ' order by fund_source_id) filter (where side = 'source')
    into v_label from fund_contra_lines where contra_id = v_c.id;
  v_note := 'Contra ' || v_label || coalesce(' — ' || v_c.notes, '');

  -- The journal entry: the loans' side credited, the fund sources' side debited.
  for v in select * from fund_contra_lines where contra_id = v_c.id order by side, id loop
    if v.side = 'loan' then
      if v.principal > 0 then
        select coa.code into v_leaf
          from loans l join companies co on co.id = l.company_id
          join chart_of_accounts coa on coa.parent_code = '3020' and coa.type = 'asset' and coa.is_active
               and (coa.name ilike '%' || co.name || '%' or coa.name ilike '%' || co.short_code || '%')
         where l.id = v.loan_id
         limit 1;
        if v_leaf is null then
          raise exception 'No account under 3020 Loans Receivable for %', fund_contra_deal_label('loan', v.loan_id);
        end if;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_leaf, 'debit', 0, 'credit', v.principal,
          'description', 'Contra — loan principal · ' || fund_contra_deal_label('loan', v.loan_id)));
      end if;
      if v.interest > 0 then
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', '5027', 'debit', 0, 'credit', v.interest,
          'description', 'Contra — loan interest · ' || fund_contra_deal_label('loan', v.loan_id)));
      end if;
    else
      if v.principal > 0 then
        select account_code into v_acct from fund_sources where id = v.fund_source_id;
        if v_acct is null then raise exception '% has no account', fund_contra_deal_label('source', v.fund_source_id); end if;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_acct, 'debit', v.principal, 'credit', 0,
          'description', 'Contra — fund source principal · ' || fund_contra_deal_label('source', v.fund_source_id)));
      end if;
      if v.interest > 0 then
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', '6000', 'debit', v.interest, 'credit', 0,
          'description', 'Contra — fund source interest · ' || fund_contra_deal_label('source', v.fund_source_id)));
      end if;
    end if;
  end loop;
  v_je := post_journal_entry(v_c.contra_date, left(v_note, 240), 'fund_contra', v_c.id, auth.uid(), v_lines);

  -- Each side's repayment rows, and the Venture Pool rows a cash repayment would have written.
  for v in select * from fund_contra_lines where contra_id = v_c.id order by side, id loop
    if v.side = 'loan' then
      if v.principal > 0 then
        insert into repayments (loan_id, amount, payment_type, payment_date, notes, created_by, fund_contra_id)
        values (v.loan_id, v.principal, 'principal', v_c.contra_date, left(v_note, 500), auth.uid(), v_c.id);
        insert into venture_pool (transaction_type, amount, description, reference_id, reference_table, created_by)
        values ('loan_repayment_in', v.principal, 'Contra — loan principal · ' || fund_contra_deal_label('loan', v.loan_id), v.loan_id, 'loans', auth.uid());
      end if;
      if v.interest > 0 then
        insert into repayments (loan_id, amount, payment_type, payment_date, notes, created_by, fund_contra_id)
        values (v.loan_id, v.interest, 'interest', v_c.contra_date, left(v_note, 500), auth.uid(), v_c.id);
      end if;
    else
      if v.principal > 0 then
        insert into fund_source_repayments (fund_source_id, amount, payment_type, payment_date, notes, created_by, fund_contra_id)
        values (v.fund_source_id, v.principal, 'netting', v_c.contra_date, left(v_note, 500), auth.uid(), v_c.id);
      end if;
      if v.interest > 0 then
        insert into fund_source_repayments (fund_source_id, amount, payment_type, payment_date, notes, created_by, fund_contra_id)
        values (v.fund_source_id, v.interest, 'interest', v_c.contra_date, left(v_note, 500), auth.uid(), v_c.id);
      end if;
      insert into venture_pool (transaction_type, amount, description, reference_id, reference_table, created_by)
      values ('expense_out', v.principal + v.interest, 'Contra — fund source repaid · ' || fund_contra_deal_label('source', v.fund_source_id), v.fund_source_id, 'fund_sources', auth.uid());
    end if;
  end loop;

  update approval_requests
     set status = 'approved', workflow_state = 'approved', approved_by = auth.uid(), approved_at = now(),
         notes = coalesce(nullif(trim(p_notes), ''), notes), updated_at = now()
   where id = p_approval_id;
  update fund_contras
     set status = 'approved', journal_entry_id = v_je, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_notes), '')
   where id = v_c.id;
end $$;

create or replace function reject_fund_contra(p_approval_id uuid, p_notes text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_a approval_requests%rowtype;
  v_c fund_contras%rowtype;
begin
  PERFORM public.tab_write_guard(ARRAY['/approvals'], ARRAY['approvals.approve', 'treasury.approve']);
  IF NOT public.approver_may_request(auth.uid(), p_approval_id) THEN
    RAISE EXCEPTION 'reject_fund_contra: you may not decide this request' USING ERRCODE = 'insufficient_privilege';
  END IF;
  select * into v_a from approval_requests where id = p_approval_id for update;
  if not found or v_a.request_type::text <> 'fund_contra' then raise exception 'That is not a fund contra request'; end if;
  if v_a.status <> 'pending' then raise exception 'That request was already decided'; end if;
  select * into v_c from fund_contras where approval_id = p_approval_id for update;
  if not found or v_c.status <> 'pending' then raise exception 'That contra is no longer waiting'; end if;

  update approval_requests
     set status = 'rejected', workflow_state = 'rejected', approved_by = auth.uid(), approved_at = now(),
         notes = coalesce(nullif(trim(p_notes), ''), notes), updated_at = now()
   where id = p_approval_id;
  update fund_contras
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_notes), '')
   where id = v_c.id;
end $$;

create or replace function undo_fund_contra(p_contra_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c        fund_contras%rowtype;
  v_je       journal_entries%rowtype;
  v_lines    jsonb;
  v_rev      uuid;
  v_date     date;
  v          record;
begin
  PERFORM public.tab_write_guard(ARRAY['/fund-out', '/fund-in'], ARRAY['treasury.void']);
  IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.void']) THEN RAISE EXCEPTION 'undo_fund_contra: needs Treasury · Void' USING ERRCODE = '42501';
  end if;
  select * into v_c from fund_contras where id = p_contra_id for update;
  if not found then raise exception 'That contra was not found'; end if;
  if v_c.status <> 'approved' then raise exception 'Only an approved contra can be undone (this one is %)', v_c.status; end if;
  perform 1 from loans where id in (select loan_id from fund_contra_lines where contra_id = v_c.id) for update;
  perform 1 from fund_sources where id in (select fund_source_id from fund_contra_lines where contra_id = v_c.id) for update;

  -- The reversing entry: every line swapped, dated the contra's day unless that month is locked.
  select * into v_je from journal_entries where id = v_c.journal_entry_id for update;
  if not found then raise exception 'The contra''s journal entry was not found'; end if;
  if v_je.is_reversed then raise exception 'The contra''s journal entry is already reversed'; end if;
  v_date := case when exists (select 1 from period_locks where period_month = date_trunc('month', v_c.contra_date)::date and is_locked)
                 then (now() at time zone 'Asia/Kuala_Lumpur')::date else v_c.contra_date end;
  select jsonb_agg(jsonb_build_object('account_code', jl.account_code, 'debit', jl.credit, 'credit', jl.debit,
                                      'description', 'Reversal — ' || coalesce(jl.description, '')))
    into v_lines from journal_lines jl where jl.entry_id = v_je.id;
  v_rev := post_journal_entry(v_date, left('Undo — ' || coalesce(v_je.description, ''), 240), 'fund_contra_undo', v_c.id, auth.uid(), v_lines, v_je.segment);
  update journal_entries set is_reversed = true, reversed_by_id = v_rev where id = v_je.id;
  update journal_entries set is_reversed = true, reversed_by_id = v_je.id where id = v_rev;

  -- The rows it wrote, removed (the guard lets this one step through).
  perform set_config('app.fund_contra_undo', 'on', true);
  delete from repayments where fund_contra_id = v_c.id;
  delete from fund_source_repayments where fund_contra_id = v_c.id;
  perform set_config('app.fund_contra_undo', '', true);

  -- The Venture Pool countered, line by line as the approval wrote it.
  for v in select * from fund_contra_lines where contra_id = v_c.id loop
    if v.side = 'loan' and v.principal > 0 then
      insert into venture_pool (transaction_type, amount, description, reference_id, reference_table, created_by)
      values ('fund_out', v.principal, 'Undo contra — loan principal · ' || fund_contra_deal_label('loan', v.loan_id), v.loan_id, 'loans', auth.uid());
    elsif v.side = 'source' then
      insert into venture_pool (transaction_type, amount, description, reference_id, reference_table, created_by)
      values ('profit_in', v.principal + v.interest, 'Undo contra — fund source repaid · ' || fund_contra_deal_label('source', v.fund_source_id), v.fund_source_id, 'fund_sources', auth.uid());
    end if;
  end loop;

  -- A deal the contra had closed, open again when it now owes principal.
  update loans l set status = 'active', updated_at = now()
   where l.id in (select loan_id from fund_contra_lines where contra_id = v_c.id)
     and l.status::text = 'fully_repaid'
     and (select o.outstanding from loan_outstanding o where o.loan_id = l.id) > 0.005;
  update fund_sources f set status = 'active', repaid_at = null, repaid_by = null
   where f.id in (select fund_source_id from fund_contra_lines where contra_id = v_c.id)
     and f.status::text = 'repaid'
     and (select o.outstanding from fund_source_outstanding o where o.fund_source_id = f.id) > 0.005;

  update fund_contras
     set status = 'reversed', reversal_journal_entry_id = v_rev, reversed_by = auth.uid(), reversed_at = now()
   where id = v_c.id;
end $$;

-- The guards the scan reads (tab-write-guards.test.ts).
CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql AS $g$
DECLARE
  v_line text := format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', '));
BEGIN
  IF position(v_line IN (SELECT prosrc FROM pg_proc WHERE oid = p_sig::regprocedure)) = 0 THEN
    RAISE EXCEPTION '% does not ask its page: % is not in its body', p_sig, v_line;
  END IF;
END
$g$;

SELECT pg_temp.tab_guard('public.file_fund_contra(date, jsonb, text)', $$ARRAY['/fund-out', '/fund-in']$$, ARRAY['treasury.create']);
SELECT pg_temp.tab_guard('public.approve_fund_contra(uuid, text)', $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.reject_fund_contra(uuid, text)', $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.undo_fund_contra(uuid)', $$ARRAY['/fund-out', '/fund-in']$$, ARRAY['treasury.void']);

revoke all on function file_fund_contra(date, jsonb, text) from public, anon;
revoke all on function approve_fund_contra(uuid, text) from public, anon;
revoke all on function reject_fund_contra(uuid, text) from public, anon;
revoke all on function undo_fund_contra(uuid) from public, anon;
grant execute on function file_fund_contra(date, jsonb, text) to authenticated, service_role;
grant execute on function approve_fund_contra(uuid, text) to authenticated, service_role;
grant execute on function reject_fund_contra(uuid, text) to authenticated, service_role;
grant execute on function undo_fund_contra(uuid) to authenticated, service_role;
-- Helpers only the functions above call.
revoke all on function fund_contra_check_lines(uuid) from public, anon, authenticated;
revoke all on function fund_contra_deal_label(text, uuid) from public, anon, authenticated;
revoke all on function fund_contra_amounts(numeric, numeric) from public, anon, authenticated;
grant execute on function fund_contra_check_lines(uuid) to service_role;
grant execute on function fund_contra_deal_label(text, uuid) to service_role;
grant execute on function fund_contra_amounts(numeric, numeric) to service_role;
