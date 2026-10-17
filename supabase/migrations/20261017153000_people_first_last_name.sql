-- A person's first and last name (2026-10-17 — the user, on the Revenue app's "Hello, LOO WEN": "它只能放两个字 …
-- 我希望只放一个字就好，也就是他们的姓。所以因为这个原因，在 People Manager 那边的 Profile 里，大家的名字需要拆分为
-- first name 和 last name。在这里的层面上就只放 first name 吧，不要放 last name").
--
-- 1. hr_staff_costs.first_name / last_name — what the apps call the person. The full name (employee_name) stays the
--    one on their IC: payroll, payslips and letters print it, and it is never made from these two.
-- 2. Filled from the full name as it is written: its first word the first name, the rest the last name
--    ("LOO WEN WEI" → LOO · WEN WEI — 他们的姓, as asked; "PETER" → PETER · none). HR changes either on the person's
--    page (People › person › Identity).
-- 3. Somebody added later is filled the same way; a full name corrected re-fills the two — unless HR had made them
--    something else (hr_staff_costs_split_name).
-- 4. The Revenue app greets by the first name: member_data_snapshot and member_principal_snapshot hand
--    `profile.firstName` — one statement swapped in place in PRODUCTION's bodies (pg_get_functiondef), refused
--    unless it is there exactly once; neither is re-created from a file (CLAUDE.md › Do NOT).

-- ── 1. The columns ──────────────────────────────────────────────────────────

ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.hr_staff_costs DROP CONSTRAINT IF EXISTS hr_staff_costs_first_name_check;
ALTER TABLE public.hr_staff_costs ADD CONSTRAINT hr_staff_costs_first_name_check
  CHECK (first_name IS NULL OR (btrim(first_name) <> '' AND length(first_name) <= 80));
ALTER TABLE public.hr_staff_costs DROP CONSTRAINT IF EXISTS hr_staff_costs_last_name_check;
ALTER TABLE public.hr_staff_costs ADD CONSTRAINT hr_staff_costs_last_name_check
  CHECK (last_name IS NULL OR (btrim(last_name) <> '' AND length(last_name) <= 120));
GRANT SELECT (first_name, last_name) ON public.hr_staff_costs TO authenticated;

-- ── 2. A full name's parts ──────────────────────────────────────────────────

-- "LOO  WEN WEI " → (LOO, WEN WEI); "PETER" → (PETER, NULL); blank → (NULL, NULL). Plain words, nobody's data: the
-- trigger below runs as whoever writes the row (HR's session on the person's page), so they call it too.
CREATE OR REPLACE FUNCTION public.person_name_parts(p_name text, OUT first_name text, OUT last_name text)
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT nullif(split_part(n, ' ', 1), ''), nullif(substr(n, length(split_part(n, ' ', 1)) + 2), '')
    FROM (SELECT regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g') AS n) x
$fn$;
REVOKE ALL ON FUNCTION public.person_name_parts(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_name_parts(text) TO authenticated, service_role;

-- ── 3. Filled on the way in, and when the full name is corrected ────────────

CREATE OR REPLACE FUNCTION public.hr_staff_costs_split_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_was record;
  v_now record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.first_name IS NULL AND NEW.last_name IS NULL THEN
      SELECT * INTO v_now FROM public.person_name_parts(NEW.employee_name);
      NEW.first_name := v_now.first_name;
      NEW.last_name := v_now.last_name;
    END IF;
  ELSIF NEW.employee_name IS DISTINCT FROM OLD.employee_name
        AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name
        AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name THEN
    -- The two follow a corrected full name only while they were its parts: a first name HR set stays.
    SELECT * INTO v_was FROM public.person_name_parts(OLD.employee_name);
    IF OLD.first_name IS NOT DISTINCT FROM v_was.first_name AND OLD.last_name IS NOT DISTINCT FROM v_was.last_name THEN
      SELECT * INTO v_now FROM public.person_name_parts(NEW.employee_name);
      NEW.first_name := v_now.first_name;
      NEW.last_name := v_now.last_name;
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.hr_staff_costs_split_name() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hr_staff_costs_split_name ON public.hr_staff_costs;
CREATE TRIGGER hr_staff_costs_split_name
  BEFORE INSERT OR UPDATE OF employee_name ON public.hr_staff_costs
  FOR EACH ROW EXECUTE FUNCTION public.hr_staff_costs_split_name();

-- Everybody on the roster today.
UPDATE public.hr_staff_costs s
   SET (first_name, last_name) = (SELECT p.first_name, p.last_name FROM public.person_name_parts(s.employee_name) p)
 WHERE s.first_name IS NULL AND s.last_name IS NULL;

-- ── 4. The Revenue app's greeting: profile.firstName ────────────────────────

DO $migration$
DECLARE
  v_fn   record;
  v_def  text;
BEGIN
  FOR v_fn IN
    SELECT * FROM (VALUES
      ('member_data_snapshot',
       $old$'name',s.employee_name,'email',u.email,'salary',s.basic_salary)$old$,
       $new$'name',s.employee_name,'firstName',coalesce(nullif(btrim(s.first_name),''),split_part(btrim(s.employee_name),' ',1)),'email',u.email,'salary',s.basic_salary)$new$),
      ('member_principal_snapshot',
       $old$'id',u.id,'userId',u.id,'name',coalesce(nullif(u.name,''),'Principal'),$old$,
       $new$'id',u.id,'userId',u.id,'name',coalesce(nullif(u.name,''),'Principal'),'firstName',coalesce((SELECT nullif(btrim(fs.first_name),'') FROM public.hr_staff_costs fs WHERE fs.user_id=u.id AND fs.status='active' ORDER BY fs.created_at LIMIT 1),split_part(btrim(coalesce(nullif(u.name,''),'Principal')),' ',1)),$new$)
    ) AS x(fn, old_text, new_text)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p
     WHERE p.proname = v_fn.fn AND p.pronamespace = 'public'::regnamespace
       AND pg_get_function_identity_arguments(p.oid) = 'p_full boolean';
    IF v_def IS NULL THEN RAISE EXCEPTION '%(p_full boolean) is missing', v_fn.fn; END IF;
    IF (length(v_def) - length(replace(v_def, v_fn.old_text, ''))) / length(v_fn.old_text) <> 1 THEN
      RAISE EXCEPTION '%: the profile''s name is not there exactly once', v_fn.fn;
    END IF;
    EXECUTE replace(v_def, v_fn.old_text, v_fn.new_text);
  END LOOP;
END
$migration$;
