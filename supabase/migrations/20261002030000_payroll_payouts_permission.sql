-- 2026-10-02 (user: "我现在有 finance executive 了，我不希望他看到 payroll detail，
-- 也就是每个人的 payout" → sample → "照这个做"): who, on the treasury side, may see
-- what ONE named person is paid.
--
-- Until now the Treasury permission carried it: anybody who could open
-- Payments could unfold a payroll batch, open a salary voucher, print it, and
-- download the bank file. With one finance account that was the same person.
-- With two it is not.
--
-- `payroll_payouts` is that right on its own. The pages ask for it
-- (lib/roles.ts canSeePayrollPayouts): without it a payroll batch is one total
-- line in Payments, and the vouchers behind it, their print and export, the
-- payroll bank file, Payroll Requests, the payroll lines on Approvals and
-- Daily Bank, and the Invoice Pool do not open.
--
-- Scope 'none': holding it opens no table by itself. It NARROWS what a
-- treasury reader gets from the tables that are nothing but one person's pay:
--
--   payroll_voucher_lines              name, net and bank account behind a salary PV
--   payroll_statutory_voucher_lines    each person's EPF / SOCSO / EIS / PCB
--   hr_monthly_payroll, hr_staff_costs the finance own-department carve-out
--
-- HR's and the Principal's reading of those is untouched (hr / admin scope).
--
-- NOT narrowed, on purpose: payment_vouchers itself. Every voucher number in
-- the portal is "how many vouchers can I see, plus one", counted in the
-- caller's session (payments/actions.ts, billing/actions.ts, claims/actions.ts,
-- payroll-requests/actions.ts) against UNIQUE (voucher_no). An account that
-- could not see the payroll vouchers would count ~140 short and collide on
-- every voucher it tried to create. Hiding those rows needs the numbering
-- moved into the database first. Until then the pages do the hiding; and the
-- journal, whose payroll entries carry the payee in their description, is kept
-- from such an account by the Reports / Department reports / Reconciliation /
-- Dept Pool permissions, which the Principal switches off for it.
--
-- Who holds it: the Principal, by role. Every finance account that exists
-- today gets it as a personal grant, so nothing changes for them. A finance
-- account created after this does not have it until the Principal ticks it.
--
-- Rollback:
--   ALTER POLICY each of the four back to the expression quoted above it;
--   DELETE FROM public.user_permissions WHERE permission_key = 'payroll_payouts';
--   DELETE FROM public.role_default_permissions WHERE permission_key = 'payroll_payouts';
--   DELETE FROM public.permission_defs WHERE key = 'payroll_payouts';


-- ─── 1. The permission ──────────────────────────────────────────────────────

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order)
VALUES ('payroll_payouts', 'Payroll payouts', 'Daily', 'none',
        'See each person''s pay in Treasury: the salary and statutory vouchers, their print and export, the payroll bank file, Payroll Requests, the Invoice Pool. Without it payroll shows in Payments as one total per batch.',
        35)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_default_permissions (role, permission_key)
VALUES ('principal', 'payroll_payouts')
ON CONFLICT DO NOTHING;

-- Whoever is a finance account today keeps what they see today.
INSERT INTO public.user_permissions (user_id, permission_key, granted)
SELECT u.id, 'payroll_payouts', true
  FROM public.users u
 WHERE u.role = 'finance' AND u.is_active
ON CONFLICT (user_id, permission_key) DO NOTHING;


-- ─── 2. The rows that are one person's pay ──────────────────────────────────

-- was: ( SELECT has_scope(ARRAY['hr','treasury','admin']) )
ALTER POLICY pvl_select ON public.payroll_voucher_lines
  USING (
    (SELECT public.has_scope(ARRAY['hr', 'admin']))
    OR ((SELECT public.has_scope(ARRAY['treasury'])) AND (SELECT public.has_perm('payroll_payouts')))
  );

-- was: ( SELECT COALESCE(has_perm('hr_costing') OR has_perm('treasury'), false) )
ALTER POLICY psvl_select ON public.payroll_statutory_voucher_lines
  USING (
    (SELECT COALESCE(
      public.has_perm('hr_costing')
      OR (public.has_perm('treasury') AND public.has_perm('payroll_payouts')),
      false))
  );

-- was: the same without the has_perm line
ALTER POLICY hr_monthly_payroll_finance_own_dept_select ON public.hr_monthly_payroll
  USING (
    (SELECT public.has_scope(ARRAY['treasury']))
    AND (SELECT public.has_perm('payroll_payouts'))
    AND (SELECT public.current_user_department_id()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.hr_staff_costs s
       WHERE s.id = hr_monthly_payroll.staff_id
         AND s.department_id = (SELECT public.current_user_department_id())
    )
  );

-- was: the same without the has_perm line
ALTER POLICY hr_staff_costs_finance_own_dept_select ON public.hr_staff_costs
  USING (
    (SELECT public.has_scope(ARRAY['treasury']))
    AND (SELECT public.has_perm('payroll_payouts'))
    AND (SELECT public.current_user_department_id()) IS NOT NULL
    AND department_id = (SELECT public.current_user_department_id())
  );
