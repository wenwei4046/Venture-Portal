-- Extend the destination-bank cache credit to internal_transfer (pure bank-to-
-- bank moves), not just payroll_bank_transfer. Same mechanism: on status→paid,
-- credit any bank whose gl_account_code matches a source-row account_code.
-- (Applied via MCP apply_migration 2026-06-06; file kept for repo parity.)
create or replace function credit_dest_bank_on_bank_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid'
     and (old.status is distinct from 'paid')
     and new.voucher_type in ('payroll_bank_transfer', 'internal_transfer') then
    update bank_accounts db
       set current_balance = round((db.current_balance + sub.amt)::numeric, 2)
      from (
        select pvs.account_code, sum(pvs.amount) as amt
          from payment_voucher_sources pvs
         where pvs.voucher_id = new.id
         group by pvs.account_code
      ) sub
     where db.gl_account_code = sub.account_code
       and db.status = 'active'
       and (new.bank_account_id is null or db.id <> new.bank_account_id);
  end if;
  return new;
end $$;
