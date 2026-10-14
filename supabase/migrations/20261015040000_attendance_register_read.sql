-- ============================================================================
-- 20261015040000_attendance_register_read.sql
-- HR › Attendance › Month close › Statutory register (2026-10-15): the register
-- frozen on close (att_months.register, mig 20261015030100) read back for the
-- CSV download. att_months has no policy and no grant — this DEFINER reader
-- asks Attendance · View itself and answers the rows, or NULL while the month
-- is open (the page then reckons the register from the month's facts).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.att_register(p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.att_need(ARRAY['attendance.view'], 'Attendance needs Attendance · View.');
  RETURN (SELECT m.register FROM public.att_months m WHERE m.month = date_trunc('month', p_month)::date AND m.status = 'closed');
END
$fn$;

REVOKE ALL ON FUNCTION public.att_register(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.att_register(date) TO authenticated;
