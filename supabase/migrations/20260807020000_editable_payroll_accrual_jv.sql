-- Auto payroll accrual JVs are editable/deletable like manual ones (user
-- 2026-08-07: "我要可以点开看detail，然后万一有错我还可以更改"). The
-- update/delete RPCs guarded reference_type = 'manual_jv' only — widen both
-- to also accept 'payroll_accrual'. Editing keeps the reference_type, so the
-- auto-poster's idempotency still sees the entry (same total → skip;
-- different → refuses and says reverse/fix first). Anchored, idempotent.

DO $mig$
DECLARE
  v_fn text; v_def text; v_new text;
  v_anchor_upd text := $a$IF v_ref <> 'manual_jv' THEN RAISE EXCEPTION 'Only manual journal vouchers can be edited (this one is auto-posted: %)', v_ref; END IF;$a$;
  v_repl_upd text := $r$IF v_ref NOT IN ('manual_jv', 'payroll_accrual') THEN RAISE EXCEPTION 'Only manual/payroll-accrual journal vouchers can be edited (this one is auto-posted: %)', v_ref; END IF;$r$;
  v_anchor_del text := $a$IF v_ref <> 'manual_jv' THEN RAISE EXCEPTION 'Only manual journal vouchers can be deleted (this one is auto-posted: %)', v_ref; END IF;$a$;
  v_repl_del text := $r$IF v_ref NOT IN ('manual_jv', 'payroll_accrual') THEN RAISE EXCEPTION 'Only manual/payroll-accrual journal vouchers can be deleted (this one is auto-posted: %)', v_ref; END IF;$r$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='update_manual_journal_voucher';
  IF v_def IS NULL THEN RAISE EXCEPTION 'update_manual_journal_voucher not found'; END IF;
  IF v_def NOT LIKE '%payroll_accrual%' THEN
    v_new := replace(v_def, v_anchor_upd, v_repl_upd);
    IF v_new = v_def THEN RAISE EXCEPTION 'guard anchor missing in update_manual_journal_voucher'; END IF;
    EXECUTE v_new;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='delete_manual_journal_voucher';
  IF v_def IS NULL THEN RAISE EXCEPTION 'delete_manual_journal_voucher not found'; END IF;
  IF v_def NOT LIKE '%payroll_accrual%' THEN
    v_new := replace(v_def, v_anchor_del, v_repl_del);
    IF v_new = v_def THEN RAISE EXCEPTION 'guard anchor missing in delete_manual_journal_voucher'; END IF;
    EXECUTE v_new;
  END IF;
END $mig$;
