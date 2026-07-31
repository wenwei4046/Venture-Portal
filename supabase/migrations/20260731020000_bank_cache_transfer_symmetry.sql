-- Bank cache drifted from the GL on two transfer paths (2026-07-31, found
-- while verifying the Dept Pool per-bank page):
--
--  A) VOIDING a paid transfer restored only the SOURCE bank. The destination
--     credit posted by credit_dest_bank_on_bank_transfer was never undone, so
--     Alliance stayed 42,802.20 too high after HV-PV-202607-0109 was voided.
--     Fixed with a mirror-image trigger on the paid→voided transition, so it
--     covers EVERY void path (app action, RPC, future ones) instead of one
--     TypeScript function.
--
--  B) A same-bank "contra" transfer (HV-PV-202607-0186: source Hong Leong,
--     source row account_code 3000 = Hong Leong) debited the source but the
--     credit trigger refused to touch the same bank — `db.id <>
--     new.bank_account_id`. The GL nets such a voucher to zero (Dr 3000 /
--     Cr 3000); the cache lost 22,174.00. That guard was defensive, not a fix
--     for any observed bug (mig 20260606030000), and it only ever bites when a
--     source row names the source bank itself — precisely the case where the
--     credit SHOULD run so the pair nets to zero. Removed.
--
-- The caches are then re-derived from the GL, which is the audit truth here
-- (trial balance is 0.00 and every report reads journal_lines).

CREATE OR REPLACE FUNCTION public.credit_dest_bank_on_bank_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
       and db.status = 'active';
  end if;
  return new;
end $function$;

-- Mirror: undo that credit when the voucher is voided.
CREATE OR REPLACE FUNCTION public.debit_dest_bank_on_transfer_void()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if new.status = 'voided'
     and old.status = 'paid'
     and new.voucher_type in ('payroll_bank_transfer', 'internal_transfer') then
    update bank_accounts db
       set current_balance = round((db.current_balance - sub.amt)::numeric, 2)
      from (
        select pvs.account_code, sum(pvs.amount) as amt
          from payment_voucher_sources pvs
         where pvs.voucher_id = new.id
         group by pvs.account_code
      ) sub
     where db.gl_account_code = sub.account_code
       and db.status = 'active';
  end if;
  return new;
end $function$;

DROP TRIGGER IF EXISTS trg_debit_dest_bank_on_transfer_void ON payment_vouchers;
CREATE TRIGGER trg_debit_dest_bank_on_transfer_void
  AFTER UPDATE ON payment_vouchers
  FOR EACH ROW
  EXECUTE FUNCTION debit_dest_bank_on_transfer_void();

-- Re-derive the caches from the GL.
UPDATE bank_accounts ba
   SET current_balance = coalesce(g.bal, 0)
  FROM (
    SELECT jl.account_code,
           round(sum(coalesce(jl.debit, 0) - coalesce(jl.credit, 0)), 2) AS bal
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
     WHERE je.is_reversed = false
     GROUP BY jl.account_code
  ) g
 WHERE ba.gl_account_code = g.account_code
   AND ba.status = 'active';
