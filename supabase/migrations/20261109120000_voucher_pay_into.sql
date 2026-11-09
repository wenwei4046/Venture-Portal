-- A payment's Pay into (2026-11-09, the user on Payment voucher: "这里的payment 我想要带出对方的bank account
-- number" → "就我自己开的pv, 不是从payment request 来的我可以自己填，但不是一定。然后如果下次我copy 的时候也要带过去 ·
-- 还有就是payment voucher column 要包括这个"): the bank and account a voucher pays into.
--
-- Kept beside the voucher, not on it: no session reads an account number straight off a table (mig 20261009050100),
-- and payment_vouchers is read with select('*') in several places — a column taken out of its SELECT would refuse
-- them. So the account lives in payment_voucher_payees, which no session reads or writes; the readers and writers
-- below are the only way in, and a reader without the Bank tick gets its last four.
--   · typed in Create payment / Edit (optional) — voucher_payee_set, while the voucher is a draft or pending;
--   · a copy takes its source's — voucher_payee_copy;
--   · a voucher made from staff payment requests takes the account the request pays into (the request's own
--     snapshot), the moment the requests are tied to it.

CREATE TABLE IF NOT EXISTS public.payment_voucher_payees (
  voucher_id uuid PRIMARY KEY REFERENCES public.payment_vouchers(id) ON DELETE CASCADE,
  bank       text CHECK (bank IS NULL OR length(bank) BETWEEN 1 AND 120),
  account_no text CHECK (account_no IS NULL OR account_no ~ '^[0-9A-Za-z]{4,30}$'),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (bank IS NOT NULL OR account_no IS NOT NULL)
);
ALTER TABLE public.payment_voucher_payees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_voucher_payees FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_voucher_payees TO service_role;

SELECT public.audit_register('payment_voucher_payees', 'Payment pay-into accounts', 'Payments', '{treasury}', 'all',
  p_labels => '{voucher_id}', p_ignore => '{updated_at}', p_bank => '{account_no}');

-- ── The reader: whole for the Bank tick, else its last four ─────────────────

CREATE OR REPLACE FUNCTION public.voucher_payees(p_ids uuid[])
RETURNS TABLE (voucher_id uuid, bank text, account_no text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH me AS MATERIALIZED (
    SELECT coalesce(public.sees_sensitive('bank'), false) AS bank,
           coalesce(public.has_scope(ARRAY['treasury', 'admin']), false) AS reads,
           coalesce(public.has_perm('payroll_payouts'), false) AS payroll
  )
  SELECT p.voucher_id, p.bank,
         CASE WHEN p.account_no IS NULL OR me.bank THEN p.account_no ELSE '•••• ' || right(p.account_no, 4) END
    FROM public.payment_voucher_payees p
    JOIN public.payment_vouchers v ON v.id = p.voucher_id
   CROSS JOIN me
   WHERE p.voucher_id = ANY (p_ids)
     AND me.reads
     -- A person's pay is read only with Payroll payouts, as the voucher's lines are.
     AND (me.payroll OR coalesce(v.reference_type, '') NOT IN ('payroll_disbursement', 'payroll_statutory', 'payroll_payment_request'))
$fn$;

-- ── The writers ─────────────────────────────────────────────────────────────

-- Typed in Create payment or Edit: both blank takes it off. Only while the voucher may still be changed.
CREATE OR REPLACE FUNCTION public.voucher_payee_set(p_voucher uuid, p_bank text, p_account text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status  text;
  v_bank    text := nullif(btrim(coalesce(p_bank, '')), '');
  v_account text := nullif(regexp_replace(coalesce(p_account, ''), '[[:space:]-]', '', 'g'), '');
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/payments', '/payments/requests'], ARRAY['treasury.create', 'treasury.edit']);
  IF auth.uid() IS NULL OR NOT coalesce(public.has_any_action(ARRAY['treasury.create', 'treasury.edit']), false) THEN
    RAISE EXCEPTION 'Pay into needs Treasury · Create or Edit.' USING ERRCODE = '42501';
  END IF;
  SELECT v.status::text INTO v_status FROM public.payment_vouchers v WHERE v.id = p_voucher;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Voucher not found.' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('draft', 'pending_approval') THEN
    RAISE EXCEPTION 'This voucher can no longer be changed.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(v_bank, '')) > 120 THEN
    RAISE EXCEPTION 'Keep the bank''s name short.' USING ERRCODE = '22023';
  END IF;
  IF v_account IS NOT NULL AND v_account !~ '^[0-9A-Za-z]{4,30}$' THEN
    RAISE EXCEPTION 'An account number is digits only.' USING ERRCODE = '22023';
  END IF;

  IF v_bank IS NULL AND v_account IS NULL THEN
    DELETE FROM public.payment_voucher_payees WHERE voucher_id = p_voucher;
  ELSE
    INSERT INTO public.payment_voucher_payees (voucher_id, bank, account_no, updated_by, updated_at)
    VALUES (p_voucher, v_bank, v_account, auth.uid(), now())
    ON CONFLICT (voucher_id) DO UPDATE
      SET bank = EXCLUDED.bank, account_no = EXCLUDED.account_no, updated_by = EXCLUDED.updated_by, updated_at = now();
  END IF;
END
$fn$;

-- A copy takes its source's Pay into (the copy is a fresh draft of the caller's).
CREATE OR REPLACE FUNCTION public.voucher_payee_copy(p_from uuid, p_to uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/payments', '/payments/[id]', '/receipts'], ARRAY['treasury.create']);
  IF auth.uid() IS NULL OR NOT coalesce(public.has_any_action(ARRAY['treasury.create']), false) THEN
    RAISE EXCEPTION 'Copy needs Treasury · Create.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_vouchers v WHERE v.id = p_to AND v.status = 'draft' AND v.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'The copy is not a draft of yours.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.payment_voucher_payees (voucher_id, bank, account_no, updated_by, updated_at)
  SELECT p_to, p.bank, p.account_no, auth.uid(), now()
    FROM public.payment_voucher_payees p
   WHERE p.voucher_id = p_from
  ON CONFLICT (voucher_id) DO NOTHING;
END
$fn$;

-- Staff payment requests tied to a voucher: it pays into the account the requests pay into (one payee into one
-- account — payment_requests_for_pv refuses anything else). What was typed already stays.
CREATE OR REPLACE FUNCTION public.payment_requests_give_voucher_payee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.pv_id IS NOT NULL AND NEW.pv_id IS DISTINCT FROM OLD.pv_id
     AND (NEW.payee_bank IS NOT NULL OR NEW.payee_account_no ~ '^[0-9A-Za-z]{4,30}$') THEN
    INSERT INTO public.payment_voucher_payees (voucher_id, bank, account_no, updated_by, updated_at)
    VALUES (NEW.pv_id, NEW.payee_bank,
            CASE WHEN NEW.payee_account_no ~ '^[0-9A-Za-z]{4,30}$' THEN NEW.payee_account_no END, auth.uid(), now())
    ON CONFLICT (voucher_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS payment_requests_give_voucher_payee ON public.payment_requests;
CREATE TRIGGER payment_requests_give_voucher_payee
  AFTER UPDATE OF pv_id ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.payment_requests_give_voucher_payee();

-- The vouchers made from requests so far.
INSERT INTO public.payment_voucher_payees (voucher_id, bank, account_no, updated_at)
SELECT DISTINCT ON (r.pv_id) r.pv_id, r.payee_bank,
       CASE WHEN r.payee_account_no ~ '^[0-9A-Za-z]{4,30}$' THEN r.payee_account_no END, now()
  FROM public.payment_requests r
 WHERE r.pv_id IS NOT NULL
   AND (r.payee_bank IS NOT NULL OR r.payee_account_no ~ '^[0-9A-Za-z]{4,30}$')
 ORDER BY r.pv_id, r.submitted_at
ON CONFLICT (voucher_id) DO NOTHING;

-- The guards the scan reads (tab-write-guards.test.ts), checked against the bodies above.
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

SELECT pg_temp.tab_guard('public.voucher_payee_set(uuid, text, text)',
  $$ARRAY['/payments', '/payments/requests']$$, ARRAY['treasury.create', 'treasury.edit']);
SELECT pg_temp.tab_guard('public.voucher_payee_copy(uuid, uuid)',
  $$ARRAY['/payments', '/payments/[id]', '/receipts']$$, ARRAY['treasury.create']);

REVOKE ALL ON FUNCTION public.voucher_payees(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_payee_set(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_payee_copy(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_requests_give_voucher_payee() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voucher_payees(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_payee_set(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_payee_copy(uuid, uuid) TO authenticated, service_role;
