-- IR Quote's Drive goes (the user, 2026-11-10: "Drive 的旧资料 删掉").
--
-- The app stopped using it on 2026-11-09 (#989): style photos are the company's alone (Quote settings › Styles), and no
-- screen reads or writes a salesperson's Drive any more. What it left: the table ir_drive_boards (4 boards, one owner),
-- its two functions ir_drive_read() and ir_drive_save_board(text, jsonb), and its line in audit_tables. It never had rows
-- in permission_table_reads / _writes, and no file in R2 (the `ir-quote` bucket holds config/ only).
-- What the rows said stays in audit_events.

DROP FUNCTION IF EXISTS public.ir_drive_read();
DROP FUNCTION IF EXISTS public.ir_drive_save_board(text, jsonb);
-- Its triggers (the audit's) and policies with it.
DROP TABLE IF EXISTS public.ir_drive_boards;
DELETE FROM public.audit_tables WHERE table_name = 'ir_drive_boards';

-- Nothing left names what went.
DO $$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text) INTO v_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc ~ '(ir_drive_boards|ir_drive_read|ir_drive_save_board)';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'Still naming the IR Drive: %', v_left;
  END IF;
END $$;
