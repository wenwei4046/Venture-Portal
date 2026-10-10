-- ============================================================================
-- 20261011070000_documentation.sql
-- People › Documentation (2026-10-11, HR revamp round 2 — README §10, the
-- Claude Design handoff "Sidebar design revamp from HR (1)").
-- ============================================================================
--
-- Four tabs, one module (`documentation` — View · Create · Edit, mig
-- 20261011060000):
--
-- 1. Documents — files HR shares with whole departments (a price list, the
--    handbook): `hr_documents`, its trail `hr_document_events`, and which
--    member opened which (`hr_document_seen`, the Revenue app's "New").
--    Deleting one keeps it — greyed under "Show deleted" — and its trail.
-- 2. Data center — the letters on each person's record (`hr_person_letters`,
--    trail `hr_letter_events`), of a type (`hr_letter_types`; a compulsory
--    type flags everybody without one). A letter filed to somebody is SENT to
--    them: it is delivered as a memo addressed to that one person, so the
--    Revenue app shows it and its Acknowledge is the letter's — Delivered,
--    Opened, Acknowledged are that memo's receipt.
-- 3. Letters — the same letters across everybody, by type.
-- 4. Publish — replaces Member services › Publish memo. A memo, a letter or a
--    type of HR's own (`hr_publish_types`), to the people picked department by
--    department (`member_memo_recipients` — a person, not a sub-department,
--    so anybody on the payroll can be addressed), with an attachment that
--    "Publish & save" also files into every recipient's Data center.
--    `member_memos` gains the columns; its body may be empty when a file
--    carries the message. Every recipient must acknowledge (the user,
--    2026-10-11: everybody will have the app).
--
-- The Revenue app keeps working untouched: `member_visible_memo` also answers
-- for a memo addressed to the member, and the member snapshot sends an empty
-- department list (not null) for such a memo — production's bodies, one
-- statement swapped in each.
--
-- Every table: RLS on, no policy — read and written only by the functions
-- below, each asking `has_any_action` for its Documentation cell (or, for a
-- member, their own staff record). Files live in the private bucket
-- `hr-documents`: uploads straight from the browser (a handbook is bigger
-- than a Server Action carries) under a storage policy asking Documentation ·
-- Create, reads by short signed links made at the click.

-- ── The production this was written against ────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.hr_document_ref_seq START 101;
CREATE SEQUENCE IF NOT EXISTS public.hr_letter_ref_seq START 101;

CREATE TABLE public.hr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE DEFAULT ('L-' || nextval('public.hr_document_ref_seq')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  file_path text NOT NULL CHECK (file_path LIKE 'documents/%'),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  content_type text,
  file_size bigint,
  department_ids uuid[] NOT NULL CHECK (cardinality(department_ids) > 0),
  uploaded_by uuid REFERENCES public.users(id),
  uploaded_by_name text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id)
);

CREATE TABLE public.hr_document_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES public.hr_documents(id),
  what text NOT NULL,
  actor_id uuid,
  actor_name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_document_events_document ON public.hr_document_events (document_id, created_at);

CREATE TABLE public.hr_document_seen (
  document_id uuid NOT NULL REFERENCES public.hr_documents(id),
  staff_id uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, staff_id)
);

CREATE TABLE public.hr_letter_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  compulsory boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX hr_letter_types_name ON public.hr_letter_types (lower(trim(name))) WHERE deleted_at IS NULL;

CREATE TABLE public.hr_publish_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  builtin boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX hr_publish_types_name ON public.hr_publish_types (lower(trim(name))) WHERE deleted_at IS NULL;

-- A memo, a letter or HR's own type; an attachment that may carry it alone.
ALTER TABLE public.member_memos
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'Memo',
  ADD COLUMN IF NOT EXISTS letter_type_id uuid REFERENCES public.hr_letter_types(id),
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'publish' CHECK (origin IN ('publish', 'data_center')),
  ADD COLUMN IF NOT EXISTS department_ids uuid[],
  ADD COLUMN IF NOT EXISTS audience_label text,
  ADD COLUMN IF NOT EXISTS saved_to_records boolean NOT NULL DEFAULT false;
ALTER TABLE public.member_memos DROP CONSTRAINT IF EXISTS member_memos_body_check;
ALTER TABLE public.member_memos ADD CONSTRAINT member_memos_body_check
  CHECK (length(body) <= 30000 AND (length(body) >= 1 OR attachment_path IS NOT NULL));

CREATE TABLE public.member_memo_recipients (
  memo_id uuid NOT NULL REFERENCES public.member_memos(id),
  staff_id uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  PRIMARY KEY (memo_id, staff_id)
);
CREATE INDEX member_memo_recipients_staff ON public.member_memo_recipients (staff_id);

CREATE TABLE public.hr_person_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE DEFAULT ('D-' || nextval('public.hr_letter_ref_seq')),
  staff_id uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  letter_type_id uuid REFERENCES public.hr_letter_types(id),
  type_name text NOT NULL CHECK (length(trim(type_name)) BETWEEN 1 AND 80),
  file_path text NOT NULL CHECK (file_path LIKE 'letters/%' OR file_path LIKE 'publish/%'),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  content_type text,
  file_size bigint,
  memo_id uuid REFERENCES public.member_memos(id),
  source text NOT NULL CHECK (source IN ('upload', 'publish')),
  filed_by uuid REFERENCES public.users(id),
  filed_by_name text NOT NULL,
  filed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_person_letters_staff ON public.hr_person_letters (staff_id);
CREATE INDEX hr_person_letters_type ON public.hr_person_letters (letter_type_id);
CREATE INDEX hr_person_letters_memo ON public.hr_person_letters (memo_id);

CREATE TABLE public.hr_letter_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  letter_id uuid NOT NULL REFERENCES public.hr_person_letters(id),
  what text NOT NULL,
  actor_id uuid,
  actor_name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_letter_events_letter ON public.hr_letter_events (letter_id, created_at);

ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_document_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_document_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_letter_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_publish_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_memo_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_person_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_letter_events ENABLE ROW LEVEL SECURITY;

-- The user's three (2026-10-11, decision 7): HR fills the offer letters in.
INSERT INTO public.hr_letter_types (name, compulsory, sort_order) VALUES
  ('Offer letter', true, 1), ('Increment letter', false, 2), ('Warning letter', false, 3);
INSERT INTO public.hr_publish_types (name, builtin, sort_order) VALUES ('Memo', true, 1), ('Letter', true, 2);

SELECT public.audit_register('hr_documents', 'Documents', 'People', '{documentation}', 'all',
  p_keys => '{ref}', p_labels => '{name}');
SELECT public.audit_register('hr_document_events', 'Document trail', 'People', '{}', 'none',
  p_reason => 'The documents'' own trail, written by their functions — a record already');
SELECT public.audit_register('hr_document_seen', 'Documents opened', 'People', '{}', 'none',
  p_reason => 'Which member opened which document; the document trail records each open');
SELECT public.audit_register('hr_letter_types', 'Letter types', 'People', '{documentation}', 'all',
  p_labels => '{name}');
SELECT public.audit_register('hr_publish_types', 'Publish types', 'People', '{documentation}', 'all',
  p_labels => '{name}');
SELECT public.audit_register('hr_person_letters', 'Letters on file', 'People', '{documentation}', 'all',
  p_keys => '{ref}', p_labels => '{type_name,file_name}');
SELECT public.audit_register('hr_letter_events', 'Letter trail', 'People', '{}', 'none',
  p_reason => 'The letters'' own trail, written by their functions — a record already');
SELECT public.audit_register('member_memo_recipients', 'Memo recipients', 'Member services', '{member_memos_manage,documentation}', 'all');
SELECT public.audit_register('member_memos', 'Memos', 'Member services', '{member_memos_manage,documentation}', 'all');

-- ── 2. Files ────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hr-documents', 'hr-documents', false, 26214400, ARRAY[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic'
])
ON CONFLICT (id) DO NOTHING;

-- Who a file may be read by besides Documentation · View: the member a
-- document is shared with (their department), a letter is filed for, or a
-- published attachment is addressed to.
CREATE OR REPLACE FUNCTION public.hr_file_readable_by_member(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff uuid;
  v_dept uuid;
BEGIN
  SELECT s.id, s.department_id INTO v_staff, v_dept
    FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active' LIMIT 1;
  IF v_staff IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.hr_documents d
                  WHERE d.file_path = p_name AND d.deleted_at IS NULL AND v_dept = ANY (d.department_ids))
      OR EXISTS (SELECT 1 FROM public.hr_person_letters l WHERE l.file_path = p_name AND l.staff_id = v_staff)
      OR EXISTS (SELECT 1 FROM public.member_memos m JOIN public.member_memo_recipients r ON r.memo_id = m.id
                  WHERE m.attachment_path = p_name AND r.staff_id = v_staff);
END
$$;
REVOKE ALL ON FUNCTION public.hr_file_readable_by_member(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_file_readable_by_member(text) TO authenticated;

CREATE POLICY hr_documents_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hr-documents'
    AND (storage.foldername(name))[1] IN ('documents', 'letters', 'publish')
    AND (SELECT public.has_any_action(ARRAY['documentation.create'])));
CREATE POLICY hr_documents_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hr-documents'
    AND ((SELECT public.has_any_action(ARRAY['documentation.view'])) OR public.hr_file_readable_by_member(name)));

-- ── 3. Helpers (only the functions below call them) ─────────────────────────

-- Who did it, in words: their own name when the login is somebody's, else the account's.
CREATE OR REPLACE FUNCTION public.hr_doc_actor_name()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN coalesce(
    (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.user_id = auth.uid()
      ORDER BY (s.status = 'active') DESC LIMIT 1),
    (SELECT u.name FROM public.users u WHERE u.id = auth.uid()),
    'HR');
END
$$;
REVOKE ALL ON FUNCTION public.hr_doc_actor_name() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_doc_actor_name() TO service_role;

-- A file the browser uploaded: in the bucket, under the folder it belongs in.
CREATE OR REPLACE FUNCTION public.hr_doc_file_present(p_path text, p_folder text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN p_path IS NOT NULL
     AND p_path LIKE p_folder || '/%'
     AND strpos(p_path, '..') = 0
     AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'hr-documents' AND o.name = p_path);
END
$$;
REVOKE ALL ON FUNCTION public.hr_doc_file_present(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_doc_file_present(text, text) TO service_role;

-- The memo a letter travels as: to one person, the letter as its attachment.
CREATE OR REPLACE FUNCTION public.hr_doc_send_letter(p_staff uuid, p_title text, p_path text, p_name text, p_type text, p_letter_type uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_memo uuid;
BEGIN
  INSERT INTO public.member_memos (title, body, sender, version, effective_at, requires_ack, created_by,
      kind, letter_type_id, attachment_path, attachment_name, attachment_type, origin, audience_label)
  VALUES (left(p_title, 200), '', 'People & Culture', 1, (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, true, auth.uid(),
      'Letter', p_letter_type, p_path, p_name, p_type, 'data_center',
      (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = p_staff))
  RETURNING id INTO v_memo;
  INSERT INTO public.member_memo_recipients (memo_id, staff_id) VALUES (v_memo, p_staff);
  RETURN v_memo;
END
$$;
REVOKE ALL ON FUNCTION public.hr_doc_send_letter(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_doc_send_letter(uuid, text, text, text, text, uuid) TO service_role;

-- ── 4. The page's one read ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hr_documentation()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Documentation access is required' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH dn AS (
      SELECT dp.id, dp.name, count(*)::int AS n
        FROM public.departments dp
        JOIN public.hr_staff_costs s ON s.department_id = dp.id AND s.status = 'active'
       GROUP BY dp.id, dp.name
    ), ppl AS (
      SELECT s.id, s.employee_name, s.employee_code, coalesce(t.name, s.designation) AS title, s.department_id,
             lv.rank AS level, dn.n AS dept_n, dn.name AS dept_name
        FROM public.hr_staff_costs s
        LEFT JOIN public.titles t ON t.id = s.title_id
        LEFT JOIN public.title_levels lv ON lv.id = t.level_id
        LEFT JOIN dn ON dn.id = s.department_id
       WHERE s.status = 'active'
    )
    SELECT jsonb_build_object(
      'departments', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', dn.id, 'name', dn.name, 'people', dn.n) ORDER BY dn.n DESC, dn.name), '[]'::jsonb) FROM dn),
      'people', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.employee_name, 'code', p.employee_code,
                   'title', p.title, 'departmentId', p.department_id)
                   ORDER BY p.dept_n DESC NULLS LAST, p.dept_name NULLS LAST, p.level DESC NULLS LAST, p.employee_code NULLS LAST, p.employee_name), '[]'::jsonb)
                 FROM ppl p),
      'documents', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'id', d.id, 'ref', d.ref, 'name', d.name, 'fileName', d.file_name, 'contentType', d.content_type,
                     'size', d.file_size, 'departmentIds', to_jsonb(d.department_ids),
                     'departments', (SELECT coalesce(jsonb_agg(dp.name ORDER BY array_position(d.department_ids, dp.id)), '[]'::jsonb)
                                       FROM public.departments dp WHERE dp.id = ANY (d.department_ids)),
                     'uploadedAt', d.uploaded_at, 'uploadedBy', d.uploaded_by_name, 'deletedAt', d.deleted_at,
                     'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('what', e.what, 'at', e.created_at, 'who', e.actor_name, 'note', e.note)
                                  ORDER BY e.created_at, e.id), '[]'::jsonb)
                                  FROM public.hr_document_events e WHERE e.document_id = d.id)
                   ) ORDER BY d.uploaded_at DESC, d.ref DESC), '[]'::jsonb)
                   FROM public.hr_documents d),
      'letterTypes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'compulsory', t.compulsory,
                       'count', (SELECT count(*) FROM public.hr_person_letters l WHERE l.letter_type_id = t.id))
                       ORDER BY t.sort_order, t.created_at), '[]'::jsonb)
                     FROM public.hr_letter_types t WHERE t.deleted_at IS NULL),
      'letters', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'id', l.id, 'ref', l.ref, 'staffId', l.staff_id, 'staffName', s.employee_name,
                   'typeId', l.letter_type_id, 'typeName', coalesce(t.name, l.type_name),
                   'fileName', l.file_name, 'contentType', l.content_type, 'size', l.file_size,
                   'filedAt', l.filed_at, 'filedBy', l.filed_by_name, 'source', l.source,
                   'readAt', rc.read_at, 'acknowledgedAt', rc.acknowledged_at,
                   'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('what', e.what, 'at', e.created_at, 'who', e.actor_name, 'note', e.note)
                                ORDER BY e.created_at, e.id), '[]'::jsonb)
                                FROM public.hr_letter_events e WHERE e.letter_id = l.id)
                 ) ORDER BY l.filed_at DESC, l.ref DESC), '[]'::jsonb)
                 FROM public.hr_person_letters l
                 JOIN public.hr_staff_costs s ON s.id = l.staff_id
                 LEFT JOIN public.hr_letter_types t ON t.id = l.letter_type_id
                 LEFT JOIN public.member_memos m ON m.id = l.memo_id
                 LEFT JOIN LATERAL (
                   SELECT min(r.read_at) AS read_at, min(r.acknowledged_at) AS acknowledged_at
                     FROM public.member_memo_receipts r
                    WHERE r.memo_id = l.memo_id AND r.user_id = s.user_id AND r.version = m.version
                 ) rc ON true),
      'publishTypes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'builtin', p.builtin)
                        ORDER BY p.sort_order, p.created_at), '[]'::jsonb)
                      FROM public.hr_publish_types p WHERE p.deleted_at IS NULL),
      'published', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'id', m.id, 'kind', m.kind, 'title', m.title, 'publishedAt', m.published_at,
                     'audience', m.audience_label,
                     'subDepartments', (SELECT coalesce(jsonb_agg(sd.name ORDER BY sd.name), '[]'::jsonb)
                                          FROM public.member_memo_audiences a JOIN public.comm_sub_departments sd ON sd.id = a.sub_department_id
                                         WHERE a.memo_id = m.id),
                     'attachmentName', m.attachment_name, 'saved', m.saved_to_records,
                     'recipients', (SELECT count(*) FROM public.member_memo_recipients r WHERE r.memo_id = m.id),
                     'acknowledged', (SELECT count(DISTINCT x.user_id) FROM public.member_memo_receipts x
                                       WHERE x.memo_id = m.id AND x.version = m.version AND x.acknowledged_at IS NOT NULL)
                   ) ORDER BY m.published_at DESC, m.id), '[]'::jsonb)
                   FROM public.member_memos m WHERE m.origin = 'publish')
    )
  );
END
$$;
REVOKE ALL ON FUNCTION public.hr_documentation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_documentation() TO authenticated;

-- The file behind a document or a letter, for a signed link made at the click.
CREATE OR REPLACE FUNCTION public.hr_documentation_file(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Documentation access is required' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'document' THEN
    SELECT jsonb_build_object('path', d.file_path, 'fileName', d.file_name, 'contentType', d.content_type, 'deleted', d.deleted_at IS NOT NULL)
      INTO v FROM public.hr_documents d WHERE d.id = p_id;
  ELSIF p_kind = 'letter' THEN
    SELECT jsonb_build_object('path', l.file_path, 'fileName', l.file_name, 'contentType', l.content_type, 'deleted', false)
      INTO v FROM public.hr_person_letters l WHERE l.id = p_id;
  ELSE
    RAISE EXCEPTION 'Unknown kind of file' USING ERRCODE = '22023';
  END IF;
  IF v IS NULL THEN
    RAISE EXCEPTION 'That file is no longer here' USING ERRCODE = '22023';
  END IF;
  RETURN v;
END
$$;
REVOKE ALL ON FUNCTION public.hr_documentation_file(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_documentation_file(text, uuid) TO authenticated;

-- HR viewed or downloaded a file: one line on its trail.
CREATE OR REPLACE FUNCTION public.hr_documentation_log(p_kind text, p_id uuid, p_what text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Documentation access is required' USING ERRCODE = '42501';
  END IF;
  IF p_what IS DISTINCT FROM 'Viewed' AND p_what IS DISTINCT FROM 'Downloaded' THEN
    RAISE EXCEPTION 'Only a view or a download is logged here' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'document' THEN
    INSERT INTO public.hr_document_events (document_id, what, actor_id, actor_name)
    SELECT d.id, p_what, auth.uid(), public.hr_doc_actor_name() FROM public.hr_documents d WHERE d.id = p_id;
  ELSIF p_kind = 'letter' THEN
    INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name)
    SELECT l.id, p_what, auth.uid(), public.hr_doc_actor_name() FROM public.hr_person_letters l WHERE l.id = p_id;
  ELSE
    RAISE EXCEPTION 'Unknown kind of file' USING ERRCODE = '22023';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.hr_documentation_log(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_documentation_log(text, uuid, text) TO authenticated;

-- ── 5. Documents ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hr_document_add(p_name text, p_path text, p_file_name text, p_content_type text, p_size bigint, p_departments uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_names text;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create']) THEN
    RAISE EXCEPTION 'Uploading documents needs Documentation · Create' USING ERRCODE = '42501';
  END IF;
  IF length(trim(coalesce(p_name, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Give the document a name.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.hr_doc_file_present(p_path, 'documents') THEN
    RAISE EXCEPTION 'The file did not arrive. Please upload it again.' USING ERRCODE = '22023';
  END IF;
  IF p_departments IS NULL OR cardinality(p_departments) = 0 THEN
    RAISE EXCEPTION 'Pick at least one department.' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(d.name, ', ' ORDER BY array_position(p_departments, d.id)) INTO v_names
    FROM public.departments d WHERE d.id = ANY (p_departments);
  IF (SELECT count(*) FROM public.departments d WHERE d.id = ANY (p_departments)) <> (SELECT count(DISTINCT x) FROM unnest(p_departments) x) THEN
    RAISE EXCEPTION 'A department picked is not there any more.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hr_documents (name, file_path, file_name, content_type, file_size, department_ids, uploaded_by, uploaded_by_name)
  VALUES (trim(p_name), p_path, left(coalesce(nullif(trim(p_file_name), ''), 'file'), 200), p_content_type, p_size,
          (SELECT array_agg(DISTINCT x) FROM unnest(p_departments) x), auth.uid(), public.hr_doc_actor_name())
  RETURNING id INTO v_id;
  INSERT INTO public.hr_document_events (document_id, what, actor_id, actor_name, note)
  VALUES (v_id, 'Uploaded', auth.uid(), public.hr_doc_actor_name(), 'Shared with ' || v_names);
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION public.hr_document_add(text, text, text, text, bigint, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_document_add(text, text, text, text, bigint, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_document_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Deleting documents needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hr_documents SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That document is already deleted.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hr_document_events (document_id, what, actor_id, actor_name, note)
  VALUES (p_id, 'Deleted', auth.uid(), public.hr_doc_actor_name(), 'Removed from the Revenue app');
END
$$;
REVOKE ALL ON FUNCTION public.hr_document_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_document_delete(uuid) TO authenticated;

-- ── 6. Letter types ─────────────────────────────────────────────────────────

-- Added from the Letters menu or while uploading a letter ("+ Add a new letter type…").
CREATE OR REPLACE FUNCTION public.hr_letter_type_add(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create', 'documentation.edit']) THEN
    RAISE EXCEPTION 'Adding a letter type needs Documentation · Create or Edit' USING ERRCODE = '42501';
  END IF;
  IF length(trim(coalesce(p_name, ''))) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Name the new letter type.' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM public.hr_letter_types WHERE lower(trim(name)) = lower(trim(p_name)) AND deleted_at IS NULL;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  INSERT INTO public.hr_letter_types (name, sort_order, created_by)
  VALUES (trim(p_name), coalesce((SELECT max(sort_order) FROM public.hr_letter_types), 0) + 1, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION public.hr_letter_type_add(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_letter_type_add(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_letter_type_set_compulsory(p_id uuid, p_compulsory boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Setting a letter type needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hr_letter_types SET compulsory = coalesce(p_compulsory, false) WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That letter type is not there any more.' USING ERRCODE = '22023';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.hr_letter_type_set_compulsory(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_letter_type_set_compulsory(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_letter_type_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Deleting a letter type needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_name FROM public.hr_letter_types WHERE id = p_id AND deleted_at IS NULL;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'That letter type is not there any more.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_person_letters WHERE letter_type_id = p_id) THEN
    RAISE EXCEPTION '% has letters on file, so it cannot be deleted', v_name USING ERRCODE = '22023';
  END IF;
  UPDATE public.hr_letter_types SET deleted_at = now() WHERE id = p_id;
END
$$;
REVOKE ALL ON FUNCTION public.hr_letter_type_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_letter_type_delete(uuid) TO authenticated;

-- ── 7. A letter filed to somebody's record ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.hr_letter_file(p_staff uuid, p_type uuid, p_path text, p_file_name text, p_content_type text, p_size bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.hr_letter_types%ROWTYPE;
  v_person text;
  v_id uuid;
  v_memo uuid;
  v_name text := left(coalesce(nullif(trim(p_file_name), ''), 'letter'), 200);
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create']) THEN
    RAISE EXCEPTION 'Filing a letter needs Documentation · Create' USING ERRCODE = '42501';
  END IF;
  SELECT employee_name INTO v_person FROM public.hr_staff_costs WHERE id = p_staff AND status = 'active';
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'That person is not on the payroll any more.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_type FROM public.hr_letter_types WHERE id = p_type AND deleted_at IS NULL;
  IF v_type.id IS NULL THEN
    RAISE EXCEPTION 'Choose the letter type.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.hr_doc_file_present(p_path, 'letters/' || p_staff::text) THEN
    RAISE EXCEPTION 'The file did not arrive. Please upload it again.' USING ERRCODE = '22023';
  END IF;
  v_memo := public.hr_doc_send_letter(p_staff, v_type.name, p_path, v_name, p_content_type, v_type.id);
  INSERT INTO public.hr_person_letters (staff_id, letter_type_id, type_name, file_path, file_name, content_type, file_size,
      memo_id, source, filed_by, filed_by_name)
  VALUES (p_staff, v_type.id, v_type.name, p_path, v_name, p_content_type, p_size, v_memo, 'upload', auth.uid(), public.hr_doc_actor_name())
  RETURNING id INTO v_id;
  INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name, note) VALUES
    (v_id, 'Uploaded', auth.uid(), public.hr_doc_actor_name(), 'Filed to ' || v_person || '''s record'),
    (v_id, 'Sent to Revenue app', NULL, 'System', NULL);
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION public.hr_letter_file(uuid, uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_letter_file(uuid, uuid, text, text, text, bigint) TO authenticated;

-- ── 8. Publish ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hr_publish_type_add(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create', 'documentation.edit']) THEN
    RAISE EXCEPTION 'Adding a type needs Documentation · Create or Edit' USING ERRCODE = '42501';
  END IF;
  IF length(trim(coalesce(p_name, ''))) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the new type.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_publish_types WHERE lower(trim(name)) = lower(trim(p_name)) AND deleted_at IS NULL) THEN
    RAISE EXCEPTION '% already exists', trim(p_name) USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hr_publish_types (name, sort_order, created_by)
  VALUES (trim(p_name), coalesce((SELECT max(sort_order) FROM public.hr_publish_types), 0) + 1, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION public.hr_publish_type_add(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_publish_type_add(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_publish_type_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Removing a type needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hr_publish_types SET deleted_at = now() WHERE id = p_id AND deleted_at IS NULL AND NOT builtin;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Memo and Letter stay; that type is not there any more.' USING ERRCODE = '22023';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.hr_publish_type_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_publish_type_delete(uuid) TO authenticated;

-- Publish: to the people picked, acknowledgement required; with an attachment,
-- "Publish & save" (p_save) also files it into each recipient's Data center.
CREATE OR REPLACE FUNCTION public.hr_publish(
  p_kind text, p_letter_type uuid, p_title text, p_body text,
  p_attachment_path text, p_attachment_name text, p_attachment_type text, p_attachment_size bigint,
  p_departments uuid[], p_staff uuid[], p_audience text, p_save boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_type public.hr_letter_types%ROWTYPE;
  v_memo uuid;
  v_people integer;
  v_name text := left(coalesce(nullif(trim(p_attachment_name), ''), 'attachment'), 200);
  v_letter uuid;
  v_staff uuid;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create']) THEN
    RAISE EXCEPTION 'Publishing needs Documentation · Create' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_kind FROM public.hr_publish_types WHERE lower(trim(name)) = lower(trim(coalesce(p_kind, ''))) AND deleted_at IS NULL;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Choose what you are publishing.' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'Letter' THEN
    SELECT * INTO v_type FROM public.hr_letter_types WHERE id = p_letter_type AND deleted_at IS NULL;
    IF v_type.id IS NULL THEN
      RAISE EXCEPTION 'Choose the letter type.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF length(trim(coalesce(p_title, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Add a title.' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(p_body, ''))) = 0 AND p_attachment_path IS NULL THEN
    RAISE EXCEPTION 'Add a body or attach a file.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_body, '')) > 30000 THEN
    RAISE EXCEPTION 'The body is too long.' USING ERRCODE = '22023';
  END IF;
  IF p_attachment_path IS NOT NULL AND NOT public.hr_doc_file_present(p_attachment_path, 'publish') THEN
    RAISE EXCEPTION 'The file did not arrive. Please attach it again.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_save, false) AND p_attachment_path IS NULL THEN
    RAISE EXCEPTION 'Publish & save files the attachment — attach a file.' USING ERRCODE = '22023';
  END IF;
  IF p_staff IS NULL OR cardinality(p_staff) = 0 THEN
    RAISE EXCEPTION 'Pick at least one department.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_people FROM public.hr_staff_costs s WHERE s.id = ANY (p_staff) AND s.status = 'active';
  IF v_people <> (SELECT count(DISTINCT x) FROM unnest(p_staff) x) THEN
    RAISE EXCEPTION 'Somebody picked is not on the payroll any more. Reload the page.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.member_memos (title, body, sender, version, effective_at, requires_ack, created_by,
      kind, letter_type_id, attachment_path, attachment_name, attachment_type, origin, department_ids, audience_label, saved_to_records)
  VALUES (trim(p_title), trim(coalesce(p_body, '')), 'People & Culture', 1, (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, true, auth.uid(),
      v_kind, v_type.id, p_attachment_path, CASE WHEN p_attachment_path IS NULL THEN NULL ELSE v_name END,
      CASE WHEN p_attachment_path IS NULL THEN NULL ELSE p_attachment_type END,
      'publish', p_departments, left(p_audience, 1000), coalesce(p_save, false))
  RETURNING id INTO v_memo;
  INSERT INTO public.member_memo_recipients (memo_id, staff_id)
  SELECT DISTINCT v_memo, x FROM unnest(p_staff) x;

  IF coalesce(p_save, false) THEN
    FOR v_staff IN SELECT DISTINCT x FROM unnest(p_staff) x LOOP
      INSERT INTO public.hr_person_letters (staff_id, letter_type_id, type_name, file_path, file_name, content_type, file_size,
          memo_id, source, filed_by, filed_by_name)
      VALUES (v_staff, v_type.id, coalesce(v_type.name, v_kind), p_attachment_path, v_name, p_attachment_type, p_attachment_size,
          v_memo, 'publish', auth.uid(), public.hr_doc_actor_name())
      RETURNING id INTO v_letter;
      INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name, note) VALUES
        (v_letter, 'Published', auth.uid(), public.hr_doc_actor_name(), v_kind || ' · ' || trim(p_title)),
        (v_letter, 'Saved to Data center', NULL, 'System', NULL),
        (v_letter, 'Sent to Revenue app', NULL, 'System', 'Acknowledgement required');
    END LOOP;
  END IF;
  RETURN jsonb_build_object('id', v_memo, 'kind', v_kind, 'recipients', v_people, 'saved', coalesce(p_save, false));
END
$$;
REVOKE ALL ON FUNCTION public.hr_publish(text, uuid, text, text, text, text, text, bigint, uuid[], uuid[], text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_publish(text, uuid, text, text, text, text, text, bigint, uuid[], uuid[], text, boolean) TO authenticated;

-- ── 9. The Revenue app's side ───────────────────────────────────────────────

-- A memo addressed to the member by name is theirs too (the audiences stay as they were).
SELECT pg_temp.swap_check('public.member_visible_memo(uuid,uuid)',
  $q$AND public.member_has_membership(p_staff,a.sub_department_id));$q$,
  $q$AND public.member_has_membership(p_staff,a.sub_department_id))
 OR EXISTS(SELECT 1 FROM public.member_memos m JOIN public.member_memo_recipients r ON r.memo_id=m.id
 WHERE m.id=p_memo AND m.published_at<=now() AND r.staff_id=p_staff);$q$);

-- Such a memo has no sub-department: the app is sent an empty list, never null.
SELECT pg_temp.swap_check('public.member_data_snapshot(boolean)',
  $q$'departments',(SELECT jsonb_agg(d.name) FROM public.member_memo_audiences a
 JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id))$q$,
  $q$'departments',(SELECT coalesce(jsonb_agg(d.name),'[]'::jsonb) FROM public.member_memo_audiences a
 JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id))$q$);

-- The documents shared with the member's department, newest first, and
-- whether they have opened each (the app's "New") — for the Revenue app's
-- Documentation screen.
CREATE OR REPLACE FUNCTION public.member_documents()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff uuid := public.member_staff_id();
  v_dept uuid;
BEGIN
  SELECT department_id INTO v_dept FROM public.hr_staff_costs WHERE id = v_staff;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'fileName', d.file_name, 'contentType', d.content_type,
             'size', d.file_size, 'uploadedAt', d.uploaded_at,
             'seen', EXISTS (SELECT 1 FROM public.hr_document_seen x WHERE x.document_id = d.id AND x.staff_id = v_staff))
           ORDER BY d.uploaded_at DESC, d.ref DESC)
      FROM public.hr_documents d
     WHERE d.deleted_at IS NULL AND v_dept = ANY (d.department_ids)
  ), '[]'::jsonb);
END
$$;
REVOKE ALL ON FUNCTION public.member_documents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_documents() TO authenticated;

-- A member opens one: seen, a line on its trail, and its file for a signed link.
CREATE OR REPLACE FUNCTION public.member_document_open(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff uuid := public.member_staff_id();
  v_dept uuid;
  v jsonb;
BEGIN
  SELECT department_id INTO v_dept FROM public.hr_staff_costs WHERE id = v_staff;
  SELECT jsonb_build_object('path', d.file_path, 'fileName', d.file_name, 'contentType', d.content_type) INTO v
    FROM public.hr_documents d WHERE d.id = p_id AND d.deleted_at IS NULL AND v_dept = ANY (d.department_ids);
  IF v IS NULL THEN
    RAISE EXCEPTION 'That document is not shared with you' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.hr_document_seen (document_id, staff_id) VALUES (p_id, v_staff) ON CONFLICT DO NOTHING;
  INSERT INTO public.hr_document_events (document_id, what, actor_id, actor_name)
  VALUES (p_id, 'Opened in Revenue app', auth.uid(), (SELECT employee_name FROM public.hr_staff_costs WHERE id = v_staff));
  RETURN v;
END
$$;
REVOKE ALL ON FUNCTION public.member_document_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_document_open(uuid) TO authenticated;
