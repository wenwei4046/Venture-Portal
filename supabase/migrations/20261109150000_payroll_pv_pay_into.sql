-- A payroll request's voucher pays into the bank it funds (2026-11-09, the user: "我payroll request 的pv 也要自带转去的
-- account"): the funding PV (payroll_bank_transfer, reference payroll_payment_request) moves the money from Finance's
-- bank into the bank Finance picked as its destination — HR's payroll account, Alliance Bank 141760013039511 today.
-- That bank is on the voucher's lines, not its head: each line's account_code is the destination bank's GL code
-- (payroll-requests/actions.ts › fundPayrollRound; the credit_dest_bank trigger credits it at approval). So when such a
-- line is written, the voucher's Pay into (payment_voucher_payees, mig 20261109120000) takes that bank's name and
-- number — as it stands that day. Only new vouchers: the ones made before stay without it (the user: "不用").

CREATE OR REPLACE FUNCTION public.payroll_transfer_gives_voucher_payee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_bank    text;
  v_account text;
BEGIN
  IF NEW.account_code IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.payment_vouchers v
        WHERE v.id = NEW.voucher_id AND v.reference_type = 'payroll_payment_request' AND v.voucher_type = 'payroll_bank_transfer') THEN
    RETURN NEW;
  END IF;
  SELECT b.bank_name, nullif(regexp_replace(coalesce(b.account_number, ''), '[^0-9A-Za-z]', '', 'g'), '')
    INTO v_bank, v_account
    FROM public.bank_accounts b
   WHERE b.gl_account_code = NEW.account_code
   ORDER BY (b.status = 'active') DESC, b.created_at
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF v_account !~ '^[0-9A-Za-z]{4,30}$' THEN
    v_account := NULL;
  END IF;
  IF nullif(btrim(coalesce(v_bank, '')), '') IS NULL AND v_account IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.payment_voucher_payees (voucher_id, bank, account_no, updated_by, updated_at)
  VALUES (NEW.voucher_id, nullif(btrim(v_bank), ''), v_account, auth.uid(), now())
  ON CONFLICT (voucher_id) DO NOTHING;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS payroll_transfer_gives_voucher_payee ON public.payment_voucher_sources;
CREATE TRIGGER payroll_transfer_gives_voucher_payee
  AFTER INSERT ON public.payment_voucher_sources
  FOR EACH ROW EXECUTE FUNCTION public.payroll_transfer_gives_voucher_payee();

REVOKE ALL ON FUNCTION public.payroll_transfer_gives_voucher_payee() FROM PUBLIC, anon, authenticated;
