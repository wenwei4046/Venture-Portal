-- 20261029250000_dept_payment_requests_read_only.sql
--
-- Dept Payment Requests, retired (2026-10-29, PR ⑥ of docs/module-spec-payment-requests.md). Orphaned since #533 and
-- no row in production, its page and the Finance phone app's screen redirect to Payments › Payment request, where a
-- department's payments are asked now (payment_requests). The table stays as history, read as before:
--
--   · a client (anon, authenticated) writes it no more — only its owner's functions do;
--   · Finance's two steps of the retired page — Generate PV and Cancel — are dropped: nothing calls them (the app's
--     only caller went with the page; no function, trigger, policy or view names them in production, checked
--     2026-10-29).
--
-- What else touches it keeps working, running as its owner and meeting no new request: the approval queue's steps for
-- such a request (approve_dept_payment_expense, reject_dept_payment_request), the voucher's followers
-- (complete_dept_payment_request_on_pv_paid, dept_request_pv_rejected — called for every rejected voucher) and the
-- chart of accounts' renames (rename_account_code, change_account_type).

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.dept_payment_requests FROM anon, authenticated;

DROP FUNCTION IF EXISTS public.generate_pv_for_dept_request(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.cancel_dept_payment_request(uuid, text);

COMMENT ON TABLE public.dept_payment_requests IS
  'Dept Payment Requests — retired 2026-10-29 (PR ⑥): read-only history. A department''s payments are payment_requests.';

NOTIFY pgrst, 'reload schema';
