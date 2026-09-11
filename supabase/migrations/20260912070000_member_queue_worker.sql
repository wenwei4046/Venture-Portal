-- Machine-only queue sweep. A deployed scheduler calls the authenticated
-- /api/member-queue endpoint; this migration never installs an external job.
CREATE TABLE public.member_queue_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 departments_processed integer NOT NULL DEFAULT 0, new_reservations integer NOT NULL DEFAULT 0,
 failures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(failures)='array')
);
ALTER TABLE public.member_queue_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_queue_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.member_queue_runs TO service_role;

CREATE FUNCTION public.member_process_all_queues() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_run uuid; v_sub uuid; v_processed integer:=0; v_reserved integer:=0; v_added integer;
 v_failures jsonb:='[]'::jsonb; v_state text; v_message text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service-role queue access is required' USING ERRCODE='42501'; END IF;
 -- Overlapping scheduler deliveries do no work. Per-department locks inside
 -- member_reserve_waiting also serialize the worker with live HR/roster writes.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('member-queue-worker',0)) THEN
 RETURN jsonb_build_object('status','skipped','departmentsProcessed',0,'newReservations',0,'failures',0);
 END IF;
 INSERT INTO public.member_queue_runs DEFAULT VALUES RETURNING id INTO v_run;
 FOR v_sub IN SELECT cap.sub_department_id FROM public.member_department_capacity cap
 JOIN public.comm_sub_departments d ON d.id=cap.sub_department_id WHERE d.is_active ORDER BY cap.sub_department_id LOOP
 BEGIN
 v_added:=public.member_reserve_waiting(v_sub);
 v_reserved:=v_reserved+v_added; v_processed:=v_processed+1;
 EXCEPTION WHEN OTHERS THEN
 -- A failed department rolls back its own changes; healthy departments still
 -- progress. The private run audit preserves the diagnosis for an operator.
 GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
 v_failures:=v_failures||jsonb_build_array(jsonb_build_object('subDepartmentId',v_sub,'code',v_state,'message',left(v_message,300)));
 END;
 END LOOP;
 UPDATE public.member_queue_runs SET finished_at=clock_timestamp(),departments_processed=v_processed,
 new_reservations=v_reserved,failures=v_failures WHERE id=v_run;
 RETURN jsonb_build_object('runId',v_run,'status',CASE WHEN jsonb_array_length(v_failures)=0 THEN 'complete' ELSE 'partial' END,
 'departmentsProcessed',v_processed,'newReservations',v_reserved,'failures',jsonb_array_length(v_failures));
END $$;
REVOKE ALL ON FUNCTION public.member_process_all_queues() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_process_all_queues() TO service_role;
