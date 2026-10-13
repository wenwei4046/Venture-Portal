-- ============================================================================
-- 20261013030000_talent_bank_drive.sql
-- Hiring › Talent Bank as a Drive (2026-10-12 — the user: "talent bank need be
-- like google drive as well, can create new file, and name as well. then the
-- current venture same as well. so when save or upload can detect and locate
-- file"; then, asked: company › department › people; the companies and their
-- departments come BOTH from Admin › Guest Link › Subsidiaries & departments and
-- from folders HR makes by hand; HR's folders hold people and files).
-- ============================================================================
--
-- The Talent Bank becomes a tree, as the Data center did (mig 20261012220000):
--
--   Talent Bank
--   ├── HOUZS Venture            by itself
--   │   ├── <department>         by itself — Hiring › Form settings' Department
--   │   │   ├── <talent>         their record, as before
--   │   │   └── (folders HR makes — people and files in them)
--   │   └── (folders HR makes)
--   ├── <subsidiary>             by itself — Admin › Guest Link's list
--   │   ├── <department>         by itself — that subsidiary's departments
--   │   └── (folders HR makes)
--   └── (folders HR makes)       another company, its departments, anything
--
-- Every talent has a place (a company, a department or a folder). Saved from a
-- candidate it is FOUND by name — the request's company (a guest's, else HOUZS
-- Venture) and its department — at the top: a company of the list, else a
-- folder HR made by that name; inside it: a department the company lists, else
-- a folder by that name — and what is not there yet is made then
-- (`hiring_bank_locate`, from the BEFORE INSERT trigger, so every way a talent
-- is saved is placed). Added from a place (+ New › Add talent) it goes there.
-- HR moves a talent with Move to… .
--
--   hiring_bank_folders   a folder HR made (or one made for a talent), in the
--                         Talent Bank itself, a company, a department or
--                         another folder; renamed; deleted softly, only when
--                         empty. One live name per place, the places' own
--                         names included.
--   hiring_bank_files     a file HR keeps in a place — the bucket's own
--                         `files/<uuid>/<name>`, uploaded as every hiring file
--                         is; deleted for real (row and object), as a talent's
--                         files are (PDPA).
--   hiring_talents        + place_kind / place_sub_id / place_dept /
--                         place_folder_id.
--   hiring_requests       + requester_sub_id: the company a guest's request
--                         came from, so a company renamed in Admin › Guest
--                         Link is still found (guest_link_hire records it).
--
-- Renamed and moved TOGETHER (the user, the same evening: "change name, and
-- move together"): a folder's Move to… takes everything in it; a department's
-- Move everyone to… takes its people, folders and files at once; a department
-- renamed in Admin › Guest Link (`guest_link_rename_department`, not taken off
-- and another added) takes them to its new name; a department its company no
-- longer lists keeps the people still in it, and the next one saved for it
-- joins them rather than a second folder of its name.
--
-- As every Hiring table: RLS on, no policy, no client grants — read and written
-- by the functions below, each asking `has_any_action` for its Hiring cell (View
-- reads, Create makes a folder, adds a talent or a file, Edit renames, deletes
-- and moves); each write asks the Talent Bank's page first (`tab_write_guard`,
-- added by `pg_temp.tab_guard` as mig 20261011220100 does). The bucket's helpers
-- learn the new table (production's bodies, one statement swapped each — read
-- off pg_proc on 2026-10-12: hiring_file_in_use a4f11458…, hiring_leftovers
-- 6e34d839…, hiring_orphaned 091bb922…, hiring_take_upload 17b4fe51…,
-- hiring_file_path 06facbec…; the swap refuses if production changed since).

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

-- The page's guard at the top of a body (mig 20261011220100's helpers, as they are).
CREATE OR REPLACE FUNCTION pg_temp.tab_guard_put(p_sig text, p_guard text)
RETURNS void
LANGUAGE plpgsql
AS $g$
DECLARE
  v_oid oid := p_sig::regprocedure;
  v_src text;
  v_def text;
  v_at  integer;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position(p_guard IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF position('tab_write_guard' IN v_src) > 0 THEN
    RAISE EXCEPTION '% already asks other pages — change that guard with swap_check', p_sig;
  END IF;
  v_at := regexp_instr(v_src, '\mBEGIN\M', 1, 1, 1, 'i');
  IF v_at = 0 THEN
    RAISE EXCEPTION '% has no BEGIN', p_sig;
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF length(v_def) - length(replace(v_def, v_src, '')) <> length(v_src) THEN
    RAISE EXCEPTION '% — its body is not in its definition exactly once', p_sig;
  END IF;
  EXECUTE replace(v_def, v_src, left(v_src, v_at - 1) || E'\n  ' || p_guard || substr(v_src, v_at));
END
$g$;

CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql
AS $g$
BEGIN
  PERFORM pg_temp.tab_guard_put(p_sig, format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', ')));
END
$g$;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

-- A place is one of: the Talent Bank itself ('root'); a company ('company' —
-- `sub` a subsidiary of the guest link's list, NULL for HOUZS Venture); one of a
-- company's departments ('dept' — by name: the lists keep names, not ids); a
-- folder HR made ('folder').
CREATE TABLE public.hiring_bank_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80 AND name !~ '[/\\]'),
  parent_kind text NOT NULL CHECK (parent_kind IN ('root', 'company', 'dept', 'folder')),
  parent_sub_id uuid REFERENCES public.guest_link_subsidiaries(id),
  parent_dept text CHECK (parent_dept IS NULL OR length(btrim(parent_dept)) BETWEEN 1 AND 80),
  parent_folder_id uuid REFERENCES public.hiring_bank_folders(id),
  created_by uuid REFERENCES public.users(id),
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id),
  CONSTRAINT hiring_bank_folders_parent CHECK (
    (parent_kind = 'root' AND parent_sub_id IS NULL AND parent_dept IS NULL AND parent_folder_id IS NULL)
    OR (parent_kind = 'company' AND parent_dept IS NULL AND parent_folder_id IS NULL)
    OR (parent_kind = 'dept' AND parent_dept IS NOT NULL AND parent_folder_id IS NULL)
    OR (parent_kind = 'folder' AND parent_folder_id IS NOT NULL AND parent_sub_id IS NULL AND parent_dept IS NULL))
);
CREATE INDEX hiring_bank_folders_in_folder ON public.hiring_bank_folders (parent_folder_id) WHERE parent_folder_id IS NOT NULL;
-- One live folder of a name in a place.
CREATE UNIQUE INDEX hiring_bank_folders_name ON public.hiring_bank_folders
  (parent_kind, coalesce(parent_folder_id, parent_sub_id, '00000000-0000-0000-0000-000000000000'::uuid),
   lower(coalesce(parent_dept, '')), lower(btrim(name)))
  WHERE deleted_at IS NULL;
ALTER TABLE public.hiring_bank_folders ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_bank_folders IS
  'Hiring › Talent Bank as a Drive: a folder HR made (or one made to place a saved talent), in the bank, a company, a department or another folder. Read through hiring_bank().';

CREATE TABLE public.hiring_bank_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_kind text NOT NULL CHECK (place_kind IN ('root', 'company', 'dept', 'folder')),
  place_sub_id uuid REFERENCES public.guest_link_subsidiaries(id),
  place_dept text CHECK (place_dept IS NULL OR length(btrim(place_dept)) BETWEEN 1 AND 80),
  place_folder_id uuid REFERENCES public.hiring_bank_folders(id),
  path text NOT NULL UNIQUE CHECK (path ~ '^files/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,160}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  content_type text,
  size bigint,
  added_by uuid REFERENCES public.users(id),
  added_by_name text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hiring_bank_files_place CHECK (
    (place_kind = 'root' AND place_sub_id IS NULL AND place_dept IS NULL AND place_folder_id IS NULL)
    OR (place_kind = 'company' AND place_dept IS NULL AND place_folder_id IS NULL)
    OR (place_kind = 'dept' AND place_dept IS NOT NULL AND place_folder_id IS NULL)
    OR (place_kind = 'folder' AND place_folder_id IS NOT NULL AND place_sub_id IS NULL AND place_dept IS NULL))
);
CREATE INDEX hiring_bank_files_in_folder ON public.hiring_bank_files (place_folder_id) WHERE place_folder_id IS NOT NULL;
ALTER TABLE public.hiring_bank_files ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_bank_files IS
  'Hiring › Talent Bank as a Drive: a file HR keeps in a place of the bank (hiring-files, files/<uuid>/<name>). Deleted for real — the row, then the object. Read through hiring_bank().';

ALTER TABLE public.hiring_talents
  ADD COLUMN place_kind text CHECK (place_kind IN ('company', 'dept', 'folder')),
  ADD COLUMN place_sub_id uuid REFERENCES public.guest_link_subsidiaries(id),
  ADD COLUMN place_dept text CHECK (place_dept IS NULL OR length(btrim(place_dept)) BETWEEN 1 AND 80),
  ADD COLUMN place_folder_id uuid REFERENCES public.hiring_bank_folders(id),
  ADD CONSTRAINT hiring_talents_place CHECK (
    place_kind IS NULL
    OR (place_kind = 'company' AND place_dept IS NULL AND place_folder_id IS NULL)
    OR (place_kind = 'dept' AND place_dept IS NOT NULL AND place_folder_id IS NULL)
    OR (place_kind = 'folder' AND place_folder_id IS NOT NULL AND place_sub_id IS NULL AND place_dept IS NULL));
CREATE INDEX hiring_talents_in_folder ON public.hiring_talents (place_folder_id) WHERE place_folder_id IS NOT NULL;

-- A guest's request keeps WHICH company sent it, not only its name: a company renamed in Admin › Guest Link is still
-- found when a candidate of its older requests is saved (the user, 2026-10-12: "change name … move together").
ALTER TABLE public.hiring_requests ADD COLUMN requester_sub_id uuid REFERENCES public.guest_link_subsidiaries(id);
UPDATE public.hiring_requests r
   SET requester_sub_id = (SELECT s.id FROM public.guest_link_subsidiaries s
                            WHERE lower(btrim(s.name)) = lower(btrim(r.requester_company))
                            ORDER BY s.deleted_at NULLS FIRST, s.created_at LIMIT 1)
 WHERE r.source = 'guest' AND r.requester_sub_id IS NULL AND btrim(coalesce(r.requester_company, '')) <> '';

-- No client grants (as the module's other tables): the functions below are the way in.
REVOKE ALL ON public.hiring_bank_folders, public.hiring_bank_files FROM PUBLIC, anon, authenticated;

SELECT public.audit_register('hiring_bank_folders', 'Talent Bank folders', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{name}');
SELECT public.audit_register('hiring_bank_files', 'Talent Bank files', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{name}');

-- ── 2. Helpers (only the functions below call them) ─────────────────────────

-- A place's address, as the page keeps it: root, company:hv, company:<sub>, dept:<hv|sub>:<name>, folder:<id>.
CREATE OR REPLACE FUNCTION public.hiring_bank_at(p_kind text, p_sub uuid, p_dept text, p_folder uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_kind
    WHEN 'root' THEN 'root'
    WHEN 'company' THEN 'company:' || coalesce(p_sub::text, 'hv')
    WHEN 'dept' THEN 'dept:' || coalesce(p_sub::text, 'hv') || ':' || p_dept
    ELSE 'folder:' || p_folder::text
  END
$$;

-- HOUZS Venture's departments: Hiring › Form settings' Department choices, each by its first part
-- ("Revenue · Fair" → Revenue), once, in order — the Talent Bank's departments before it was a Drive.
CREATE OR REPLACE FUNCTION public.hiring_bank_hq_departments()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN coalesce((
    SELECT array_agg(z.d ORDER BY z.o)
      FROM (SELECT DISTINCT ON (lower(y.d)) y.d, y.o
              FROM (SELECT btrim(split_part(btrim(u.x), ' · ', 1)) AS d, u.o
                      FROM unnest(string_to_array((SELECT f.options FROM public.hiring_form_fields f WHERE f.id = 'dept'), ','))
                           WITH ORDINALITY AS u(x, o)) y
             WHERE y.d <> ''
             ORDER BY lower(y.d), y.o) z), '{}');
END
$$;

-- A company's departments: HOUZS Venture's (NULL), or a subsidiary's as Admin › Guest Link lists them.
CREATE OR REPLACE FUNCTION public.hiring_bank_departments(p_sub uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_sub IS NULL THEN
    RETURN public.hiring_bank_hq_departments();
  END IF;
  RETURN coalesce((SELECT s.departments FROM public.guest_link_subsidiaries s WHERE s.id = p_sub), '{}');
END
$$;

-- An address read back — and refused when it is not a place any more. A department is there while its company lists
-- it, or while something is in it (a talent, a folder, a file); a talent's folder is their record, never a place.
CREATE OR REPLACE FUNCTION public.hiring_bank_place(p_at text, OUT kind text, OUT sub uuid, OUT dept text, OUT folder uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at   text := coalesce(p_at, '');
  v_rest text;
  v_co   text;
  v_name text;
  v_list text;
BEGIN
  IF v_at = 'root' THEN
    kind := 'root';
    RETURN;
  END IF;
  IF v_at = 'company:hv' THEN
    kind := 'company';
    RETURN;
  END IF;
  IF v_at ~* '^company:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    sub := substr(v_at, 9)::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.guest_link_subsidiaries s WHERE s.id = sub) THEN
      RAISE EXCEPTION 'That company is not there any more.' USING ERRCODE = '22023';
    END IF;
    kind := 'company';
    RETURN;
  END IF;
  IF v_at LIKE 'dept:%' THEN
    v_rest := substr(v_at, 6);
    v_co := split_part(v_rest, ':', 1);
    v_name := btrim(substr(v_rest, length(v_co) + 2));
    IF v_co = 'hv' THEN
      sub := NULL;
    ELSIF v_co ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND EXISTS (SELECT 1 FROM public.guest_link_subsidiaries s WHERE s.id = v_co::uuid) THEN
      sub := v_co::uuid;
    ELSE
      RAISE EXCEPTION 'That department is not there any more.' USING ERRCODE = '22023';
    END IF;
    IF v_name = '' OR length(v_name) > 80 THEN
      RAISE EXCEPTION 'That department is not there any more.' USING ERRCODE = '22023';
    END IF;
    SELECT x INTO v_list FROM unnest(public.hiring_bank_departments(sub)) x WHERE lower(btrim(x)) = lower(v_name) LIMIT 1;
    IF v_list IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.hiring_talents t WHERE t.place_kind = 'dept' AND t.place_sub_id IS NOT DISTINCT FROM sub
                         AND lower(t.place_dept) = lower(v_name) AND t.removed_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_folders f WHERE f.parent_kind = 'dept' AND f.parent_sub_id IS NOT DISTINCT FROM sub
                         AND lower(f.parent_dept) = lower(v_name) AND f.deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.place_kind = 'dept' AND b.place_sub_id IS NOT DISTINCT FROM sub
                         AND lower(b.place_dept) = lower(v_name)) THEN
      RAISE EXCEPTION 'That department is not there any more.' USING ERRCODE = '22023';
    END IF;
    kind := 'dept';
    dept := coalesce(btrim(v_list), v_name);
    RETURN;
  END IF;
  IF v_at ~* '^folder:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    folder := substr(v_at, 8)::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.hiring_bank_folders f WHERE f.id = folder AND f.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
    END IF;
    kind := 'folder';
    RETURN;
  END IF;
  IF v_at LIKE 'talent:%' THEN
    RAISE EXCEPTION 'A person''s folder is their record — open it to add their files.' USING ERRCODE = '22023';
  END IF;
  RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
END
$$;

-- Whether a name is taken in a place: by a live folder HR made there, or by what is there by itself — HOUZS Venture
-- and the guest link's companies in the Talent Bank, a company's own departments in it.
CREATE OR REPLACE FUNCTION public.hiring_bank_name_taken(p_kind text, p_sub uuid, p_dept text, p_folder uuid, p_name text, p_except uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := lower(btrim(coalesce(p_name, '')));
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.hiring_bank_folders f
                  WHERE f.deleted_at IS NULL AND f.parent_kind = p_kind
                    AND f.parent_sub_id IS NOT DISTINCT FROM p_sub AND f.parent_folder_id IS NOT DISTINCT FROM p_folder
                    AND lower(coalesce(f.parent_dept, '')) = lower(coalesce(p_dept, ''))
                    AND lower(btrim(f.name)) = v_name AND f.id IS DISTINCT FROM p_except)
      OR (p_kind = 'root' AND (v_name = 'houzs venture'
            OR EXISTS (SELECT 1 FROM public.guest_link_subsidiaries s WHERE s.deleted_at IS NULL AND lower(btrim(s.name)) = v_name)))
      OR (p_kind = 'company' AND EXISTS (SELECT 1 FROM unnest(public.hiring_bank_departments(p_sub)) x WHERE lower(btrim(x)) = v_name));
END
$$;

-- A place in words, from the top: "Carres › Sales", "HOUZS Venture › Revenue › Seniors", "Walk-ins".
CREATE OR REPLACE FUNCTION public.hiring_bank_label(p_kind text, p_sub uuid, p_dept text, p_folder uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path text;
  v_kind text;
  v_sub  uuid;
  v_dept text;
BEGIN
  IF p_kind = 'root' THEN
    RETURN 'Talent Bank';
  END IF;
  IF p_kind IN ('company', 'dept') THEN
    RETURN coalesce((SELECT s.name FROM public.guest_link_subsidiaries s WHERE s.id = p_sub), 'HOUZS Venture')
      || CASE WHEN p_kind = 'dept' THEN ' › ' || p_dept ELSE '' END;
  END IF;
  -- The folders up to the top one, and what the top one is in.
  WITH RECURSIVE up AS (
    SELECT f.name, f.parent_kind, f.parent_sub_id, f.parent_dept, f.parent_folder_id, 1 AS depth
      FROM public.hiring_bank_folders f WHERE f.id = p_folder
    UNION ALL
    SELECT p.name, p.parent_kind, p.parent_sub_id, p.parent_dept, p.parent_folder_id, up.depth + 1
      FROM public.hiring_bank_folders p JOIN up ON p.id = up.parent_folder_id WHERE up.depth < 32
  )
  SELECT (SELECT string_agg(u.name, ' › ' ORDER BY u.depth DESC) FROM up u),
         (SELECT u.parent_kind FROM up u ORDER BY u.depth DESC LIMIT 1),
         (SELECT u.parent_sub_id FROM up u ORDER BY u.depth DESC LIMIT 1),
         (SELECT u.parent_dept FROM up u ORDER BY u.depth DESC LIMIT 1)
    INTO v_path, v_kind, v_sub, v_dept;
  IF v_kind IN ('company', 'dept') THEN
    RETURN public.hiring_bank_label(v_kind, v_sub, v_dept, NULL) || ' › ' || coalesce(v_path, '');
  END IF;
  RETURN coalesce(v_path, '');
END
$$;

-- The department a talent added to a place is filed under: the place's own department, else the nearest one above it,
-- else the folder's or the company's name.
CREATE OR REPLACE FUNCTION public.hiring_bank_dept_of(p_kind text, p_sub uuid, p_dept text, p_folder uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept text;
  v_own  text;
BEGIN
  IF p_kind = 'dept' THEN
    RETURN left(p_dept, 80);
  END IF;
  IF p_kind = 'company' THEN
    RETURN left(coalesce((SELECT s.name FROM public.guest_link_subsidiaries s WHERE s.id = p_sub), 'HOUZS Venture'), 80);
  END IF;
  WITH RECURSIVE up AS (
    SELECT f.name, f.parent_kind, f.parent_dept, f.parent_folder_id, 1 AS depth FROM public.hiring_bank_folders f WHERE f.id = p_folder
    UNION ALL
    SELECT p.name, p.parent_kind, p.parent_dept, p.parent_folder_id, up.depth + 1
      FROM public.hiring_bank_folders p JOIN up ON p.id = up.parent_folder_id WHERE up.depth < 32
  )
  SELECT (SELECT u.parent_dept FROM up u WHERE u.parent_kind = 'dept' ORDER BY u.depth LIMIT 1),
         (SELECT u.name FROM up u WHERE u.depth = 1)
    INTO v_dept, v_own;
  RETURN left(coalesce(v_dept, v_own, 'Talent Bank'), 80);
END
$$;

-- "Found by name": a company and a department → the place they are (made now when not there yet). The company is the
-- one a guest's request was sent from (p_sub — found by id, renamed or not), HOUZS Venture, a subsidiary of the guest
-- link's list by name (a live one first), else a folder HR made at the top by that name; the department one the company
-- lists, else one it no longer lists that somebody is still kept in, else a folder by that name in the company.
CREATE OR REPLACE FUNCTION public.hiring_bank_locate(p_company text, p_dept text, p_sub uuid, OUT kind text, OUT sub uuid, OUT dept text, OUT folder uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_co     text := left(btrim(regexp_replace(coalesce(p_company, ''), '[/\\]', '-', 'g')), 80);
  v_dept   text := left(btrim(regexp_replace(coalesce(p_dept, ''), '[/\\]', '-', 'g')), 80);
  v_actor  text := public.hiring_actor_name();
  v_listed text;
  v_in     uuid;
BEGIN
  IF p_sub IS NOT NULL AND EXISTS (SELECT 1 FROM public.guest_link_subsidiaries s WHERE s.id = p_sub) THEN
    kind := 'company';
    sub := p_sub;
  ELSIF v_co = '' OR lower(v_co) = 'houzs venture' THEN
    kind := 'company';
  ELSE
    SELECT s.id INTO sub FROM public.guest_link_subsidiaries s
     WHERE lower(btrim(s.name)) = lower(v_co) ORDER BY s.deleted_at NULLS FIRST, s.created_at LIMIT 1;
    IF sub IS NOT NULL THEN
      kind := 'company';
    ELSE
      SELECT f.id INTO folder FROM public.hiring_bank_folders f
       WHERE f.deleted_at IS NULL AND f.parent_kind = 'root' AND lower(btrim(f.name)) = lower(v_co)
       ORDER BY f.created_at LIMIT 1;
      IF folder IS NULL THEN
        INSERT INTO public.hiring_bank_folders (name, parent_kind, created_by, created_by_name)
        VALUES (v_co, 'root', auth.uid(), v_actor) RETURNING id INTO folder;
      END IF;
      kind := 'folder';
    END IF;
  END IF;
  IF v_dept = '' THEN
    RETURN;
  END IF;
  IF kind = 'company' THEN
    SELECT btrim(x) INTO v_listed FROM unnest(public.hiring_bank_departments(sub)) x WHERE lower(btrim(x)) = lower(v_dept) LIMIT 1;
    IF v_listed IS NOT NULL THEN
      kind := 'dept';
      dept := v_listed;
      RETURN;
    END IF;
    -- A department the company no longer lists that somebody is still kept in: that one — never a second of its name.
    SELECT x.d INTO v_listed FROM (
      SELECT t.place_dept AS d FROM public.hiring_talents t
       WHERE t.place_kind = 'dept' AND t.place_sub_id IS NOT DISTINCT FROM sub AND lower(t.place_dept) = lower(v_dept) AND t.removed_at IS NULL
      UNION ALL
      SELECT f.parent_dept FROM public.hiring_bank_folders f
       WHERE f.parent_kind = 'dept' AND f.parent_sub_id IS NOT DISTINCT FROM sub AND lower(f.parent_dept) = lower(v_dept) AND f.deleted_at IS NULL
      UNION ALL
      SELECT b.place_dept FROM public.hiring_bank_files b
       WHERE b.place_kind = 'dept' AND b.place_sub_id IS NOT DISTINCT FROM sub AND lower(b.place_dept) = lower(v_dept)
    ) x LIMIT 1;
    IF v_listed IS NOT NULL THEN
      kind := 'dept';
      dept := v_listed;
      RETURN;
    END IF;
    SELECT f.id INTO v_in FROM public.hiring_bank_folders f
     WHERE f.deleted_at IS NULL AND f.parent_kind = 'company' AND f.parent_sub_id IS NOT DISTINCT FROM sub
       AND lower(btrim(f.name)) = lower(v_dept)
     ORDER BY f.created_at LIMIT 1;
    IF v_in IS NULL THEN
      INSERT INTO public.hiring_bank_folders (name, parent_kind, parent_sub_id, created_by, created_by_name)
      VALUES (v_dept, 'company', sub, auth.uid(), v_actor) RETURNING id INTO v_in;
    END IF;
    kind := 'folder';
    sub := NULL;
    folder := v_in;
    RETURN;
  END IF;
  SELECT f.id INTO v_in FROM public.hiring_bank_folders f
   WHERE f.deleted_at IS NULL AND f.parent_kind = 'folder' AND f.parent_folder_id = folder AND lower(btrim(f.name)) = lower(v_dept)
   ORDER BY f.created_at LIMIT 1;
  IF v_in IS NULL THEN
    INSERT INTO public.hiring_bank_folders (name, parent_kind, parent_folder_id, created_by, created_by_name)
    VALUES (v_dept, 'folder', folder, auth.uid(), v_actor) RETURNING id INTO v_in;
  END IF;
  folder := v_in;
END
$$;

-- Where a talent saved without a place belongs: a guest request's company (by id, and by name) and department, a portal
-- request's HOUZS Venture and the department picked (else the request's own, by its first part), or HOUZS Venture and
-- the department.
CREATE OR REPLACE FUNCTION public.hiring_bank_home(p_request text, p_department text, OUT company text, OUT sub uuid, OUT dept text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.hiring_requests%ROWTYPE;
BEGIN
  company := 'HOUZS Venture';
  dept := nullif(btrim(coalesce(p_department, '')), '');
  IF p_request IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO r FROM public.hiring_requests WHERE id = p_request;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF r.source = 'guest' AND (btrim(coalesce(r.requester_company, '')) <> '' OR r.requester_sub_id IS NOT NULL) THEN
    company := btrim(coalesce(r.requester_company, ''));
    sub := r.requester_sub_id;
    dept := coalesce(nullif(btrim(coalesce(r.answers ->> 'dept', '')), ''), dept);
  ELSE
    dept := coalesce(dept, nullif(btrim(split_part(coalesce(r.answers ->> 'dept', ''), ' · ', 1)), ''));
  END IF;
END
$$;

-- Every talent saved without a place is placed (Save to Talent Bank from a candidate, + Add talent, …).
CREATE OR REPLACE FUNCTION public.hiring_bank_place_talent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h record;
  p record;
BEGIN
  IF NEW.place_kind IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO h FROM public.hiring_bank_home(NEW.from_request, NEW.department);
  SELECT * INTO p FROM public.hiring_bank_locate(h.company, h.dept, h.sub);
  NEW.place_kind := p.kind;
  NEW.place_sub_id := p.sub;
  NEW.place_dept := p.dept;
  NEW.place_folder_id := p.folder;
  RETURN NEW;
END
$$;

CREATE TRIGGER hiring_talents_place BEFORE INSERT ON public.hiring_talents
  FOR EACH ROW EXECUTE FUNCTION public.hiring_bank_place_talent();

-- The talents already in the bank, placed the same way (production has none on 2026-10-12).
DO $fill$
DECLARE
  t record;
  h record;
  p record;
BEGIN
  FOR t IN SELECT id, from_request, department FROM public.hiring_talents WHERE place_kind IS NULL ORDER BY saved_at, no LOOP
    SELECT * INTO h FROM public.hiring_bank_home(t.from_request, t.department);
    SELECT * INTO p FROM public.hiring_bank_locate(h.company, h.dept, h.sub);
    UPDATE public.hiring_talents
       SET place_kind = p.kind, place_sub_id = p.sub, place_dept = p.dept, place_folder_id = p.folder
     WHERE id = t.id;
  END LOOP;
END
$fill$;

ALTER TABLE public.hiring_talents ALTER COLUMN place_kind SET NOT NULL;

-- ── 3. The page's read ──────────────────────────────────────────────────────

-- HOUZS Venture's departments, the guest link's companies (a removed one too: the page keeps it while it holds
-- something), the folders and files HR keeps, and where each talent in the bank is.
CREATE OR REPLACE FUNCTION public.hiring_bank()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_any_action(ARRAY['hiring.view']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring access is required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'hq', to_jsonb(public.hiring_bank_hq_departments()),
    'subs', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name,
               'departments', to_jsonb(s.departments), 'removed', s.deleted_at IS NOT NULL) ORDER BY s.sort_order, s.name), '[]'::jsonb)
             FROM public.guest_link_subsidiaries s),
    'folders', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name,
                  'parent', public.hiring_bank_at(f.parent_kind, f.parent_sub_id, f.parent_dept, f.parent_folder_id),
                  'createdAt', f.created_at, 'createdBy', f.created_by_name) ORDER BY lower(f.name), f.created_at), '[]'::jsonb)
                FROM public.hiring_bank_folders f WHERE f.deleted_at IS NULL),
    'files', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'contentType', b.content_type, 'size', b.size,
                'parent', public.hiring_bank_at(b.place_kind, b.place_sub_id, b.place_dept, b.place_folder_id),
                'addedAt', b.added_at, 'addedBy', b.added_by_name) ORDER BY lower(b.name), b.added_at), '[]'::jsonb)
              FROM public.hiring_bank_files b),
    'places', (SELECT coalesce(jsonb_object_agg(t.id, public.hiring_bank_at(t.place_kind, t.place_sub_id, t.place_dept, t.place_folder_id)), '{}'::jsonb)
               FROM public.hiring_talents t WHERE t.removed_at IS NULL)
  );
END
$$;

-- ── 4. Writes ───────────────────────────────────────────────────────────────

-- + New › New folder: in the bank, a company, a department or another folder (never inside a person).
CREATE OR REPLACE FUNCTION public.hiring_bank_folder_add(p_parent text, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  p record;
  v_id uuid;
BEGIN
  IF public.has_any_action(ARRAY['hiring.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create is required' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Name the folder.' USING ERRCODE = '22023'; END IF;
  IF length(v_name) > 80 THEN RAISE EXCEPTION 'Keep the name under 80 characters.' USING ERRCODE = '22023'; END IF;
  IF v_name ~ '[/\\]' THEN RAISE EXCEPTION 'A folder''s name cannot hold a slash.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM public.hiring_bank_place(p_parent);
  IF public.hiring_bank_name_taken(p.kind, p.sub, p.dept, p.folder, v_name, NULL) THEN
    RAISE EXCEPTION '% is here already.', v_name USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hiring_bank_folders (name, parent_kind, parent_sub_id, parent_dept, parent_folder_id, created_by, created_by_name)
  VALUES (v_name, p.kind, p.sub, p.dept, p.folder, auth.uid(), public.hiring_actor_name())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- A folder's ⋮ › Rename.
CREATE OR REPLACE FUNCTION public.hiring_bank_folder_rename(p_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  f public.hiring_bank_folders%ROWTYPE;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM public.hiring_bank_folders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Name the folder.' USING ERRCODE = '22023'; END IF;
  IF length(v_name) > 80 THEN RAISE EXCEPTION 'Keep the name under 80 characters.' USING ERRCODE = '22023'; END IF;
  IF v_name ~ '[/\\]' THEN RAISE EXCEPTION 'A folder''s name cannot hold a slash.' USING ERRCODE = '22023'; END IF;
  IF public.hiring_bank_name_taken(f.parent_kind, f.parent_sub_id, f.parent_dept, f.parent_folder_id, v_name, f.id) THEN
    RAISE EXCEPTION '% is here already.', v_name USING ERRCODE = '22023';
  END IF;
  UPDATE public.hiring_bank_folders SET name = v_name WHERE id = p_id;
END
$$;

-- A folder's ⋮ › Delete — only an empty one (no folder, nobody, no file in it).
CREATE OR REPLACE FUNCTION public.hiring_bank_folder_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.hiring_bank_folders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.hiring_bank_folders f WHERE f.parent_folder_id = p_id AND f.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.hiring_talents t WHERE t.place_folder_id = p_id AND t.removed_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.place_folder_id = p_id) THEN
    RAISE EXCEPTION 'Empty it first.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hiring_bank_folders SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_id;
END
$$;

-- A talent's Move to…: a company, a department or a folder. On their History as Moved.
CREATE OR REPLACE FUNCTION public.hiring_bank_move(p_talent uuid, p_place text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.hiring_talents%ROWTYPE;
  p record;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM public.hiring_talents WHERE id = p_talent AND removed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That talent is not in the bank any more' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM public.hiring_bank_place(p_place);
  IF p.kind = 'root' THEN
    RAISE EXCEPTION 'Pick a company, a department or a folder.' USING ERRCODE = '22023';
  END IF;
  IF (t.place_kind, t.place_sub_id, t.place_dept, t.place_folder_id) IS NOT DISTINCT FROM (p.kind, p.sub, p.dept, p.folder) THEN
    RETURN;
  END IF;
  UPDATE public.hiring_talents
     SET place_kind = p.kind, place_sub_id = p.sub, place_dept = p.dept, place_folder_id = p.folder
   WHERE id = p_talent;
  PERFORM public.hiring_talent_log(p_talent, 'Moved', public.hiring_bank_label(p.kind, p.sub, p.dept, p.folder));
END
$$;

-- + New › Add talent, in the place it is pressed: a name and what they fit, the rest helps — their files too.
CREATE OR REPLACE FUNCTION public.hiring_bank_add_talent(p_place text, p_name text, p_phone text, p_email text, p_position text,
  p_notes text, p_files jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  p record;
  v_id uuid;
BEGIN
  IF public.has_any_action(ARRAY['hiring.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create is required' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' OR btrim(coalesce(p_position, '')) = '' THEN
    RAISE EXCEPTION 'Add a name and the position they fit.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM public.hiring_bank_place(p_place);
  IF p.kind = 'root' THEN
    RAISE EXCEPTION 'Open a company, a department or a folder first.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hiring_talents (no, name, phone, email, position, department, notes, saved_by_name, saved_by,
    place_kind, place_sub_id, place_dept, place_folder_id)
  VALUES ('T-' || lpad(nextval('public.hiring_talent_no_seq')::text, 3, '0'), v_name, btrim(coalesce(p_phone, '')),
    btrim(coalesce(p_email, '')), btrim(p_position), public.hiring_bank_dept_of(p.kind, p.sub, p.dept, p.folder),
    coalesce(p_notes, ''), public.hiring_actor_name(), auth.uid(), p.kind, p.sub, p.dept, p.folder)
  RETURNING id INTO v_id;
  PERFORM public.hiring_attach(NULL, v_id, p_files, false);
  PERFORM public.hiring_talent_log(v_id, 'Added to Talent Bank', public.hiring_bank_label(p.kind, p.sub, p.dept, p.folder));
  RETURN v_id;
END
$$;

-- + New › Upload files: a file HR keeps in a place (not in a person's folder — their files are on their record).
CREATE OR REPLACE FUNCTION public.hiring_bank_file_add(p_place text, p_path text, p_name text, p_type text, p_size bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path text := btrim(coalesce(p_path, ''));
  v_name text := left(btrim(coalesce(p_name, '')), 160);
  p record;
  v_id uuid;
BEGIN
  IF public.has_any_action(ARRAY['hiring.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM public.hiring_bank_place(p_place);
  IF v_path !~ '^files/' THEN
    RAISE EXCEPTION 'That file did not arrive. Please upload it again.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.hiring_take_upload(v_path);
  IF v_name = '' THEN v_name := regexp_replace(v_path, '^.*/', ''); END IF;
  INSERT INTO public.hiring_bank_files (place_kind, place_sub_id, place_dept, place_folder_id, path, name, content_type, size,
    added_by, added_by_name)
  VALUES (p.kind, p.sub, p.dept, p.folder, v_path, v_name, nullif(btrim(coalesce(p_type, '')), ''),
    CASE WHEN p_size >= 0 THEN p_size END, auth.uid(), public.hiring_actor_name())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- A file's ⋮ › Delete: the row now, and the object it named back to the caller to delete (as a talent's files go).
CREATE OR REPLACE FUNCTION public.hiring_bank_file_delete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.hiring_bank_files WHERE id = p_id RETURNING path INTO v_path;
  IF v_path IS NULL THEN
    RAISE EXCEPTION 'That file is not there any more.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('orphans', to_jsonb(public.hiring_orphaned(ARRAY[v_path])));
END
$$;

-- ── 4b. Moving together (the user, 2026-10-12: "change name, and move together") ──

-- A folder's ⋮ › Move to…: the folder and everything in it — its folders, people and files name the folder, not its
-- place, so they go with it. Never into itself or a folder inside it; a name the place already has stops it.
CREATE OR REPLACE FUNCTION public.hiring_bank_folder_move(p_id uuid, p_parent text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.hiring_bank_folders%ROWTYPE;
  p record;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM public.hiring_bank_folders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM public.hiring_bank_place(p_parent);
  IF p.kind = 'folder' AND EXISTS (
       WITH RECURSIVE up AS (
         SELECT x.id, x.parent_folder_id, 1 AS depth FROM public.hiring_bank_folders x WHERE x.id = p.folder
         UNION ALL
         SELECT y.id, y.parent_folder_id, up.depth + 1 FROM public.hiring_bank_folders y JOIN up ON y.id = up.parent_folder_id WHERE up.depth < 64)
       SELECT 1 FROM up WHERE up.id = p_id) THEN
    RAISE EXCEPTION 'A folder cannot go inside itself.' USING ERRCODE = '22023';
  END IF;
  IF (f.parent_kind, f.parent_sub_id, lower(f.parent_dept), f.parent_folder_id) IS NOT DISTINCT FROM (p.kind, p.sub, lower(p.dept), p.folder) THEN
    RETURN;
  END IF;
  IF public.hiring_bank_name_taken(p.kind, p.sub, p.dept, p.folder, f.name, f.id) THEN
    RAISE EXCEPTION '% is there already — rename one first.', f.name USING ERRCODE = '22023';
  END IF;
  UPDATE public.hiring_bank_folders
     SET parent_kind = p.kind, parent_sub_id = p.sub, parent_dept = p.dept, parent_folder_id = p.folder
   WHERE id = p_id;
END
$$;

-- A department's ⋮ › Move everyone to…: the people, the folders (with all in them) and the files right in a department
-- go to another place together — a department its company no longer lists empties and goes. Each person's History
-- says Moved.
CREATE OR REPLACE FUNCTION public.hiring_bank_move_all(p_from text, p_to text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  d record;
  t record;
  v_clash text;
  v_label text;
  v_people integer := 0;
  v_folders integer;
  v_files integer;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.hiring_bank_place(p_from);
  IF s.kind IS DISTINCT FROM 'dept' THEN
    RAISE EXCEPTION 'Move everyone out of a department.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO d FROM public.hiring_bank_place(p_to);
  IF d.kind = 'root' THEN
    RAISE EXCEPTION 'Pick a company, a department or a folder.' USING ERRCODE = '22023';
  END IF;
  IF d.kind = 'dept' AND d.sub IS NOT DISTINCT FROM s.sub AND lower(d.dept) = lower(s.dept) THEN
    RAISE EXCEPTION 'They are there already.' USING ERRCODE = '22023';
  END IF;
  -- Never into a folder of the department itself.
  IF d.kind = 'folder' AND EXISTS (
       WITH RECURSIVE up AS (
         SELECT x.id, x.parent_kind, x.parent_sub_id, x.parent_dept, x.parent_folder_id, 1 AS depth
           FROM public.hiring_bank_folders x WHERE x.id = d.folder
         UNION ALL
         SELECT y.id, y.parent_kind, y.parent_sub_id, y.parent_dept, y.parent_folder_id, up.depth + 1
           FROM public.hiring_bank_folders y JOIN up ON y.id = up.parent_folder_id WHERE up.depth < 64)
       SELECT 1 FROM up WHERE up.parent_kind = 'dept' AND up.parent_sub_id IS NOT DISTINCT FROM s.sub AND lower(up.parent_dept) = lower(s.dept)) THEN
    RAISE EXCEPTION 'Pick a place outside this department.' USING ERRCODE = '22023';
  END IF;
  SELECT f.name INTO v_clash FROM public.hiring_bank_folders f
   WHERE f.deleted_at IS NULL AND f.parent_kind = 'dept' AND f.parent_sub_id IS NOT DISTINCT FROM s.sub AND lower(f.parent_dept) = lower(s.dept)
     AND public.hiring_bank_name_taken(d.kind, d.sub, d.dept, d.folder, f.name, f.id)
   LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION '% is there already — rename one first.', v_clash USING ERRCODE = '22023';
  END IF;
  v_label := public.hiring_bank_label(d.kind, d.sub, d.dept, d.folder);
  FOR t IN SELECT x.id FROM public.hiring_talents x
            WHERE x.place_kind = 'dept' AND x.place_sub_id IS NOT DISTINCT FROM s.sub AND lower(x.place_dept) = lower(s.dept)
              AND x.removed_at IS NULL
            ORDER BY x.name FOR UPDATE LOOP
    UPDATE public.hiring_talents
       SET place_kind = d.kind, place_sub_id = d.sub, place_dept = d.dept, place_folder_id = d.folder
     WHERE id = t.id;
    PERFORM public.hiring_talent_log(t.id, 'Moved', v_label);
    v_people := v_people + 1;
  END LOOP;
  UPDATE public.hiring_bank_folders
     SET parent_kind = d.kind, parent_sub_id = d.sub, parent_dept = d.dept, parent_folder_id = d.folder
   WHERE deleted_at IS NULL AND parent_kind = 'dept' AND parent_sub_id IS NOT DISTINCT FROM s.sub AND lower(parent_dept) = lower(s.dept);
  GET DIAGNOSTICS v_folders = ROW_COUNT;
  UPDATE public.hiring_bank_files
     SET place_kind = d.kind, place_sub_id = d.sub, place_dept = d.dept, place_folder_id = d.folder
   WHERE place_kind = 'dept' AND place_sub_id IS NOT DISTINCT FROM s.sub AND lower(place_dept) = lower(s.dept);
  GET DIAGNOSTICS v_files = ROW_COUNT;
  RETURN jsonb_build_object('people', v_people, 'folders', v_folders, 'files', v_files, 'to', v_label);
END
$$;

-- Admin › Guest Link: a department RENAMED (not taken off and another added) keeps its place in the list, and its
-- people, folders and files in the Talent Bank go with the new name.
CREATE OR REPLACE FUNCTION public.guest_link_rename_department(p_sub uuid, p_old text, p_new text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.guest_link_subsidiaries%ROWTYPE;
  v_old text := btrim(coalesce(p_old, ''));
  v_new text := btrim(coalesce(p_new, ''));
  v_at  integer;
BEGIN
  IF public.has_any_action(ARRAY['guest_link.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Changing the guest link needs Guest link · Edit.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.guest_link_subsidiaries WHERE id = p_sub AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That subsidiary is no longer there.'; END IF;
  IF v_new = '' THEN RAISE EXCEPTION 'Name the department.'; END IF;
  IF length(v_new) > 60 THEN RAISE EXCEPTION 'Keep a department under 60 characters.'; END IF;
  v_at := array_position(ARRAY(SELECT lower(btrim(x)) FROM unnest(v_row.departments) x), lower(v_old));
  IF v_at IS NULL THEN RAISE EXCEPTION 'That department is no longer there.'; END IF;
  IF lower(v_new) <> lower(v_old) AND lower(v_new) = ANY (ARRAY(SELECT lower(btrim(x)) FROM unnest(v_row.departments) x)) THEN
    RAISE EXCEPTION '% is on the list already.', v_new;
  END IF;
  IF lower(v_new) <> lower(v_old) AND EXISTS (
       SELECT 1 FROM public.hiring_bank_folders a JOIN public.hiring_bank_folders b ON lower(btrim(a.name)) = lower(btrim(b.name))
        WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.parent_kind = 'dept' AND b.parent_kind = 'dept'
          AND a.parent_sub_id = p_sub AND b.parent_sub_id = p_sub
          AND lower(a.parent_dept) = lower(v_old) AND lower(b.parent_dept) = lower(v_new)) THEN
    RAISE EXCEPTION 'The Talent Bank has a folder of one name in both — rename one there first.';
  END IF;
  v_row.departments[v_at] := v_new;
  UPDATE public.guest_link_subsidiaries SET departments = v_row.departments, updated_at = now() WHERE id = p_sub
  RETURNING * INTO v_row;
  UPDATE public.hiring_talents SET place_dept = v_new
   WHERE place_kind = 'dept' AND place_sub_id = p_sub AND lower(place_dept) = lower(v_old);
  UPDATE public.hiring_bank_folders SET parent_dept = v_new
   WHERE parent_kind = 'dept' AND parent_sub_id = p_sub AND lower(parent_dept) = lower(v_old);
  UPDATE public.hiring_bank_files SET place_dept = v_new
   WHERE place_kind = 'dept' AND place_sub_id = p_sub AND lower(place_dept) = lower(v_old);
  RETURN jsonb_build_object('id', v_row.id, 'code', v_row.code, 'name', v_row.name, 'departments', to_jsonb(v_row.departments));
END
$$;

-- ── 5. The bucket knows a Talent Bank file holds its object ────────────────

SELECT pg_temp.swap_check('public.hiring_file_in_use(text)',
  $q$OR EXISTS (SELECT 1 FROM public.hiring_requests r WHERE r.attachment_path = p_path);$q$,
  $q$OR EXISTS (SELECT 1 FROM public.hiring_requests r WHERE r.attachment_path = p_path)
      OR EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = p_path);$q$);

SELECT pg_temp.swap_check('public.hiring_leftovers(integer)',
  $q$AND NOT EXISTS (SELECT 1 FROM public.hiring_requests r WHERE r.attachment_path = o.name)$q$,
  $q$AND NOT EXISTS (SELECT 1 FROM public.hiring_requests r WHERE r.attachment_path = o.name)
                  AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = o.name)$q$);

SELECT pg_temp.swap_check('public.hiring_orphaned(text[])',
  $q$AND NOT EXISTS (SELECT 1 FROM public.hiring_requests r WHERE r.attachment_path = p)$q$,
  $q$AND NOT EXISTS (SELECT 1 FROM public.hiring_requests r WHERE r.attachment_path = p)
                  AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = p)$q$);

SELECT pg_temp.swap_check('public.hiring_take_upload(text)',
  $q$IF EXISTS (SELECT 1 FROM public.hiring_files f WHERE f.path = p_path) THEN$q$,
  $q$IF EXISTS (SELECT 1 FROM public.hiring_files f WHERE f.path = p_path)
     OR EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = p_path) THEN$q$);

-- A Talent Bank file opens as every hiring file does — a signed link made at the press.
SELECT pg_temp.swap_check('public.hiring_file_path(text, text)',
  $q$ELSIF p_kind = 'attachment' THEN$q$,
  $q$ELSIF p_kind = 'bank' THEN
    SELECT b.path, b.name INTO v_path, v_name FROM public.hiring_bank_files b WHERE b.id::text = p_id;
  ELSIF p_kind = 'attachment' THEN$q$);

-- A guest's request keeps the company it came from (`requester_sub_id`, above). Production's body (md5 6172115c…, mig
-- 20261012220000), one statement swapped — where the guest link is installed (a test of Hiring alone has none).
DO $hire$
BEGIN
  IF to_regprocedure('public.guest_link_hire(text, uuid, text, jsonb, text, text)') IS NOT NULL THEN
    PERFORM pg_temp.swap_check('public.guest_link_hire(text, uuid, text, jsonb, text, text)',
      $q$RETURN jsonb_build_object('id', v_id, 'position', coalesce(nullif(btrim(p_answers ->> 'position'), ''), 'the role'));$q$,
      $q$UPDATE public.hiring_requests SET requester_sub_id = v_sub.id WHERE id = v_id;
  RETURN jsonb_build_object('id', v_id, 'position', coalesce(nullif(btrim(p_answers ->> 'position'), ''), 'the role'));$q$);
  END IF;
END
$hire$;

-- ── 6. Who may call them ────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.hiring_bank_at(text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_hq_departments() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_departments(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_place(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_name_taken(text, uuid, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_label(text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_dept_of(text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_locate(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_home(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_place_talent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hiring_bank_at(text, uuid, text, uuid), public.hiring_bank_hq_departments(),
  public.hiring_bank_departments(uuid), public.hiring_bank_place(text), public.hiring_bank_name_taken(text, uuid, text, uuid, text, uuid),
  public.hiring_bank_label(text, uuid, text, uuid), public.hiring_bank_dept_of(text, uuid, text, uuid),
  public.hiring_bank_locate(text, text, uuid), public.hiring_bank_home(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.hiring_bank() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_folder_add(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_folder_rename(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_folder_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_move(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_add_talent(text, text, text, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_file_add(text, text, text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_file_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_folder_move(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_move_all(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guest_link_rename_department(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hiring_bank(), public.hiring_bank_folder_add(text, text), public.hiring_bank_folder_rename(uuid, text),
  public.hiring_bank_folder_delete(uuid), public.hiring_bank_move(uuid, text),
  public.hiring_bank_add_talent(text, text, text, text, text, text, jsonb), public.hiring_bank_file_add(text, text, text, text, bigint),
  public.hiring_bank_file_delete(uuid), public.hiring_bank_folder_move(uuid, text), public.hiring_bank_move_all(text, text),
  public.guest_link_rename_department(uuid, text, text) TO authenticated;

-- ── 7. Each write asks the Talent Bank's page first (as mig 20261011220100's) ──

SELECT pg_temp.tab_guard('public.hiring_bank_folder_add(text, text)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.create']);
SELECT pg_temp.tab_guard('public.hiring_bank_folder_rename(uuid, text)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_bank_folder_delete(uuid)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_bank_move(uuid, text)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_bank_add_talent(text, text, text, text, text, text, jsonb)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.create']);
SELECT pg_temp.tab_guard('public.hiring_bank_file_add(text, text, text, text, bigint)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.create']);
SELECT pg_temp.tab_guard('public.hiring_bank_file_delete(uuid)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_bank_folder_move(uuid, text)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_bank_move_all(text, text)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);
-- Save to Talent Bank from a candidate is now a request page's write alone (the bank's own + Add talent is
-- hiring_bank_add_talent): its gate narrows, so it asks that page too.
SELECT pg_temp.tab_guard('public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb)',
  $$ARRAY['/hiring/requests/[id]']$$, ARRAY['hiring.create']);

-- ── Guards ──────────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.hiring_bank()', 'public.hiring_bank_folder_add(text, text)', 'public.hiring_bank_folder_rename(uuid, text)',
                              'public.hiring_bank_folder_delete(uuid)', 'public.hiring_bank_move(uuid, text)',
                              'public.hiring_bank_add_talent(text, text, text, text, text, text, jsonb)',
                              'public.hiring_bank_file_add(text, text, text, text, bigint)', 'public.hiring_bank_file_delete(uuid)',
                              'public.hiring_bank_folder_move(uuid, text)', 'public.hiring_bank_move_all(text, text)',
                              'public.guest_link_rename_department(uuid, text, text)'] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: the publishable key may call it', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: a signed-in reader may not call it', v_fn;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.hiring_bank_locate(text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hiring_bank_locate: a helper is open to sessions';
  END IF;
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hiring_file_in_use(text)'::regprocedure), 'hiring_bank_files') = 0 THEN
    RAISE EXCEPTION 'hiring_file_in_use: a Talent Bank file does not hold its object';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hiring_talents WHERE place_kind IS NULL) THEN
    RAISE EXCEPTION 'hiring_talents: a talent has no place';
  END IF;
END
$guard$;
