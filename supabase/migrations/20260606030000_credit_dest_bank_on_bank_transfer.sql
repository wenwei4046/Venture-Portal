-- Bank-to-bank transfers (voucher_type='payroll_bank_transfer') credit the
-- destination bank's cached balance automatically. The approval RPC only debits
-- the source bank (bank_account_id); the destination bank — identified by a
-- source row whose account_code matches a bank's gl_account_code — was never
-- credited, leaving its cache understated vs GL (e.g. Alliance after a payroll
-- transfer). This trigger closes that gap on the status→paid transition.
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
     and new.voucher_type = 'payroll_bank_transfer' then
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

drop trigger if exists trg_credit_dest_bank_on_bank_transfer on payment_vouchers;
create trigger trg_credit_dest_bank_on_bank_transfer
after update on payment_vouchers
for each row execute function credit_dest_bank_on_bank_transfer();
