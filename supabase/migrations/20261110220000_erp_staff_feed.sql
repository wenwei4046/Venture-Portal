-- The ERP's staff list (2026-11-10 — Lead View v3 § 4; the user: "People + ERP feed"). The Houzs ERP pushes its whole
-- staff list, one company at a time, to `POST /api/erp/v1/staff` — a fourth endpoint of the existing ERP feed (same key,
-- same rules as /sales-attending, contract § 13). Lead View's Team reads it beside People: an ERP job of "Lead Executive"
-- makes a Customer service, an ERP branch pre-ticks the outlet, and somebody the ERP marks inactive has their Lead View
-- access stopped at once. Logins stay People's (HR invites), so a row here is matched to a People record by email, else
-- by name — never stored as a link, worked out when read.
--
--   erp_staff              one row a person of one ERP company, as last sent
--   erp_staff_deliveries   the last snapshot taken in, per company

CREATE TABLE IF NOT EXISTS public.erp_staff (
  company_id  integer NOT NULL,
  staff_id    text NOT NULL CHECK (length(staff_id) BETWEEN 1 AND 64),
  code        text NOT NULL DEFAULT '',
  name        text NOT NULL DEFAULT '',
  email       text NOT NULL DEFAULT '',
  job         text NOT NULL DEFAULT '',
  branch      text NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true,
  left_on     date,
  snapshot_at timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, staff_id)
);
CREATE INDEX IF NOT EXISTS erp_staff_email ON public.erp_staff (lower(email)) WHERE email <> '';
CREATE INDEX IF NOT EXISTS erp_staff_name ON public.erp_staff (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.erp_staff_deliveries (
  company_id  integer PRIMARY KEY,
  snapshot_at timestamptz NOT NULL,
  staff       integer NOT NULL DEFAULT 0,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_staff_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_staff, public.erp_staff_deliveries FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('erp_staff', 'ERP staff list', 'Member services', '{}', 'none',
  p_reason => 'A mirror of the Houzs ERP''s staff, replaced whole by each delivery (erp_sync_events logs them).');
SELECT public.audit_register('erp_staff_deliveries', 'ERP staff deliveries', 'Member services', '{}', 'none',
  p_reason => 'One row a company: the last staff snapshot taken in.');

-- One company's whole list. Older than the snapshot held → 'stale', nothing changes. Everybody of the company the
-- delivery does not list is deleted (gone over there).
CREATE OR REPLACE FUNCTION public.ingest_erp_staff(p_batch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company  integer;
  v_snapshot timestamptz;
  v_last     timestamptz;
  v_row      jsonb;
  v_id       text;
  v_ids      text[] := '{}';
  v_kept     integer := 0;
  v_bad      integer := 0;
  v_gone     integer := 0;
  v_left     date;
BEGIN
  BEGIN
    v_company := (p_batch->>'companyId')::integer;
    v_snapshot := coalesce(nullif(p_batch->>'snapshotAt', '')::timestamptz, now());
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'companyId and snapshotAt must be a number and a time' USING ERRCODE = '22023';
  END;
  IF v_company IS NULL OR v_company <= 0 OR jsonb_typeof(p_batch->'staff') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'A staff delivery is a companyId and a list of staff' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_batch->'staff') > 5000 THEN
    RAISE EXCEPTION 'At most 5,000 staff in one delivery' USING ERRCODE = '22023';
  END IF;

  -- One company at a time, the newest kept: two pushes can overlap.
  PERFORM pg_advisory_xact_lock(hashtext('ingest_erp_staff'), v_company);
  SELECT d.snapshot_at INTO v_last FROM erp_staff_deliveries d WHERE d.company_id = v_company;
  IF v_last IS NOT NULL AND v_snapshot < v_last THEN
    RETURN jsonb_build_object('outcome', 'stale', 'snapshotAt', v_snapshot, 'kept', v_last);
  END IF;

  FOR v_row IN SELECT e FROM jsonb_array_elements(p_batch->'staff') e LOOP
    v_id := nullif(btrim(coalesce(v_row->>'staffId', '')), '');
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' OR v_id IS NULL OR length(v_id) > 64 OR v_id = ANY (v_ids) THEN
      v_bad := v_bad + 1;
      CONTINUE;
    END IF;
    BEGIN
      v_left := nullif(v_row->>'leftOn', '')::date;
    EXCEPTION WHEN others THEN
      v_left := NULL;
    END;
    v_ids := v_ids || v_id;
    INSERT INTO erp_staff AS s (company_id, staff_id, code, name, email, job, branch, active, left_on, snapshot_at, updated_at)
    VALUES (v_company, v_id,
            left(btrim(coalesce(v_row->>'code', '')), 40), left(btrim(coalesce(v_row->>'name', '')), 120),
            left(lower(btrim(coalesce(v_row->>'email', ''))), 200), left(btrim(coalesce(v_row->>'job', '')), 120),
            left(btrim(coalesce(v_row->>'branch', '')), 120),
            coalesce((v_row->>'active')::boolean, true), v_left, v_snapshot, now())
    ON CONFLICT (company_id, staff_id) DO UPDATE
      SET code = excluded.code, name = excluded.name, email = excluded.email, job = excluded.job, branch = excluded.branch,
          active = excluded.active, left_on = excluded.left_on, snapshot_at = excluded.snapshot_at, updated_at = now();
    v_kept := v_kept + 1;
  END LOOP;

  DELETE FROM erp_staff s WHERE s.company_id = v_company AND NOT (s.staff_id = ANY (v_ids));
  GET DIAGNOSTICS v_gone = ROW_COUNT;

  INSERT INTO erp_staff_deliveries AS d (company_id, snapshot_at, staff, applied_at)
  VALUES (v_company, v_snapshot, v_kept, now())
  ON CONFLICT (company_id) DO UPDATE SET snapshot_at = excluded.snapshot_at, staff = excluded.staff, applied_at = now();

  RETURN jsonb_build_object('outcome', 'applied', 'staff', v_kept, 'unreadable', v_bad, 'retired', v_gone);
END
$$;
REVOKE ALL ON FUNCTION public.ingest_erp_staff(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_erp_staff(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
