-- ============================================================================
-- 20261011080000_hiring.sql
-- Hiring (HR revamp round 2 — the handoff's second package, README §11–13):
-- manpower requests from submission to filled, their candidates, the form
-- requesters fill in, the hiring sources, and the Talent Bank.
-- ============================================================================
--
-- Every table here has RLS on and NO policy: nothing reads or writes it
-- straight. Each read and write is one of the SECURITY DEFINER functions
-- below, and each asks the caller's Hiring cell first (mig 20261011060000):
--   hiring.view     hiring_board() — everything the three pages draw
--   hiring.create   a new request, a candidate, a talent, inviting a talent
--   hiring.edit     a candidate's details and status, the candidate fields,
--                   Form settings, the hiring sources, a talent's notes,
--                   résumé and removal, who assisted
--   hiring.approve  deciding somebody's request: acknowledge (with its owner),
--                   ask for more information, decline, change the owner,
--                   mark filled, cancel, reopen
-- The guest link (Admin › Guest Link, its own pull request) files a request
-- through hiring_file_guest_request() and reads the form through
-- hiring_guest_form() — both internal, executable by the service role and by
-- the guest link's own DEFINER functions (owned by postgres) only.
--
-- A request keeps the form as it stood when it was sent (`fields`), so Form
-- settings changes only what new requests ask. Its trail is
-- hiring_request_events (what, who, a note — the request page's Audit trail);
-- a talent's is hiring_talent_events.

-- ── 1. Numbers ──────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.hiring_request_no_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.hiring_talent_no_seq START 1;
REVOKE ALL ON SEQUENCE public.hiring_request_no_seq, public.hiring_talent_no_seq FROM PUBLIC, anon, authenticated;

-- ── 2. Tables ───────────────────────────────────────────────────────────────

CREATE TABLE public.hiring_form_fields (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{0,40}$'),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK (kind IN ('text', 'number', 'longtext', 'select', 'range')),
  options text NOT NULL DEFAULT '' CHECK (length(options) <= 2000),
  required boolean NOT NULL DEFAULT false,
  core boolean NOT NULL DEFAULT false,
  sort integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id)
);
ALTER TABLE public.hiring_form_fields ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_form_fields IS
  'Hiring › Form settings: what a requester fills in, in order. Position and Department are core (renamed, never removed). Read through hiring_board(), written by hiring_save_form_fields().';

CREATE TABLE public.hiring_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hiring_sources_name_key ON public.hiring_sources (lower(btrim(name)));
ALTER TABLE public.hiring_sources ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_sources IS
  'Hiring › Form settings › Hiring sources: where a hire came from — picked when a request is marked filled, counted in Insights.';

CREATE TABLE public.hiring_requests (
  id text PRIMARY KEY CHECK (id ~ '^HR-[0-9]{3,}$'),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'needs_info', 'acknowledged', 'filled', 'cancelled', 'declined')),
  source text NOT NULL DEFAULT 'portal' CHECK (source IN ('portal', 'guest')),
  requested_by uuid REFERENCES public.hr_staff_costs(id),
  requester_name text NOT NULL CHECK (length(btrim(requester_name)) BETWEEN 1 AND 120),
  requester_department text,
  requester_company text,
  requester_phone text,
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'array'),
  answers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(answers) = 'object'),
  owner_id uuid REFERENCES public.hr_staff_costs(id),
  assisted_by uuid REFERENCES public.hr_staff_costs(id),
  hired_names text[] NOT NULL DEFAULT '{}',
  hired_through text,
  hiring_cost numeric(15,2) CHECK (hiring_cost IS NULL OR hiring_cost >= 0),
  attachment_path text,
  attachment_name text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  filled_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source = 'guest' OR requested_by IS NOT NULL)
);
CREATE INDEX hiring_requests_status_idx ON public.hiring_requests (status, submitted_at DESC);
ALTER TABLE public.hiring_requests ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_requests IS
  'Hiring requests (HR-001 …): submitted → needs_info / acknowledged → filled, or declined / cancelled. `fields` = the form as it stood; `answers` its answers. Read through hiring_board().';

CREATE TABLE public.hiring_request_events (
  id bigserial PRIMARY KEY,
  request_id text NOT NULL REFERENCES public.hiring_requests(id) ON DELETE CASCADE,
  what text NOT NULL,
  actor_name text NOT NULL,
  actor_id uuid,
  note text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hiring_request_events_request_idx ON public.hiring_request_events (request_id, at, id);
ALTER TABLE public.hiring_request_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_request_events IS
  'A hiring request''s trail, written by its functions: Submitted, Acknowledged, Candidate added … (the request page''s Audit trail).';

CREATE TABLE public.hiring_candidate_fields (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{0,40}$'),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('text', 'number', 'date', 'choice')),
  options text NOT NULL DEFAULT '' CHECK (length(options) <= 1000),
  sort integer NOT NULL
);
ALTER TABLE public.hiring_candidate_fields ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_candidate_fields IS
  'Candidate fields: what HR fills in for each candidate beyond name, phone, status, note and résumé.';

CREATE TABLE public.hiring_talents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  no text NOT NULL UNIQUE CHECK (no ~ '^T-[0-9]{3,}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  position text NOT NULL CHECK (length(btrim(position)) BETWEEN 1 AND 120),
  department text NOT NULL CHECK (length(btrim(department)) BETWEEN 1 AND 80),
  from_request text REFERENCES public.hiring_requests(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 8000),
  resume_path text,
  resume_name text,
  saved_by_name text NOT NULL,
  saved_by uuid REFERENCES public.users(id),
  saved_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid REFERENCES public.users(id)
);
ALTER TABLE public.hiring_talents ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_talents IS
  'The Talent Bank: good candidates kept on file (T-001 …). Removing one keeps the row (removed_at) — its history stays.';

CREATE TABLE public.hiring_talent_events (
  id bigserial PRIMARY KEY,
  talent_id uuid NOT NULL REFERENCES public.hiring_talents(id) ON DELETE CASCADE,
  what text NOT NULL,
  actor_name text NOT NULL,
  actor_id uuid,
  note text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hiring_talent_events_talent_idx ON public.hiring_talent_events (talent_id, at, id);
ALTER TABLE public.hiring_talent_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_talent_events IS 'A talent''s History: saved, invited to interview, résumé replaced.';

CREATE TABLE public.hiring_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL REFERENCES public.hiring_requests(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  phone text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'Applied' CHECK (length(source) BETWEEN 1 AND 60),
  stage text NOT NULL DEFAULT 'shortlisted' CHECK (stage IN ('shortlisted', 'appointment', 'offered', 'hired', 'rejected')),
  talent_id uuid REFERENCES public.hiring_talents(id) ON DELETE SET NULL,
  answers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(answers) = 'object'),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 4000),
  resume_path text,
  resume_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hiring_candidates_request_idx ON public.hiring_candidates (request_id, created_at);
ALTER TABLE public.hiring_candidates ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_candidates IS 'A request''s candidates and the stage each has reached.';

-- ── 3. What it starts with (the handoff's own lists) ────────────────────────

INSERT INTO public.hiring_form_fields (id, label, kind, options, required, core, sort) VALUES
  ('position', 'Position', 'text', '', true, true, 1),
  ('dept', 'Department', 'select', 'Revenue · Fair, Revenue · IR, HR, Finance, Marketing, IT, Director Office', true, true, 2),
  ('headcount', 'Headcount', 'number', '', true, false, 3),
  ('budget', 'Budget (RM / month)', 'range', '', true, false, 4),
  ('start', 'Expected start', 'select', 'Immediately, Within 1 month, Within 2 months, Within 3 months', true, false, 5),
  ('emp', 'Employment type', 'select', 'Full-time, Part-time, Contract, Internship', false, false, 6),
  ('reason', 'Reason', 'select', 'New position, Replacement, Expansion', false, false, 7),
  ('age', 'Age requirement', 'range', '', false, false, 8),
  ('gender', 'Gender', 'select', 'Any, Male, Female', false, false, 9),
  ('race', 'Race', 'select', 'Any, Malay, Chinese, Indian, Others', false, false, 10),
  ('jd', 'Job description', 'longtext', '', true, false, 11),
  ('notes', 'Special notes', 'longtext', '', false, false, 12)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hiring_sources (name, sort) VALUES
  ('Jobstreet', 1), ('LinkedIn', 2), ('Social Media', 3), ('Referral', 4), ('Walk-in', 5), ('Other', 6)
ON CONFLICT DO NOTHING;

INSERT INTO public.hiring_candidate_fields (id, label, kind, options, sort) VALUES
  ('salary', 'Expected salary (RM)', 'number', '', 1),
  ('avail', 'Available from', 'date', '', 2),
  ('transport', 'Own transport', 'choice', 'Yes, No', 3)
ON CONFLICT (id) DO NOTHING;

-- ── 4. The app-wide history ─────────────────────────────────────────────────

SELECT public.audit_register('hiring_requests', 'Hiring requests', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{requester_name}');
SELECT public.audit_register('hiring_candidates', 'Hiring candidates', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{name,request_id}');
SELECT public.audit_register('hiring_form_fields', 'Hiring form', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{label}');
SELECT public.audit_register('hiring_sources', 'Hiring sources', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{name}');
SELECT public.audit_register('hiring_candidate_fields', 'Candidate fields', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{label}');
SELECT public.audit_register('hiring_talents', 'Talent Bank', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{no,name}');
SELECT public.audit_register('hiring_request_events', 'Hiring request trail', 'People', '{}', 'none',
  p_reason => 'A request''s own trail, written by its functions — a record already.');
SELECT public.audit_register('hiring_talent_events', 'Talent history', 'People', '{}', 'none',
  p_reason => 'A talent''s own history, written by its functions — a record already.');

-- ── 5. Files: résumés and attachments (private) ─────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hiring-files', 'hiring-files', false, 10485760, ARRAY[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png', 'image/jpeg', 'image/webp'
])
ON CONFLICT (id) DO NOTHING;

-- Résumés and attachments are read through a short signed link made at the
-- press; uploading asks Create or Edit. Guest uploads (the guest link's own
-- pull request) go under guest/ through its function, never this policy.
CREATE POLICY hiring_files_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hiring-files' AND (SELECT public.has_any_action(ARRAY['hiring.view'])));
CREATE POLICY hiring_files_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hiring-files' AND (storage.foldername(name))[1] IN ('resumes', 'attachments')
    AND (SELECT public.has_any_action(ARRAY['hiring.create', 'hiring.edit'])));

-- ── 6. Helpers (internal) ───────────────────────────────────────────────────

-- Who is acting, as the trails name them: their roster name, else the account's.
CREATE OR REPLACE FUNCTION public.hiring_actor_name()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN coalesce(
    (SELECT nullif(btrim(s.employee_name), '') FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() ORDER BY s.status = 'active' DESC LIMIT 1),
    (SELECT nullif(btrim(u.name), '') FROM public.users u WHERE u.id = auth.uid()),
    'HR');
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_stage_label(p_stage text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  RETURN CASE p_stage
    WHEN 'shortlisted' THEN 'Shortlisted'
    WHEN 'appointment' THEN 'Done appointment'
    WHEN 'offered' THEN 'Offered'
    WHEN 'hired' THEN 'Hired'
    WHEN 'rejected' THEN 'Not selected'
    ELSE p_stage END;
END
$fn$;

-- A department's short name, as the requests show it ("Revenue", not "Revenue Department").
CREATE OR REPLACE FUNCTION public.hiring_department_label(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  RETURN nullif(regexp_replace(coalesce(p_name, ''), '\s+Department$', ''), '');
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_log(p_request text, p_what text, p_actor text, p_note text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.hiring_request_events (request_id, what, actor_name, actor_id, note)
  VALUES (p_request, p_what, coalesce(nullif(btrim(p_actor), ''), public.hiring_actor_name()), auth.uid(), coalesce(p_note, ''));
  UPDATE public.hiring_requests SET updated_at = now() WHERE id = p_request;
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_talent_log(p_talent uuid, p_what text, p_note text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.hiring_talent_events (talent_id, what, actor_name, actor_id, note)
  VALUES (p_talent, p_what, public.hiring_actor_name(), auth.uid(), coalesce(p_note, ''));
END
$fn$;

-- The answers kept for a form: only its own fields, each a trimmed string.
-- A required field left blank refuses the whole request, naming every one.
CREATE OR REPLACE FUNCTION public.hiring_clean_answers(p_fields jsonb, p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_out jsonb := '{}';
  v_field jsonb;
  v_value text;
  v_missing text[] := '{}';
BEGIN
  IF jsonb_typeof(coalesce(p_answers, '{}')) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'The answers are not in the right shape' USING ERRCODE = '22023';
  END IF;
  FOR v_field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    v_value := btrim(coalesce(p_answers ->> (v_field ->> 'id'), ''));
    IF length(v_value) > 4000 THEN
      RAISE EXCEPTION '% is too long', v_field ->> 'label' USING ERRCODE = '22023';
    END IF;
    IF (v_field ->> 'required')::boolean AND btrim(replace(v_value, '–', '')) = '' THEN
      v_missing := v_missing || (v_field ->> 'label');
    END IF;
    IF v_value <> '' THEN
      v_out := v_out || jsonb_build_object(v_field ->> 'id', v_value);
    END IF;
  END LOOP;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Fill in %.', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;
  RETURN v_out;
END
$fn$;

-- The form as a request keeps it.
CREATE OR REPLACE FUNCTION public.hiring_current_form()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label, 'type', f.kind, 'options', f.options,
            'required', f.required, 'core', f.core) ORDER BY f.sort, f.id), '[]'::jsonb)
            FROM public.hiring_form_fields f);
END
$fn$;

-- Files a request — the one door both the portal's "+ New request" and the
-- guest link go through. Internal: each caller checks who may.
CREATE OR REPLACE FUNCTION public.hiring_file_request(
  p_source text, p_requested_by uuid, p_name text, p_department text, p_company text, p_phone text,
  p_answers jsonb, p_attachment_path text, p_attachment_name text, p_event text, p_event_note text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_form jsonb := public.hiring_current_form();
  v_answers jsonb := public.hiring_clean_answers(v_form, p_answers);
  v_id text := 'HR-' || lpad(nextval('public.hiring_request_no_seq')::text, 3, '0');
BEGIN
  IF p_attachment_path IS NOT NULL AND p_attachment_path !~ '^(attachments|guest)/' THEN
    RAISE EXCEPTION 'An attachment lives under attachments/ or guest/' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hiring_requests (id, source, requested_by, requester_name, requester_department, requester_company,
    requester_phone, fields, answers, attachment_path, attachment_name, created_by)
  VALUES (v_id, p_source, p_requested_by, btrim(p_name), nullif(btrim(coalesce(p_department, '')), ''),
    nullif(btrim(coalesce(p_company, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''), v_form, v_answers,
    p_attachment_path, nullif(btrim(coalesce(p_attachment_name, '')), ''), auth.uid());
  PERFORM public.hiring_log(v_id, p_event, btrim(p_name), p_event_note);
  RETURN v_id;
END
$fn$;

-- ── 7. The guest link's two doors (internal; wrapped by Admin › Guest Link) ──

-- The form a guest fills in: the requester form as Form settings has it.
CREATE OR REPLACE FUNCTION public.hiring_guest_form()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN public.hiring_current_form();
END
$fn$;

-- A guest's request: their company, their name, a phone, the answers, an
-- attachment already stored under guest/. Event "Submitted via guest link".
CREATE OR REPLACE FUNCTION public.hiring_file_guest_request(
  p_company text, p_department text, p_name text, p_phone text, p_answers jsonb,
  p_attachment_path text DEFAULT NULL, p_attachment_name text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF length(btrim(coalesce(p_company, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Say which company is asking' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_name, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Add your name' USING ERRCODE = '22023';
  END IF;
  IF p_attachment_path IS NOT NULL AND p_attachment_path !~ '^guest/' THEN
    RAISE EXCEPTION 'A guest''s attachment lives under guest/' USING ERRCODE = '22023';
  END IF;
  RETURN public.hiring_file_request('guest', NULL, p_name, p_department, p_company, p_phone, p_answers,
    p_attachment_path, p_attachment_name, 'Submitted via guest link', btrim(p_company));
END
$fn$;

-- ── 8. The board: everything the Hiring pages draw ──────────────────────────

CREATE OR REPLACE FUNCTION public.hiring_board()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['hiring.view']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring access is required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'fields', public.hiring_current_form(),
    'sources', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'active', s.active,
        'used', (SELECT count(*) FROM public.hiring_requests r WHERE lower(r.hired_through) = lower(s.name)))
        ORDER BY s.sort, s.created_at), '[]'::jsonb) FROM public.hiring_sources s),
    'candidateFields', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label, 'type', f.kind,
        'options', f.options) ORDER BY f.sort, f.id), '[]'::jsonb) FROM public.hiring_candidate_fields f),
    'people', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name,
        'title', coalesce(t.name, s.designation, ''), 'department', coalesce(public.hiring_department_label(d.name), ''))
        ORDER BY d.name NULLS LAST, s.employee_name), '[]'::jsonb)
        FROM public.hr_staff_costs s
        LEFT JOIN public.departments d ON d.id = s.department_id
        LEFT JOIN public.titles t ON t.id = s.title_id
       WHERE s.status = 'active'),
    'requests', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'source', r.source, 'requestedBy', r.requested_by,
        'requesterName', r.requester_name, 'requesterDepartment', r.requester_department,
        'requesterCompany', r.requester_company, 'requesterPhone', r.requester_phone,
        'fields', r.fields, 'answers', r.answers, 'ownerId', r.owner_id, 'assistedBy', r.assisted_by,
        'hiredNames', to_jsonb(r.hired_names), 'hiredThrough', r.hired_through, 'hiringCost', r.hiring_cost,
        'attachmentName', r.attachment_name, 'submittedAt', r.submitted_at, 'acknowledgedAt', r.acknowledged_at,
        'filledAt', r.filled_at, 'closedAt', r.closed_at,
        'candidates', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone,
            'source', c.source, 'stage', c.stage,
            'talentId', CASE WHEN EXISTS (SELECT 1 FROM public.hiring_talents t WHERE t.id = c.talent_id AND t.removed_at IS NULL) THEN c.talent_id END,
            'answers', c.answers, 'note', c.note, 'resumeName', c.resume_name) ORDER BY c.created_at, c.id), '[]'::jsonb)
            FROM public.hiring_candidates c WHERE c.request_id = r.id),
        'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('what', e.what, 'who', e.actor_name, 'note', e.note, 'at', e.at)
            ORDER BY e.at, e.id), '[]'::jsonb) FROM public.hiring_request_events e WHERE e.request_id = r.id)
        ) ORDER BY r.submitted_at DESC, r.id DESC), '[]'::jsonb) FROM public.hiring_requests r),
    'talents', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'no', t.no, 'name', t.name, 'phone', t.phone, 'email', t.email, 'position', t.position,
        'department', t.department, 'fromRequest', t.from_request, 'notes', t.notes, 'resumeName', t.resume_name,
        'savedBy', t.saved_by_name, 'savedAt', t.saved_at,
        'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('what', e.what, 'who', e.actor_name, 'note', e.note, 'at', e.at)
            ORDER BY e.at, e.id), '[]'::jsonb) FROM public.hiring_talent_events e WHERE e.talent_id = t.id)
        ) ORDER BY t.saved_at DESC, t.no DESC), '[]'::jsonb) FROM public.hiring_talents t WHERE t.removed_at IS NULL),
    'me', jsonb_build_object(
        'staffId', (SELECT s.id FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active' LIMIT 1),
        'name', public.hiring_actor_name())
  );
END
$fn$;

-- ── 9. Requests ─────────────────────────────────────────────────────────────

-- "+ New request": filed for somebody on the roster (Requested by).
CREATE OR REPLACE FUNCTION public.hiring_submit(p_requested_by uuid, p_answers jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text;
  v_dept text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create is required' USING ERRCODE = '42501';
  END IF;
  SELECT s.employee_name, public.hiring_department_label(d.name) INTO v_name, v_dept
    FROM public.hr_staff_costs s LEFT JOIN public.departments d ON d.id = s.department_id
   WHERE s.id = p_requested_by AND s.status = 'active';
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Pick who is asking — somebody working here today' USING ERRCODE = '22023';
  END IF;
  RETURN public.hiring_file_request('portal', p_requested_by, v_name, v_dept, NULL, NULL, p_answers,
    NULL, NULL, 'Submitted', '');
END
$fn$;

-- The owner is somebody in HR, working here today.
CREATE OR REPLACE FUNCTION public.hiring_hr_staff_name(p_staff uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN (SELECT s.employee_name FROM public.hr_staff_costs s JOIN public.departments d ON d.id = s.department_id
           WHERE s.id = p_staff AND s.status = 'active' AND d.name = 'HR');
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_staff_name(p_staff uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = p_staff);
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_lock(p_id text, p_statuses text[], p_refusal text)
RETURNS public.hiring_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hiring_requests;
BEGIN
  SELECT * INTO v_row FROM public.hiring_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request is not there any more' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_row.status = ANY (p_statuses)) THEN
    RAISE EXCEPTION '%', p_refusal USING ERRCODE = '22023';
  END IF;
  RETURN v_row;
END
$fn$;

-- Acknowledge: somebody in HR takes it on (the owner names the event).
CREATE OR REPLACE FUNCTION public.hiring_acknowledge(p_id text, p_owner uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner text := public.hiring_hr_staff_name(p_owner);
  v_note text := btrim(coalesce(p_note, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.approve']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Approve is required' USING ERRCODE = '42501';
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Pick the owner first.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.hiring_lock(p_id, ARRAY['submitted', 'needs_info'], 'Only a pending request is acknowledged');
  UPDATE public.hiring_requests SET status = 'acknowledged', owner_id = p_owner, acknowledged_at = now() WHERE id = p_id;
  PERFORM public.hiring_log(p_id, 'Acknowledged', v_owner,
    'Takes responsibility for this hire' || CASE WHEN v_note <> '' THEN ' · ' || v_note ELSE '' END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_request_info(p_id text, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_note text := btrim(coalesce(p_note, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.approve']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Approve is required' USING ERRCODE = '42501';
  END IF;
  IF v_note = '' THEN
    RAISE EXCEPTION 'Write what you need from the requester.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.hiring_lock(p_id, ARRAY['submitted', 'needs_info'], 'Only a pending request can ask for more information');
  UPDATE public.hiring_requests SET status = 'needs_info' WHERE id = p_id;
  PERFORM public.hiring_log(p_id, 'More info requested', NULL, v_note);
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_decline(p_id text, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_note text := btrim(coalesce(p_note, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.approve']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Approve is required' USING ERRCODE = '42501';
  END IF;
  IF v_note = '' THEN
    RAISE EXCEPTION 'Give a reason for declining.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.hiring_lock(p_id, ARRAY['submitted', 'needs_info'], 'Only a pending request is declined');
  UPDATE public.hiring_requests SET status = 'declined', closed_at = now() WHERE id = p_id;
  PERFORM public.hiring_log(p_id, 'Declined', NULL, v_note);
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_set_owner(p_id text, p_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hiring_requests;
  v_owner text := public.hiring_hr_staff_name(p_owner);
BEGIN
  IF public.has_any_action(ARRAY['hiring.approve']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Approve is required' USING ERRCODE = '42501';
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'The owner is somebody in HR' USING ERRCODE = '22023';
  END IF;
  v_row := public.hiring_lock(p_id, ARRAY['acknowledged'], 'The owner changes while the request is being worked on');
  IF v_row.owner_id IS NOT DISTINCT FROM p_owner THEN RETURN; END IF;
  UPDATE public.hiring_requests SET owner_id = p_owner WHERE id = p_id;
  PERFORM public.hiring_log(p_id, 'Owner changed', NULL,
    coalesce(public.hiring_staff_name(v_row.owner_id), 'Nobody') || ' → ' || v_owner);
END
$fn$;

-- Helped by others: who assisted, for HR's own record (or nobody again).
CREATE OR REPLACE FUNCTION public.hiring_set_assist(p_id text, p_staff uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hiring_requests;
  v_name text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit', 'hiring.approve']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  v_row := public.hiring_lock(p_id, ARRAY['acknowledged'], 'Who helped is recorded while the request is being worked on');
  IF p_staff IS NULL THEN
    IF v_row.assisted_by IS NULL THEN RETURN; END IF;
    UPDATE public.hiring_requests SET assisted_by = NULL WHERE id = p_id;
    PERFORM public.hiring_log(p_id, 'Assist removed', NULL, coalesce(public.hiring_staff_name(v_row.assisted_by), ''));
    RETURN;
  END IF;
  SELECT s.employee_name INTO v_name FROM public.hr_staff_costs s WHERE s.id = p_staff AND s.status = 'active';
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Pick somebody working here today' USING ERRCODE = '22023';
  END IF;
  IF p_staff IS NOT DISTINCT FROM v_row.owner_id THEN
    RAISE EXCEPTION 'The owner is already on it — pick somebody else' USING ERRCODE = '22023';
  END IF;
  IF v_row.assisted_by IS NOT DISTINCT FROM p_staff THEN RETURN; END IF;
  UPDATE public.hiring_requests SET assisted_by = p_staff WHERE id = p_id;
  PERFORM public.hiring_log(p_id, 'Assisted by', NULL, v_name);
END
$fn$;

-- Mark filled: who was hired (this request's candidates), through which
-- source, at what cost. The hired candidates' stage becomes Hired.
CREATE OR REPLACE FUNCTION public.hiring_fill(p_id text, p_hired text[], p_source text, p_cost numeric DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_hired text[] := ARRAY(SELECT DISTINCT btrim(h) FROM unnest(coalesce(p_hired, '{}')) h WHERE btrim(h) <> '');
  v_source text;
  v_note text := btrim(coalesce(p_note, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.approve']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Approve is required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.hiring_lock(p_id, ARRAY['acknowledged'], 'Only an acknowledged request is marked filled');
  IF cardinality(v_hired) = 0 THEN
    RAISE EXCEPTION 'Choose who was hired, then Mark filled' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_hired) h WHERE NOT EXISTS (
      SELECT 1 FROM public.hiring_candidates c WHERE c.request_id = p_id AND c.name = h AND c.stage <> 'rejected')) THEN
    RAISE EXCEPTION 'Everyone hired must be one of this request''s candidates' USING ERRCODE = '22023';
  END IF;
  SELECT s.name INTO v_source FROM public.hiring_sources s WHERE lower(s.name) = lower(btrim(coalesce(p_source, ''))) AND s.active;
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Pick where you found them, then Mark filled' USING ERRCODE = '22023';
  END IF;
  IF p_cost IS NOT NULL AND p_cost < 0 THEN
    RAISE EXCEPTION 'The cost cannot be below zero' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hiring_requests SET status = 'filled', hired_names = v_hired, hired_through = v_source,
    hiring_cost = p_cost, filled_at = now(), closed_at = now() WHERE id = p_id;
  UPDATE public.hiring_candidates SET stage = 'hired', updated_at = now()
   WHERE request_id = p_id AND name = ANY (v_hired) AND stage <> 'rejected';
  PERFORM public.hiring_log(p_id, 'Filled', NULL, 'Hired: ' || array_to_string(v_hired, ', ') || ' · via ' || v_source
    || CASE WHEN p_cost IS NOT NULL AND p_cost > 0 THEN ' · cost RM ' || regexp_replace(to_char(p_cost, 'FM999999990.00'), '\.00$', '') ELSE '' END
    || CASE WHEN v_note <> '' THEN ' · ' || v_note ELSE '' END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_cancel(p_id text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_note text := btrim(coalesce(p_note, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.approve']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Approve is required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.hiring_lock(p_id, ARRAY['submitted', 'needs_info', 'acknowledged'], 'Only an open request is cancelled');
  UPDATE public.hiring_requests SET status = 'cancelled', closed_at = now() WHERE id = p_id;
  PERFORM public.hiring_log(p_id, 'Cancelled', NULL, CASE WHEN v_note <> '' THEN v_note ELSE 'No longer needed' END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_reopen(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['hiring.approve']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Approve is required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.hiring_lock(p_id, ARRAY['filled', 'cancelled'], 'Only a filled or cancelled request is reopened');
  UPDATE public.hiring_requests SET status = 'acknowledged', hired_names = '{}', filled_at = NULL, closed_at = NULL,
    acknowledged_at = coalesce(acknowledged_at, now()) WHERE id = p_id;
  PERFORM public.hiring_log(p_id, 'Reopened', NULL, '');
END
$fn$;

-- ── 10. Candidates ──────────────────────────────────────────────────────────

-- A candidate's own answers: only the candidate fields, each a trimmed string.
CREATE OR REPLACE FUNCTION public.hiring_clean_candidate_answers(p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_out jsonb := '{}';
  v_value text;
  v_field record;
BEGIN
  IF jsonb_typeof(coalesce(p_answers, '{}')) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'The details are not in the right shape' USING ERRCODE = '22023';
  END IF;
  FOR v_field IN SELECT id, kind FROM public.hiring_candidate_fields LOOP
    v_value := btrim(coalesce(p_answers ->> v_field.id, ''));
    IF v_value = '' THEN CONTINUE; END IF;
    IF length(v_value) > 400 THEN RAISE EXCEPTION 'A detail is too long' USING ERRCODE = '22023'; END IF;
    IF v_field.kind = 'number' AND v_value !~ '^[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'A number field takes a number' USING ERRCODE = '22023';
    END IF;
    IF v_field.kind = 'date' AND v_value !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'A date field takes a date' USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object(v_field.id, v_value);
  END LOOP;
  RETURN v_out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_candidate_add(p_request text, p_name text, p_phone text, p_stage text,
  p_note text, p_answers jsonb, p_resume_path text DEFAULT NULL, p_resume_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create is required' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Add the candidate’s name' USING ERRCODE = '22023'; END IF;
  IF p_resume_path IS NOT NULL AND p_resume_path !~ '^resumes/' THEN
    RAISE EXCEPTION 'A résumé lives under resumes/' USING ERRCODE = '22023';
  END IF;
  PERFORM public.hiring_lock(p_request, ARRAY['submitted', 'needs_info', 'acknowledged', 'filled', 'cancelled'], 'A declined request takes no candidates');
  INSERT INTO public.hiring_candidates (request_id, name, phone, source, stage, answers, note, resume_path, resume_name, created_by)
  VALUES (p_request, v_name, btrim(coalesce(p_phone, '')), 'Applied', coalesce(p_stage, 'shortlisted'),
    public.hiring_clean_candidate_answers(p_answers), btrim(coalesce(p_note, '')), p_resume_path,
    nullif(btrim(coalesce(p_resume_name, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.hiring_log(p_request, 'Candidate added', NULL, v_name || ' · ' || public.hiring_stage_label(coalesce(p_stage, 'shortlisted')));
  RETURN v_id;
END
$fn$;

-- Edit details: a new résumé replaces the old one only when one is given.
CREATE OR REPLACE FUNCTION public.hiring_candidate_edit(p_candidate uuid, p_name text, p_phone text, p_stage text,
  p_note text, p_answers jsonb, p_resume_path text DEFAULT NULL, p_resume_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_old public.hiring_candidates;
  v_name text := btrim(coalesce(p_name, ''));
  v_note text := btrim(coalesce(p_note, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_old FROM public.hiring_candidates WHERE id = p_candidate FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That candidate is not there any more' USING ERRCODE = '22023'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Name can’t be empty' USING ERRCODE = '22023'; END IF;
  IF p_resume_path IS NOT NULL AND p_resume_path !~ '^resumes/' THEN
    RAISE EXCEPTION 'A résumé lives under resumes/' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hiring_candidates SET name = v_name, phone = btrim(coalesce(p_phone, '')),
    stage = coalesce(p_stage, stage), note = v_note, answers = public.hiring_clean_candidate_answers(p_answers),
    resume_path = coalesce(p_resume_path, resume_path),
    resume_name = CASE WHEN p_resume_path IS NOT NULL THEN nullif(btrim(coalesce(p_resume_name, '')), '') ELSE resume_name END,
    updated_at = now()
   WHERE id = p_candidate;
  PERFORM public.hiring_log(v_old.request_id, 'Candidate edited', NULL,
    v_name || CASE WHEN v_note <> '' AND v_note IS DISTINCT FROM v_old.note THEN ' · note: ' || v_note ELSE '' END);
  IF p_stage IS NOT NULL AND p_stage IS DISTINCT FROM v_old.stage THEN
    PERFORM public.hiring_log(v_old.request_id, 'Candidate status', NULL, v_name || ' → ' || public.hiring_stage_label(p_stage));
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_candidate_stage(p_candidate uuid, p_stage text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_old public.hiring_candidates;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_old FROM public.hiring_candidates WHERE id = p_candidate FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That candidate is not there any more' USING ERRCODE = '22023'; END IF;
  IF p_stage IS NOT DISTINCT FROM v_old.stage THEN RETURN; END IF;
  UPDATE public.hiring_candidates SET stage = p_stage, updated_at = now() WHERE id = p_candidate;
  PERFORM public.hiring_log(v_old.request_id, 'Candidate status', NULL, v_old.name || ' → ' || public.hiring_stage_label(p_stage));
END
$fn$;

-- A file's place, for the signed link the app makes at the press (and the
-- trail's "Résumé downloaded" when it is a download).
CREATE OR REPLACE FUNCTION public.hiring_file_of(p_kind text, p_id text, p_download boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_path text;
  v_name text;
  v_request text;
  v_who text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.view']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring access is required' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'candidate' THEN
    SELECT c.resume_path, c.resume_name, c.request_id, c.name INTO v_path, v_name, v_request, v_who
      FROM public.hiring_candidates c WHERE c.id = p_id::uuid;
  ELSIF p_kind = 'talent' THEN
    SELECT t.resume_path, t.resume_name INTO v_path, v_name FROM public.hiring_talents t WHERE t.id = p_id::uuid AND t.removed_at IS NULL;
  ELSIF p_kind = 'attachment' THEN
    SELECT r.attachment_path, r.attachment_name INTO v_path, v_name FROM public.hiring_requests r WHERE r.id = p_id;
  ELSE
    RAISE EXCEPTION 'Unknown file' USING ERRCODE = '22023';
  END IF;
  IF v_path IS NULL THEN RETURN NULL; END IF;
  IF p_download AND p_kind = 'candidate' THEN
    PERFORM public.hiring_log(v_request, 'Résumé downloaded', NULL, v_who);
  END IF;
  RETURN jsonb_build_object('path', v_path, 'name', coalesce(v_name, 'file'));
END
$fn$;

-- ── 11. Settings ────────────────────────────────────────────────────────────

-- Form settings: the whole list, in order. Position and Department stay, stay
-- required and keep their kind; their labels may change.
CREATE OR REPLACE FUNCTION public.hiring_save_form_fields(p_fields jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_field jsonb;
  v_ids text[] := '{}';
  v_id text;
  v_kind text;
  v_label text;
  v_i integer := 0;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'array' OR jsonb_array_length(p_fields) NOT BETWEEN 2 AND 40 THEN
    RAISE EXCEPTION 'A form has from 2 to 40 fields' USING ERRCODE = '22023';
  END IF;
  FOR v_field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    v_id := v_field ->> 'id';
    v_kind := v_field ->> 'type';
    v_label := btrim(coalesce(v_field ->> 'label', ''));
    IF v_id IS NULL OR v_id !~ '^[a-z][a-z0-9_]{0,40}$' OR v_id = ANY (v_ids) THEN
      RAISE EXCEPTION 'Every field needs its own id' USING ERRCODE = '22023';
    END IF;
    v_ids := v_ids || v_id;
    IF length(v_label) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Every field needs a name' USING ERRCODE = '22023';
    END IF;
    IF v_kind IS NULL OR v_kind NOT IN ('text', 'number', 'longtext', 'select', 'range') THEN
      RAISE EXCEPTION 'An answer is Short text, Number, Long text, Choice or Range' USING ERRCODE = '22023';
    END IF;
    IF (v_id = 'position' AND v_kind <> 'text') OR (v_id = 'dept' AND v_kind <> 'select') THEN
      RAISE EXCEPTION '% is a core field', v_label USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NOT (v_ids @> ARRAY['position', 'dept']) THEN
    RAISE EXCEPTION 'Position and Department are core fields — they stay' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.hiring_form_fields WHERE NOT (id = ANY (v_ids));
  FOR v_field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    v_i := v_i + 1;
    v_id := v_field ->> 'id';
    INSERT INTO public.hiring_form_fields (id, label, kind, options, required, core, sort, updated_at, updated_by)
    VALUES (v_id, btrim(v_field ->> 'label'), v_field ->> 'type', btrim(coalesce(v_field ->> 'options', '')),
      v_id IN ('position', 'dept') OR coalesce((v_field ->> 'required')::boolean, false), v_id IN ('position', 'dept'), v_i, now(), auth.uid())
    ON CONFLICT (id) DO UPDATE SET label = excluded.label, kind = excluded.kind, options = excluded.options,
      required = excluded.required, core = excluded.core, sort = excluded.sort, updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
    WHERE (hiring_form_fields.label, hiring_form_fields.kind, hiring_form_fields.options, hiring_form_fields.required, hiring_form_fields.sort)
      IS DISTINCT FROM (excluded.label, excluded.kind, excluded.options, excluded.required, excluded.sort);
  END LOOP;
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_save_candidate_fields(p_fields jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_field jsonb;
  v_ids text[] := '{}';
  v_id text;
  v_i integer := 0;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'array' OR jsonb_array_length(p_fields) > 20 THEN
    RAISE EXCEPTION 'Up to 20 candidate fields' USING ERRCODE = '22023';
  END IF;
  FOR v_field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    v_id := v_field ->> 'id';
    IF v_id IS NULL OR v_id !~ '^[a-z][a-z0-9_]{0,40}$' OR v_id = ANY (v_ids) THEN
      RAISE EXCEPTION 'Every field needs its own id' USING ERRCODE = '22023';
    END IF;
    v_ids := v_ids || v_id;
    IF length(btrim(coalesce(v_field ->> 'label', ''))) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'Every field needs a name' USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_field ->> 'type', '') NOT IN ('text', 'number', 'date', 'choice') THEN
      RAISE EXCEPTION 'A field is Short text, Number, Date or Dropdown' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  DELETE FROM public.hiring_candidate_fields WHERE NOT (id = ANY (v_ids));
  FOR v_field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    v_i := v_i + 1;
    INSERT INTO public.hiring_candidate_fields (id, label, kind, options, sort)
    VALUES (v_field ->> 'id', btrim(v_field ->> 'label'), v_field ->> 'type', btrim(coalesce(v_field ->> 'options', '')), v_i)
    ON CONFLICT (id) DO UPDATE SET label = excluded.label, kind = excluded.kind, options = excluded.options, sort = excluded.sort
    WHERE (hiring_candidate_fields.label, hiring_candidate_fields.kind, hiring_candidate_fields.options, hiring_candidate_fields.sort)
      IS DISTINCT FROM (excluded.label, excluded.kind, excluded.options, excluded.sort);
  END LOOP;
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_source_add(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Name the source' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.hiring_sources WHERE lower(btrim(name)) = lower(v_name)) THEN
    RAISE EXCEPTION 'That source is already there' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hiring_sources (name, sort) VALUES (v_name, coalesce((SELECT max(sort) FROM public.hiring_sources), 0) + 1);
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_source_set_active(p_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hiring_sources SET active = coalesce(p_active, active) WHERE id = p_id AND active IS DISTINCT FROM p_active;
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_source_remove(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_name FROM public.hiring_sources WHERE id = p_id;
  IF v_name IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.hiring_requests WHERE lower(hired_through) = lower(v_name)) THEN
    RAISE EXCEPTION '% has hires on record — turn it off instead', v_name USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.hiring_sources WHERE id = p_id;
END
$fn$;

-- ── 12. The Talent Bank ─────────────────────────────────────────────────────

-- Add talent, or Move to Talent Bank… (from a request's candidate, which is
-- then linked to them).
CREATE OR REPLACE FUNCTION public.hiring_talent_save(p_name text, p_phone text, p_email text, p_position text,
  p_department text, p_notes text, p_resume_path text DEFAULT NULL, p_resume_name text DEFAULT NULL,
  p_from_candidate uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_cand public.hiring_candidates;
  v_position text;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create is required' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' OR btrim(coalesce(p_position, '')) = '' THEN
    RAISE EXCEPTION '%', CASE WHEN p_from_candidate IS NULL THEN 'Add a name and the position they fit.' ELSE 'Name and position are needed.' END
      USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(p_department, '')) = '' THEN RAISE EXCEPTION 'Pick the department' USING ERRCODE = '22023'; END IF;
  IF p_resume_path IS NOT NULL AND p_resume_path !~ '^resumes/' THEN
    RAISE EXCEPTION 'A résumé lives under resumes/' USING ERRCODE = '22023';
  END IF;
  IF p_from_candidate IS NOT NULL THEN
    SELECT * INTO v_cand FROM public.hiring_candidates WHERE id = p_from_candidate FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That candidate is not there any more' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(r.answers ->> 'position', '') INTO v_position FROM public.hiring_requests r WHERE r.id = v_cand.request_id;
  END IF;
  INSERT INTO public.hiring_talents (no, name, phone, email, position, department, from_request, notes,
    resume_path, resume_name, saved_by_name, saved_by)
  VALUES ('T-' || lpad(nextval('public.hiring_talent_no_seq')::text, 3, '0'), v_name, btrim(coalesce(p_phone, '')),
    btrim(coalesce(p_email, '')), btrim(p_position), btrim(p_department), v_cand.request_id, coalesce(p_notes, ''),
    coalesce(p_resume_path, v_cand.resume_path), CASE WHEN p_resume_path IS NOT NULL THEN nullif(btrim(coalesce(p_resume_name, '')), '') ELSE v_cand.resume_name END,
    public.hiring_actor_name(), auth.uid())
  RETURNING id INTO v_id;
  IF p_from_candidate IS NOT NULL THEN
    UPDATE public.hiring_candidates SET talent_id = v_id, updated_at = now() WHERE id = p_from_candidate;
    PERFORM public.hiring_log(v_cand.request_id, 'Saved to Talent Bank', NULL, v_name);
    PERFORM public.hiring_talent_log(v_id, 'Saved to Talent Bank', 'From ' || v_cand.request_id || ' · ' || v_position);
  ELSE
    PERFORM public.hiring_talent_log(v_id, 'Added to Talent Bank', '');
  END IF;
  RETURN v_id;
END
$fn$;

-- Invite to interview / Pick from Talent Bank: the talent joins a request as
-- a shortlisted candidate.
CREATE OR REPLACE FUNCTION public.hiring_talent_invite(p_talent uuid, p_request text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_t public.hiring_talents;
  v_r public.hiring_requests;
  v_id uuid;
BEGIN
  IF public.has_any_action(ARRAY['hiring.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_t FROM public.hiring_talents WHERE id = p_talent AND removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'That talent is not in the bank any more' USING ERRCODE = '22023'; END IF;
  v_r := public.hiring_lock(p_request, ARRAY['submitted', 'needs_info', 'acknowledged'], 'Invite to an open request');
  IF EXISTS (SELECT 1 FROM public.hiring_candidates c WHERE c.request_id = p_request AND c.talent_id = p_talent AND c.stage <> 'rejected') THEN
    RAISE EXCEPTION '% is already on %', v_t.name, p_request USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hiring_candidates (request_id, name, phone, source, stage, talent_id, resume_path, resume_name, created_by)
  VALUES (p_request, v_t.name, v_t.phone, 'Talent Bank', 'shortlisted', v_t.id, v_t.resume_path, v_t.resume_name, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.hiring_log(p_request, 'Candidate added', NULL, v_t.name || ' · from Talent Bank');
  PERFORM public.hiring_talent_log(p_talent, 'Invited to interview', p_request || ' · ' || coalesce(v_r.answers ->> 'position', ''));
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_talent_update(p_talent uuid, p_notes text DEFAULT NULL,
  p_resume_path text DEFAULT NULL, p_resume_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hiring_talents WHERE id = p_talent AND removed_at IS NULL) THEN
    RAISE EXCEPTION 'That talent is not in the bank any more' USING ERRCODE = '22023';
  END IF;
  IF p_resume_path IS NOT NULL AND p_resume_path !~ '^resumes/' THEN
    RAISE EXCEPTION 'A résumé lives under resumes/' USING ERRCODE = '22023';
  END IF;
  IF p_notes IS NOT NULL THEN
    IF length(p_notes) > 8000 THEN RAISE EXCEPTION 'The notes are too long' USING ERRCODE = '22023'; END IF;
    UPDATE public.hiring_talents SET notes = p_notes WHERE id = p_talent AND notes IS DISTINCT FROM p_notes;
  END IF;
  IF p_resume_path IS NOT NULL THEN
    UPDATE public.hiring_talents SET resume_path = p_resume_path, resume_name = nullif(btrim(coalesce(p_resume_name, '')), '')
     WHERE id = p_talent;
    PERFORM public.hiring_talent_log(p_talent, 'Résumé replaced', coalesce(p_resume_name, ''));
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_talent_remove(p_talent uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hiring_talents SET removed_at = now(), removed_by = auth.uid() WHERE id = p_talent AND removed_at IS NULL;
  IF FOUND THEN PERFORM public.hiring_talent_log(p_talent, 'Removed from Talent Bank', ''); END IF;
END
$fn$;

-- ── 13. Who may call what ───────────────────────────────────────────────────

-- Internal: helpers and the guest link's doors — the service role and the
-- functions above (owned by postgres) only.
REVOKE ALL ON FUNCTION public.hiring_actor_name() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_log(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_talent_log(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_current_form() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_file_request(text, uuid, text, text, text, text, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_guest_form() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_file_guest_request(text, text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_hr_staff_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_staff_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_lock(text, text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_clean_candidate_answers(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_clean_answers(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_stage_label(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_department_label(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hiring_guest_form() TO service_role;
GRANT EXECUTE ON FUNCTION public.hiring_file_guest_request(text, text, text, text, jsonb, text, text) TO service_role;

-- The app's: each asks its Hiring cell itself.
REVOKE ALL ON FUNCTION public.hiring_board() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_submit(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_acknowledge(text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_request_info(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_decline(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_set_owner(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_set_assist(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_fill(text, text[], text, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_cancel(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_reopen(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_candidate_stage(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_file_of(text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_save_form_fields(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_save_candidate_fields(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_source_add(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_source_set_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_source_remove(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_talent_invite(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_talent_update(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_talent_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hiring_board(), public.hiring_submit(uuid, jsonb),
  public.hiring_acknowledge(text, uuid, text), public.hiring_request_info(text, text), public.hiring_decline(text, text),
  public.hiring_set_owner(text, uuid), public.hiring_set_assist(text, uuid), public.hiring_fill(text, text[], text, numeric, text),
  public.hiring_cancel(text, text), public.hiring_reopen(text),
  public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text),
  public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text), public.hiring_candidate_stage(uuid, text),
  public.hiring_file_of(text, text, boolean), public.hiring_save_form_fields(jsonb), public.hiring_save_candidate_fields(jsonb),
  public.hiring_source_add(text), public.hiring_source_set_active(uuid, boolean), public.hiring_source_remove(uuid),
  public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid), public.hiring_talent_invite(uuid, text),
  public.hiring_talent_update(uuid, text, text, text), public.hiring_talent_remove(uuid)
  TO authenticated;
