-- ============================================================================
-- 20261014190000_data_center_personal_and_private.sql
-- People › Documentation: a person's own documents, View only me, and Move /
-- Copy / Duplicate (2026-10-14 — the user: "现在的 documentation 我要分成两种：
-- 一个是 company，一个是 personal"; in the Data center, inside a person's data,
-- right-click a folder → "member view" so they see it on their phone with their
-- own login, and right-click a document (an offer letter) so they do not; the
-- Drive's right-click / ⋮ to move, copy or duplicate; and "view only me" — set by
-- Alvin of HR (L3), only Alvin and those ABOVE him (L4 …) see it, no other L3).
-- ============================================================================
--
-- The user's answers (2026-10-14): a LETTER can be kept from its person too —
-- it is still sent by default (a memo they acknowledge); hidden, it is nowhere in
-- their app (its memo with it) but stays on the record and counts as on file; shown
-- again it comes back, read and acknowledged as it was. The shared principal@
-- account sees what is View only me (the Principal sees everything).
--
--   A PERSON'S FOLDER holds folders and files of HR's (`parent_kind 'person'`,
--   `parent_staff_id`), any depth, beside their letters — the database no longer
--   refuses "A person's folder holds their letters".
--
--   SHARED WITH THEM (`member_view` on a folder or a file in a person's folder):
--   true shares it, false keeps it back, null follows the folder it is in; the
--   person's folder itself shares nothing. A folder shared shares everything in
--   it but what is kept back. Something View only me never follows its folder's
--   sharing — only a share of its own shows it. Moved to another person's folder
--   (or out of one) it and everything in it are shared with nobody; a copy is
--   shared with nobody. A letter: `hr_person_letters.member_hidden_at` — hidden,
--   its person is taken off the memo it travelled as (every reader of memos asks
--   `member_memo_recipients`), their receipt kept; shown, put back.
--
--   VIEW ONLY ME (`private_by`, its owner's rank when it was set): the one who set
--   it, everybody whose title stands HIGHER on the ladder (`title_levels.rank`, the
--   owner's rank now — the one kept when they have left), and the Principal kind.
--   Everything in a folder View only me goes with it. Nobody else is shown it — not
--   in the read, the Bin, the search, a link, the bucket (`hr_documents_read` asks
--   `hr_doc_readable_by_hr`), the Audit Log (the rule `drive_private`: only the
--   Audit Log key), or a name refused as "taken". It needs a login of one's own
--   whose title is on the ladder (hr@ is several people). Moved or copied out of a
--   folder View only me, a thing takes that folder's lock with it — never seen
--   more widely than before.
--
--   MOVE / COPY / DUPLICATE: a file moves (Move to…, as a folder did); a file or a
--   folder is copied (Copy to…, Duplicate = "Copy of …" in the same place). The
--   objects are copied in the bucket first, under HR's own session
--   (`hr_drive_copy_plan` says which), then recorded.
--
--   ONE'S OWN DOCUMENTS (`my_documents()`): the caller's login → their People
--   record → Company (what their department is shared — a Revenue member's still
--   behind Profile · Documentation's box) and Personal (what of their folder is
--   shared with them, their letters not hidden). Opened by `my_document_open`;
--   the bucket signs a shared file for its person (`hr_file_readable_by_member`).
--   The Revenue app's View as reads one member's with `my_documents_of` (View).
--
-- Production's bodies — read off pg_proc on 2026-10-14 and compared, whitespace
-- aside, before each is replaced (`expect_body`), or one span swapped
-- (`swap_check`); either refuses if production changed since. Documentation's
-- cells are all on its one tab, so no gate narrows and nothing is tab-guarded.

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

-- A body about to be replaced whole: it must be production's of 2026-10-14, every run of whitespace one space.
CREATE OR REPLACE FUNCTION pg_temp.expect_body(p_sig regprocedure, p_md5 text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v text := (SELECT md5(regexp_replace(prosrc, '\s+', ' ', 'g')) FROM pg_proc WHERE oid = p_sig);
BEGIN
  IF v IS DISTINCT FROM p_md5 THEN
    RAISE EXCEPTION '%: its body reads % here, not % as read off production on 2026-10-14 — production changed since this migration was written',
      p_sig, v, p_md5;
  END IF;
END
$fn$;

SELECT pg_temp.expect_body('public.hr_drive_place(text)', '8364a642bfc6f4d96e34bf3f9e7884e8');
SELECT pg_temp.expect_body('public.hr_drive_name_taken(text,uuid,uuid,text,uuid)', 'c8ae085e1d9a73eed444f085d8f45f2f');
SELECT pg_temp.expect_body('public.hr_drive()', '14d1bfe3db158419954114876834807e');
SELECT pg_temp.expect_body('public.hr_drive_file(uuid)', 'e68006eb7cd097684038add3f945b3ee');
SELECT pg_temp.expect_body('public.hr_drive_log(uuid,text)', 'ac6f0bc5b6937b9f2d2f6767010a6f6b');
SELECT pg_temp.expect_body('public.hr_drive_folder_add(text,text)', '69f9511cc5ea00ee468396b3400d1950');
SELECT pg_temp.expect_body('public.hr_drive_folder_rename(uuid,text)', 'c137647e8ded877bfb33f55119c96075');
SELECT pg_temp.expect_body('public.hr_drive_folder_delete(uuid)', '0a58528e991b969199268d20585d8861');
SELECT pg_temp.expect_body('public.hr_drive_file_add(text,text,text,text,bigint)', '656ec46df963e398e8b279182875c095');
SELECT pg_temp.expect_body('public.hr_drive_file_delete(uuid)', '7125d38180ce7550e74b4ed2a4ab9abb');
SELECT pg_temp.expect_body('public.hr_drive_folder_move(uuid,text)', 'f0c407fa79d3c3e0590a4163dab91363');
SELECT pg_temp.expect_body('public.hr_drive_bin_reopen(uuid)', 'f5231a29d20f6d8271924a3df1ffefab');
SELECT pg_temp.expect_body('public.hr_drive_bin_restore(uuid)', '283fb1d648a542c1d2e2bfacc19d8608');
SELECT pg_temp.expect_body('public.hr_drive_bin_delete(uuid)', '9626e7ffdef60eeff6ccc1f35156f97d');
SELECT pg_temp.expect_body('public.hr_drive_bin_empty()', '5c9820061535bece09b6ea7246ecb1d2');

-- ── 1. The tables ───────────────────────────────────────────────────────────

-- A person's folder is a place: what HR makes there names the person.
ALTER TABLE public.hr_drive_folders ADD COLUMN parent_staff_id uuid REFERENCES public.hr_staff_costs(id);
ALTER TABLE public.hr_drive_files ADD COLUMN parent_staff_id uuid REFERENCES public.hr_staff_costs(id);
ALTER TABLE public.hr_drive_folders DROP CONSTRAINT hr_drive_folders_parent_kind_check;
ALTER TABLE public.hr_drive_folders ADD CONSTRAINT hr_drive_folders_parent_kind_check
  CHECK (parent_kind IN ('root', 'company', 'dept', 'folder', 'person'));
ALTER TABLE public.hr_drive_files DROP CONSTRAINT hr_drive_files_parent_kind_check;
ALTER TABLE public.hr_drive_files ADD CONSTRAINT hr_drive_files_parent_kind_check
  CHECK (parent_kind IN ('root', 'company', 'dept', 'folder', 'person'));
ALTER TABLE public.hr_drive_folders DROP CONSTRAINT hr_drive_folders_parent;
ALTER TABLE public.hr_drive_folders ADD CONSTRAINT hr_drive_folders_parent CHECK (
  (parent_kind IN ('root', 'company') AND parent_dept_id IS NULL AND parent_folder_id IS NULL AND parent_staff_id IS NULL)
  OR (parent_kind = 'dept' AND parent_dept_id IS NOT NULL AND parent_folder_id IS NULL AND parent_staff_id IS NULL)
  OR (parent_kind = 'folder' AND parent_folder_id IS NOT NULL AND parent_dept_id IS NULL AND parent_staff_id IS NULL)
  OR (parent_kind = 'person' AND parent_staff_id IS NOT NULL AND parent_dept_id IS NULL AND parent_folder_id IS NULL));
ALTER TABLE public.hr_drive_files DROP CONSTRAINT hr_drive_files_parent;
ALTER TABLE public.hr_drive_files ADD CONSTRAINT hr_drive_files_parent CHECK (
  (parent_kind IN ('root', 'company') AND parent_dept_id IS NULL AND parent_folder_id IS NULL AND parent_staff_id IS NULL)
  OR (parent_kind = 'dept' AND parent_dept_id IS NOT NULL AND parent_folder_id IS NULL AND parent_staff_id IS NULL)
  OR (parent_kind = 'folder' AND parent_folder_id IS NOT NULL AND parent_dept_id IS NULL AND parent_staff_id IS NULL)
  OR (parent_kind = 'person' AND parent_staff_id IS NOT NULL AND parent_dept_id IS NULL AND parent_folder_id IS NULL));
CREATE INDEX hr_drive_folders_in_person ON public.hr_drive_folders (parent_staff_id) WHERE parent_staff_id IS NOT NULL;
CREATE INDEX hr_drive_files_in_person ON public.hr_drive_files (parent_staff_id) WHERE parent_staff_id IS NOT NULL;

-- View only me: who set it, their rank then (kept for when they have left), their name for the badge.
ALTER TABLE public.hr_drive_folders
  ADD COLUMN private_by uuid REFERENCES public.users(id),
  ADD COLUMN private_by_name text,
  ADD COLUMN private_rank integer,
  ADD COLUMN private_at timestamptz;
ALTER TABLE public.hr_drive_files
  ADD COLUMN private_by uuid REFERENCES public.users(id),
  ADD COLUMN private_by_name text,
  ADD COLUMN private_rank integer,
  ADD COLUMN private_at timestamptz;

-- Shared with the person whose folder it is in: true, false (kept back), or null (as its folder).
ALTER TABLE public.hr_drive_folders
  ADD COLUMN member_view boolean,
  ADD COLUMN member_view_by uuid REFERENCES public.users(id),
  ADD COLUMN member_view_at timestamptz;
ALTER TABLE public.hr_drive_files
  ADD COLUMN member_view boolean,
  ADD COLUMN member_view_by uuid REFERENCES public.users(id),
  ADD COLUMN member_view_at timestamptz;

-- A letter kept from its person: still on the record, nowhere in their app.
ALTER TABLE public.hr_person_letters
  ADD COLUMN member_hidden_at timestamptz,
  ADD COLUMN member_hidden_by uuid REFERENCES public.users(id);

-- One live folder of a name in a place — a person's included; one View only me stands apart (whoever cannot see it may
-- name theirs the same: a name is never refused for something the caller is not shown).
DROP INDEX public.hr_drive_folders_name;
CREATE UNIQUE INDEX hr_drive_folders_name ON public.hr_drive_folders
  (parent_kind, coalesce(parent_folder_id, parent_dept_id, parent_staff_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)))
  WHERE deleted_at IS NULL AND private_by IS NULL;

-- Which of their own files a person has opened (the app's "New").
CREATE TABLE public.hr_drive_member_seen (
  file_id uuid NOT NULL REFERENCES public.hr_drive_files(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, staff_id)
);
ALTER TABLE public.hr_drive_member_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_drive_member_seen FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('hr_drive_member_seen', 'Data center files opened by their person', 'People', '{}', 'none',
  p_reason => 'Which person opened which of their own files; the file''s trail records each open');

-- ── 2. Helpers (closed to sessions — the functions below call them) ─────────

-- The rank on the ladder of a login's People record's title; null for a shared login, or a title off the ladder.
CREATE OR REPLACE FUNCTION public.hr_drive_rank_of(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT lv.rank
            FROM public.hr_staff_costs s
            JOIN public.titles t ON t.id = s.title_id
            JOIN public.title_levels lv ON lv.id = t.level_id
           WHERE s.user_id = p_user AND s.status = 'active'
           ORDER BY s.created_at, s.id
           LIMIT 1);
END
$$;

-- Whether the caller sees something View only me of p_by's (rank p_rank when it was set): p_by themself, the Principal
-- kind (the user, 2026-10-14: principal@ sees it), and whoever stands higher on the ladder than p_by stands now — or
-- stood then, once p_by has no record. Nothing locked is shown to a session with no login, nor to a login off the ladder.
CREATE OR REPLACE FUNCTION public.hr_drive_sees(p_by uuid, p_rank integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_mine  integer;
  v_owner integer;
BEGIN
  IF p_by IS NULL THEN
    RETURN true;
  END IF;
  IF v_me IS NULL THEN
    RETURN false;
  END IF;
  IF v_me = p_by THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active AND u.role = 'principal') THEN
    RETURN true;
  END IF;
  v_mine := public.hr_drive_rank_of(v_me);
  IF v_mine IS NULL THEN
    RETURN false;
  END IF;
  v_owner := coalesce(public.hr_drive_rank_of(p_by), p_rank);
  RETURN v_owner IS NOT NULL AND v_mine > v_owner;
END
$$;

-- The caller sees a folder: it and every folder above it.
CREATE OR REPLACE FUNCTION public.hr_drive_sees_folder(p_folder uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN coalesce((
    WITH RECURSIVE up AS (
      SELECT f.id, f.parent_folder_id, f.private_by, f.private_rank, 1 AS depth FROM public.hr_drive_folders f WHERE f.id = p_folder
      UNION ALL
      SELECT c.id, c.parent_folder_id, c.private_by, c.private_rank, up.depth + 1
        FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
    SELECT bool_and(public.hr_drive_sees(up.private_by, up.private_rank)) FROM up), false);
END
$$;

-- The caller sees a file: it and every folder it is in.
CREATE OR REPLACE FUNCTION public.hr_drive_sees_file(p_file uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN coalesce((
    SELECT public.hr_drive_sees(x.private_by, x.private_rank)
       AND (x.parent_kind <> 'folder' OR public.hr_drive_sees_folder(x.parent_folder_id))
      FROM public.hr_drive_files x WHERE x.id = p_file), false);
END
$$;

-- Something View only me at a folder or above it (the Audit Log's rule; a lock moved or copied along).
CREATE OR REPLACE FUNCTION public.hr_drive_locked_folder(p_folder uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN coalesce((
    WITH RECURSIVE up AS (
      SELECT f.id, f.parent_folder_id, f.private_by, 1 AS depth FROM public.hr_drive_folders f WHERE f.id = p_folder
      UNION ALL
      SELECT c.id, c.parent_folder_id, c.private_by, up.depth + 1
        FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
    SELECT bool_or(up.private_by IS NOT NULL) FROM up), false);
END
$$;

-- The person whose folder a place is in, or null.
CREATE OR REPLACE FUNCTION public.hr_drive_person_of(p_kind text, p_staff uuid, p_folder uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kind = 'person' THEN
    RETURN p_staff;
  END IF;
  IF p_kind IS DISTINCT FROM 'folder' OR p_folder IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
    WITH RECURSIVE up AS (
      SELECT f.id, f.parent_kind, f.parent_folder_id, f.parent_staff_id, 1 AS depth FROM public.hr_drive_folders f WHERE f.id = p_folder
      UNION ALL
      SELECT c.id, c.parent_kind, c.parent_folder_id, c.parent_staff_id, up.depth + 1
        FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
    SELECT up.parent_staff_id FROM up WHERE up.parent_kind = 'person' LIMIT 1);
END
$$;

CREATE OR REPLACE FUNCTION public.hr_drive_person_of_file(p_file uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT public.hr_drive_person_of(x.parent_kind, x.parent_staff_id, x.parent_folder_id)
            FROM public.hr_drive_files x WHERE x.id = p_file);
END
$$;

-- Whether a folder is shared with its person: the nearest share or keep-back at it or above it decides; something View
-- only me with neither stops the folder above from deciding (it is kept back); the person's folder itself shares nothing.
CREATE OR REPLACE FUNCTION public.hr_drive_member_sees_folder(p_folder uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    WITH RECURSIVE up AS (
      SELECT f.id, f.parent_folder_id, f.member_view, f.private_by, 1 AS depth FROM public.hr_drive_folders f WHERE f.id = p_folder
      UNION ALL
      SELECT c.id, c.parent_folder_id, c.member_view, c.private_by, up.depth + 1
        FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
    SELECT up.member_view, up.private_by FROM up ORDER BY up.depth
  LOOP
    IF r.member_view IS NOT NULL THEN
      RETURN r.member_view;
    END IF;
    IF r.private_by IS NOT NULL THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION public.hr_drive_member_sees_file(p_file uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x public.hr_drive_files%ROWTYPE;
BEGIN
  SELECT * INTO x FROM public.hr_drive_files WHERE id = p_file;
  IF x.id IS NULL THEN
    RETURN false;
  END IF;
  IF x.member_view IS NOT NULL THEN
    RETURN x.member_view;
  END IF;
  IF x.private_by IS NOT NULL OR x.parent_kind IS DISTINCT FROM 'folder' THEN
    RETURN false;
  END IF;
  RETURN public.hr_drive_member_sees_folder(x.parent_folder_id);
END
$$;

-- A place as the page writes it: root, company:hv, dept:<id>, person:<staff id>, folder:<id>.
CREATE OR REPLACE FUNCTION public.hr_drive_address(p_kind text, p_dept uuid, p_folder uuid, p_staff uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_kind WHEN 'root' THEN 'root' WHEN 'company' THEN 'company:hv' WHEN 'dept' THEN 'dept:' || p_dept
                     WHEN 'person' THEN 'person:' || p_staff ELSE 'folder:' || p_folder END
$$;

-- A place's name, for a trail's "Into …".
CREATE OR REPLACE FUNCTION public.hr_drive_label(p_kind text, p_dept uuid, p_folder uuid, p_staff uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN CASE p_kind
    WHEN 'root' THEN 'Data center'
    WHEN 'company' THEN 'HOUZS Venture'
    WHEN 'dept' THEN (SELECT regexp_replace(d.name, '\s+Department$', '', 'i') FROM public.departments d WHERE d.id = p_dept)
    WHEN 'person' THEN (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = p_staff)
    ELSE (SELECT f.name FROM public.hr_drive_folders f WHERE f.id = p_folder) END;
END
$$;

-- The lock something takes along when it leaves the folders above it for a new place: the strongest View only me among
-- the folders it leaves (from p_old_folder up, not above p_new_folder), when that is stronger than its own lock. A lock's
-- strength is its owner's rank (now, or when it was set) — the higher, the fewer see it. Null when nothing is left behind.
CREATE OR REPLACE FUNCTION public.hr_drive_lock_left(p_old_folder uuid, p_new_folder uuid, p_own_by uuid, p_own_rank integer,
  OUT lock_by uuid, OUT lock_rank integer, OUT lock_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_strength integer;
BEGIN
  IF p_old_folder IS NULL THEN
    RETURN;
  END IF;
  WITH RECURSIVE old_up AS (
    SELECT f.id, f.parent_folder_id, f.private_by, f.private_rank, f.private_by_name, 1 AS depth
      FROM public.hr_drive_folders f WHERE f.id = p_old_folder
    UNION ALL
    SELECT c.id, c.parent_folder_id, c.private_by, c.private_rank, c.private_by_name, old_up.depth + 1
      FROM public.hr_drive_folders c JOIN old_up ON c.id = old_up.parent_folder_id WHERE old_up.depth < 64
  ), new_up AS (
    SELECT f.id, f.parent_folder_id, 1 AS depth FROM public.hr_drive_folders f WHERE f.id = p_new_folder
    UNION ALL
    SELECT c.id, c.parent_folder_id, new_up.depth + 1
      FROM public.hr_drive_folders c JOIN new_up ON c.id = new_up.parent_folder_id WHERE new_up.depth < 64
  )
  SELECT o.private_by, o.private_rank, o.private_by_name, coalesce(public.hr_drive_rank_of(o.private_by), o.private_rank)
    INTO lock_by, lock_rank, lock_name, v_strength
    FROM old_up o
   WHERE o.private_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM new_up n WHERE n.id = o.id)
   ORDER BY coalesce(public.hr_drive_rank_of(o.private_by), o.private_rank) DESC NULLS LAST, o.depth
   LIMIT 1;
  IF lock_by IS NULL THEN
    RETURN;
  END IF;
  IF p_own_by IS NOT NULL
     AND coalesce(public.hr_drive_rank_of(p_own_by), p_own_rank, -1) >= coalesce(v_strength, -1) THEN
    lock_by := NULL;
    lock_rank := NULL;
    lock_name := NULL;
  END IF;
END
$$;

-- Where a folder or a file goes, from the page's address: root, company:hv, dept:<id>, person:<staff id> (an active
-- person's folder — what HR keeps for them), folder:<id> (one the caller is shown).
DROP FUNCTION public.hr_drive_place(text);
CREATE FUNCTION public.hr_drive_place(p_parent text, OUT kind text, OUT dept uuid, OUT folder uuid, OUT staff uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_parent = 'root' THEN
    kind := 'root';
  ELSIF p_parent = 'company:hv' THEN
    kind := 'company';
  ELSIF p_parent ~ '^(dept|folder|person):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    v_id := substr(p_parent, strpos(p_parent, ':') + 1)::uuid;
    IF p_parent LIKE 'dept:%' THEN
      IF NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = v_id) THEN
        RAISE EXCEPTION 'That department is not there any more.' USING ERRCODE = '22023';
      END IF;
      kind := 'dept';
      dept := v_id;
    ELSIF p_parent LIKE 'person:%' THEN
      IF NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.id = v_id AND s.status = 'active') THEN
        RAISE EXCEPTION 'That person is not on the payroll any more.' USING ERRCODE = '22023';
      END IF;
      kind := 'person';
      staff := v_id;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.hr_drive_folders f WHERE f.id = v_id AND f.deleted_at IS NULL)
         OR NOT public.hr_drive_sees_folder(v_id) THEN
        RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
      END IF;
      kind := 'folder';
      folder := v_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
  END IF;
END
$$;

-- Whether a name is taken in a place: by a live folder HR made there that the caller is shown, or by what is there by
-- itself — HOUZS Venture in the Data center, a department in HOUZS Venture, a person in their department.
DROP FUNCTION public.hr_drive_name_taken(text, uuid, uuid, text, uuid);
CREATE FUNCTION public.hr_drive_name_taken(p_kind text, p_dept uuid, p_folder uuid, p_staff uuid, p_name text, p_except uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := lower(trim(p_name));
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.hr_drive_folders f
                  WHERE f.deleted_at IS NULL AND f.parent_kind = p_kind
                    AND f.parent_dept_id IS NOT DISTINCT FROM p_dept AND f.parent_folder_id IS NOT DISTINCT FROM p_folder
                    AND f.parent_staff_id IS NOT DISTINCT FROM p_staff
                    AND lower(trim(f.name)) = v_name AND f.id IS DISTINCT FROM p_except
                    AND public.hr_drive_sees(f.private_by, f.private_rank))
      OR (p_kind = 'root' AND v_name = 'houzs venture')
      OR (p_kind = 'company' AND EXISTS (
            SELECT 1 FROM public.departments d
             WHERE EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.department_id = d.id AND s.status = 'active')
               AND lower(trim(regexp_replace(d.name, '\s+Department$', '', 'i'))) = v_name))
      OR (p_kind = 'dept' AND EXISTS (
            SELECT 1 FROM public.hr_staff_costs s
             WHERE s.department_id = p_dept AND s.status = 'active' AND lower(trim(s.employee_name)) = v_name));
END
$$;

-- Whether a row of the Data center's is View only me — itself or a folder above it (the Audit Log's rule).
CREATE OR REPLACE FUNCTION public.hr_drive_row_private(p_table text, p_row jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_uuid CONSTANT text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF p_table IN ('hr_drive_folders', 'hr_drive_files') THEN
    RETURN (p_row ->> 'private_by') IS NOT NULL
        OR ((p_row ->> 'parent_folder_id') ~ c_uuid AND public.hr_drive_locked_folder((p_row ->> 'parent_folder_id')::uuid));
  ELSIF p_table = 'hr_drive_bin' THEN
    IF (p_row ->> 'folder_id') ~ c_uuid THEN
      RETURN public.hr_drive_locked_folder((p_row ->> 'folder_id')::uuid);
    END IF;
    IF (p_row ->> 'file_id') ~ c_uuid THEN
      RETURN coalesce((SELECT x.private_by IS NOT NULL OR (x.parent_kind = 'folder' AND public.hr_drive_locked_folder(x.parent_folder_id))
                         FROM public.hr_drive_files x WHERE x.id = (p_row ->> 'file_id')::uuid), false);
    END IF;
  END IF;
  RETURN false;
END
$$;

-- The bucket's read for HR: everything but a Data center file the caller is not shown.
CREATE OR REPLACE FUNCTION public.hr_doc_readable_by_hr(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NOT EXISTS (SELECT 1 FROM public.hr_drive_files x WHERE x.file_path = p_name AND NOT public.hr_drive_sees_file(x.id));
END
$$;

-- ── 3. The page's read ──────────────────────────────────────────────────────

-- The folders and files HR made that the caller is shown, each with the address of the place it is in, its lock (View
-- only me) and — in a person's folder — its own share (`memberView`) and whether the person sees it (`memberSees`); a
-- file with its trail; the Bin the caller is shown; and whether the caller may lock anything (a ranked login of their own).
CREATE OR REPLACE FUNCTION public.hr_drive()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Documentation access is required' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH RECURSIVE tree AS (
      SELECT f.id, public.hr_drive_sees(f.private_by, f.private_rank) AS sees, f.parent_staff_id AS staff_id,
             CASE WHEN f.parent_kind = 'person' THEN coalesce(f.member_view, false) END AS member, 1 AS depth
        FROM public.hr_drive_folders f WHERE f.parent_kind <> 'folder'
      UNION ALL
      SELECT c.id, t.sees AND public.hr_drive_sees(c.private_by, c.private_rank), t.staff_id,
             CASE WHEN t.staff_id IS NOT NULL
                  THEN coalesce(c.member_view, CASE WHEN c.private_by IS NOT NULL THEN false ELSE t.member END) END,
             t.depth + 1
        FROM public.hr_drive_folders c JOIN tree t ON c.parent_folder_id = t.id WHERE t.depth < 64
    ), files AS (
      SELECT x.id,
             CASE WHEN x.parent_kind = 'folder' THEN coalesce(t.sees, false) ELSE true END
               AND public.hr_drive_sees(x.private_by, x.private_rank) AS sees,
             CASE WHEN coalesce(t.staff_id, x.parent_staff_id) IS NOT NULL
                  THEN coalesce(x.member_view, CASE WHEN x.private_by IS NOT NULL THEN false ELSE coalesce(t.member, false) END) END AS member
        FROM public.hr_drive_files x LEFT JOIN tree t ON t.id = x.parent_folder_id
    )
    SELECT jsonb_build_object(
      'me', jsonb_build_object('canLock', public.hr_drive_rank_of(v_me) IS NOT NULL),
      'folders', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'id', f.id, 'name', f.name,
                    'parent', public.hr_drive_address(f.parent_kind, f.parent_dept_id, f.parent_folder_id, f.parent_staff_id),
                    'createdAt', f.created_at, 'createdBy', f.created_by_name,
                    'lock', CASE WHEN f.private_by IS NOT NULL THEN jsonb_build_object(
                              'by', coalesce(f.private_by_name, 'HR'), 'mine', f.private_by = v_me, 'at', f.private_at) END,
                    'memberView', f.member_view, 'memberSees', t.member
                  ) ORDER BY lower(f.name), f.created_at), '[]'::jsonb)
                  FROM public.hr_drive_folders f JOIN tree t ON t.id = f.id
                 WHERE f.deleted_at IS NULL AND t.sees),
      'files', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'id', x.id, 'ref', x.ref, 'fileName', x.file_name, 'contentType', x.content_type, 'size', x.file_size,
                  'parent', public.hr_drive_address(x.parent_kind, x.parent_dept_id, x.parent_folder_id, x.parent_staff_id),
                  'uploadedAt', x.uploaded_at, 'uploadedBy', x.uploaded_by_name, 'deletedAt', x.deleted_at,
                  'lock', CASE WHEN x.private_by IS NOT NULL THEN jsonb_build_object(
                            'by', coalesce(x.private_by_name, 'HR'), 'mine', x.private_by = v_me, 'at', x.private_at) END,
                  'memberView', x.member_view, 'memberSees', fx.member,
                  'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('what', e.what, 'at', e.created_at, 'who', e.actor_name, 'note', e.note)
                               ORDER BY e.created_at, e.id), '[]'::jsonb)
                               FROM public.hr_drive_file_events e WHERE e.file_id = x.id)
                ) ORDER BY lower(x.file_name), x.uploaded_at), '[]'::jsonb)
                FROM public.hr_drive_files x JOIN files fx ON fx.id = x.id
               WHERE fx.sees AND NOT EXISTS (SELECT 1 FROM public.hr_drive_bin bx WHERE bx.file_id = x.id)),
      'bin', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'kind', b.kind, 'name', b.name,
                'at', CASE WHEN bf.id IS NOT NULL
                           THEN public.hr_drive_address(bf.parent_kind, bf.parent_dept_id, bf.parent_folder_id, bf.parent_staff_id)
                           ELSE public.hr_drive_address(bd.parent_kind, bd.parent_dept_id, bd.parent_folder_id, bd.parent_staff_id) END,
                'folderId', b.folder_id, 'fileId', b.file_id, 'ref', bf.ref, 'contentType', bf.content_type, 'size', bf.file_size,
                'deletedAt', b.deleted_at, 'deletedBy', b.deleted_by_name,
                'expiresAt', b.deleted_at + public.hr_drive_bin_keeps()) ORDER BY b.deleted_at DESC, b.id), '[]'::jsonb)
              FROM public.hr_drive_bin b
              LEFT JOIN public.hr_drive_files bf ON bf.id = b.file_id
              LEFT JOIN files bfx ON bfx.id = b.file_id
              LEFT JOIN public.hr_drive_folders bd ON bd.id = b.folder_id
              LEFT JOIN tree bt ON bt.id = b.folder_id
             WHERE b.deleted_at > now() - public.hr_drive_bin_keeps()
               AND coalesce(bfx.sees, bt.sees, false))
    )
  );
END
$$;

-- A Data center file's object, for a signed link made at the click — never a deleted one's, one in the Bin, or one the
-- caller is not shown.
CREATE OR REPLACE FUNCTION public.hr_drive_file(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.hr_drive_files%ROWTYPE;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Documentation access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.hr_drive_files WHERE id = p_id;
  IF v.id IS NULL OR NOT public.hr_drive_sees_file(v.id) THEN
    RAISE EXCEPTION 'That file is no longer here' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = v.id) THEN
    RAISE EXCEPTION 'It is in the Bin — restore it to open it.' USING ERRCODE = '22023';
  END IF;
  IF v.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Its file was deleted with it.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('path', v.file_path, 'fileName', v.file_name, 'contentType', v.content_type);
END
$$;

-- HR viewed or downloaded one: a line on its trail (of a file the caller is shown).
CREATE OR REPLACE FUNCTION public.hr_drive_log(p_id uuid, p_what text)
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
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name)
  SELECT f.id, p_what, auth.uid(), public.hr_doc_actor_name() FROM public.hr_drive_files f
   WHERE f.id = p_id AND public.hr_drive_sees_file(f.id);
END
$$;

-- ── 4. Folders and files: made, renamed, binned — a person's folder now a place ──

CREATE OR REPLACE FUNCTION public.hr_drive_folder_add(p_parent text, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_place record;
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create']) THEN
    RAISE EXCEPTION 'Making a folder needs Documentation · Create' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Name the folder.' USING ERRCODE = '22023';
  END IF;
  IF v_name ~ '[/\\]' THEN
    RAISE EXCEPTION 'A folder''s name cannot hold a slash.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_place FROM public.hr_drive_place(p_parent);
  IF public.hr_drive_name_taken(v_place.kind, v_place.dept, v_place.folder, v_place.staff, v_name, NULL) THEN
    RAISE EXCEPTION '% is here already.', v_name USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hr_drive_folders (name, parent_kind, parent_dept_id, parent_folder_id, parent_staff_id, created_by, created_by_name)
  VALUES (v_name, v_place.kind, v_place.dept, v_place.folder, v_place.staff, auth.uid(), public.hr_doc_actor_name())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.hr_drive_folder_rename(p_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.hr_drive_folders%ROWTYPE;
  v_name text := trim(coalesce(p_name, ''));
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Renaming a folder needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.hr_drive_folders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR NOT public.hr_drive_sees_folder(p_id) THEN
    RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Name the folder.' USING ERRCODE = '22023';
  END IF;
  IF v_name ~ '[/\\]' THEN
    RAISE EXCEPTION 'A folder''s name cannot hold a slash.' USING ERRCODE = '22023';
  END IF;
  IF public.hr_drive_name_taken(v.parent_kind, v.parent_dept_id, v.parent_folder_id, v.parent_staff_id, v_name, v.id) THEN
    RAISE EXCEPTION '% is here already.', v_name USING ERRCODE = '22023';
  END IF;
  UPDATE public.hr_drive_folders SET name = v_name WHERE id = p_id;
END
$$;

-- A folder's ⋮ › Move to Bin: only an empty one — nothing live in it, what is in the Bin not counting.
CREATE OR REPLACE FUNCTION public.hr_drive_folder_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Deleting a folder needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.hr_drive_folders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.hr_drive_sees_folder(p_id) THEN
    RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_drive_folders f WHERE f.parent_folder_id = p_id AND f.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.hr_drive_files x WHERE x.parent_folder_id = p_id AND x.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = x.id)) THEN
    RAISE EXCEPTION 'Empty it first.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hr_drive_folders SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_id;
  INSERT INTO public.hr_drive_bin (kind, folder_id, name, deleted_by, deleted_by_name)
  SELECT 'folder', f.id, f.name, auth.uid(), public.hr_doc_actor_name() FROM public.hr_drive_folders f WHERE f.id = p_id;
END
$$;

CREATE OR REPLACE FUNCTION public.hr_drive_file_add(p_parent text, p_path text, p_file_name text, p_content_type text, p_size bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_place record;
  v_id uuid;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create']) THEN
    RAISE EXCEPTION 'Uploading a file needs Documentation · Create' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_place FROM public.hr_drive_place(p_parent);
  IF NOT public.hr_doc_file_present(p_path, 'drive') THEN
    RAISE EXCEPTION 'The file did not arrive. Please upload it again.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_drive_files x WHERE x.file_path = p_path) THEN
    RAISE EXCEPTION 'That file is filed already.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hr_drive_files (parent_kind, parent_dept_id, parent_folder_id, parent_staff_id, file_path, file_name, content_type,
      file_size, uploaded_by, uploaded_by_name)
  VALUES (v_place.kind, v_place.dept, v_place.folder, v_place.staff, p_path, left(coalesce(nullif(trim(p_file_name), ''), 'file'), 200),
      p_content_type, p_size, auth.uid(), public.hr_doc_actor_name())
  RETURNING id INTO v_id;
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
  VALUES (v_id, 'Uploaded', auth.uid(), public.hr_doc_actor_name(),
          'Into ' || coalesce(public.hr_drive_label(v_place.kind, v_place.dept, v_place.folder, v_place.staff), 'the Data center'));
  RETURN v_id;
END
$$;

-- A file's ⋮ › Move to Bin: listed in the Bin, "Moved to Bin" on its trail; not deleted yet, so its object stays.
CREATE OR REPLACE FUNCTION public.hr_drive_file_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Deleting a file needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.hr_drive_files WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = p_id) OR NOT public.hr_drive_sees_file(p_id) THEN
    RAISE EXCEPTION 'That file is already deleted.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hr_drive_bin (kind, file_id, name, deleted_by, deleted_by_name)
  SELECT 'file', f.id, f.file_name, auth.uid(), public.hr_doc_actor_name() FROM public.hr_drive_files f WHERE f.id = p_id;
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name)
  VALUES (p_id, 'Moved to Bin', auth.uid(), public.hr_doc_actor_name());
END
$$;

-- ── 5. Move to… ─────────────────────────────────────────────────────────────

-- A folder's ⋮ › Move to… (Edit): it and everything in it. Never into itself or a folder inside it; a name the place has
-- stops it. What View only me it leaves behind goes with it; out of one person's folder — into another's, or out — it and
-- everything in it are shared with nobody.
CREATE OR REPLACE FUNCTION public.hr_drive_folder_move(p_id uuid, p_parent text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.hr_drive_folders%ROWTYPE;
  v_place record;
  v_lock record;
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Moving a folder needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM public.hr_drive_folders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.hr_drive_sees_folder(p_id) THEN
    RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_place FROM public.hr_drive_place(p_parent);
  IF v_place.kind = 'folder' AND EXISTS (
       WITH RECURSIVE up AS (
         SELECT a.id, a.parent_folder_id, 1 AS depth FROM public.hr_drive_folders a WHERE a.id = v_place.folder
         UNION ALL
         SELECT c.id, c.parent_folder_id, up.depth + 1 FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
       SELECT 1 FROM up WHERE up.id = p_id) THEN
    RAISE EXCEPTION 'A folder cannot go inside itself.' USING ERRCODE = '22023';
  END IF;
  IF (f.parent_kind, f.parent_dept_id, f.parent_folder_id, f.parent_staff_id)
     IS NOT DISTINCT FROM (v_place.kind, v_place.dept, v_place.folder, v_place.staff) THEN
    RETURN;
  END IF;
  IF public.hr_drive_name_taken(v_place.kind, v_place.dept, v_place.folder, v_place.staff, f.name, f.id) THEN
    RAISE EXCEPTION '% is there already — rename one first.', f.name USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_lock FROM public.hr_drive_lock_left(f.parent_folder_id, v_place.folder, f.private_by, f.private_rank);
  IF public.hr_drive_person_of(f.parent_kind, f.parent_staff_id, f.parent_folder_id)
     IS DISTINCT FROM public.hr_drive_person_of(v_place.kind, v_place.staff, v_place.folder) THEN
    WITH RECURSIVE down AS (
      SELECT p_id AS id, 1 AS depth
      UNION ALL
      SELECT c.id, down.depth + 1 FROM public.hr_drive_folders c JOIN down ON c.parent_folder_id = down.id WHERE down.depth < 64
    ), cleared AS (
      UPDATE public.hr_drive_folders SET member_view = NULL, member_view_by = NULL, member_view_at = NULL
       WHERE id IN (SELECT id FROM down) AND member_view IS NOT NULL
      RETURNING id
    )
    UPDATE public.hr_drive_files SET member_view = NULL, member_view_by = NULL, member_view_at = NULL
     WHERE parent_folder_id IN (SELECT id FROM down) AND member_view IS NOT NULL;
  END IF;
  UPDATE public.hr_drive_folders
     SET parent_kind = v_place.kind, parent_dept_id = v_place.dept, parent_folder_id = v_place.folder, parent_staff_id = v_place.staff,
         private_by = coalesce(v_lock.lock_by, private_by),
         private_rank = CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_rank ELSE private_rank END,
         private_by_name = CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_name ELSE private_by_name END,
         private_at = CASE WHEN v_lock.lock_by IS NOT NULL THEN now() ELSE private_at END
   WHERE id = p_id;
END
$$;

-- A file's ⋮ › Move to… (Edit): the same rules as a folder's; "Moved" on its trail.
CREATE OR REPLACE FUNCTION public.hr_drive_file_move(p_id uuid, p_parent text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x public.hr_drive_files%ROWTYPE;
  v_place record;
  v_lock record;
  v_left_person boolean;
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Moving a file needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM public.hr_drive_files WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.hr_drive_sees_file(p_id) THEN
    RAISE EXCEPTION 'That file is not there any more.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = p_id) THEN
    RAISE EXCEPTION 'It is in the Bin — restore it first.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_place FROM public.hr_drive_place(p_parent);
  IF (x.parent_kind, x.parent_dept_id, x.parent_folder_id, x.parent_staff_id)
     IS NOT DISTINCT FROM (v_place.kind, v_place.dept, v_place.folder, v_place.staff) THEN
    RETURN;
  END IF;
  SELECT * INTO v_lock FROM public.hr_drive_lock_left(x.parent_folder_id, v_place.folder, x.private_by, x.private_rank);
  v_left_person := public.hr_drive_person_of(x.parent_kind, x.parent_staff_id, x.parent_folder_id)
                   IS DISTINCT FROM public.hr_drive_person_of(v_place.kind, v_place.staff, v_place.folder);
  UPDATE public.hr_drive_files
     SET parent_kind = v_place.kind, parent_dept_id = v_place.dept, parent_folder_id = v_place.folder, parent_staff_id = v_place.staff,
         private_by = coalesce(v_lock.lock_by, private_by),
         private_rank = CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_rank ELSE private_rank END,
         private_by_name = CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_name ELSE private_by_name END,
         private_at = CASE WHEN v_lock.lock_by IS NOT NULL THEN now() ELSE private_at END,
         member_view = CASE WHEN v_left_person THEN NULL ELSE member_view END,
         member_view_by = CASE WHEN v_left_person THEN NULL ELSE member_view_by END,
         member_view_at = CASE WHEN v_left_person THEN NULL ELSE member_view_at END
   WHERE id = p_id;
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
  VALUES (p_id, 'Moved', auth.uid(), public.hr_doc_actor_name(),
          'Into ' || coalesce(public.hr_drive_label(v_place.kind, v_place.dept, v_place.folder, v_place.staff), 'the Data center'));
END
$$;

-- ── 6. Copy to… / Duplicate ─────────────────────────────────────────────────

-- What a copy takes (Create): a file, or every file in a folder and the folders in it the caller is shown — live, none
-- in the Bin — each with its object, which the Server Action copies in the bucket before the copy is recorded.
CREATE OR REPLACE FUNCTION public.hr_drive_copy_plan(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create']) OR NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Copying needs Documentation · View and Create' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'file' THEN
    SELECT jsonb_build_array(jsonb_build_object('id', x.id, 'path', x.file_path, 'fileName', x.file_name)) INTO v
      FROM public.hr_drive_files x
     WHERE x.id = p_id AND x.deleted_at IS NULL AND public.hr_drive_sees_file(x.id)
       AND NOT EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = x.id);
    IF v IS NULL THEN
      RAISE EXCEPTION 'That file is not there any more.' USING ERRCODE = '22023';
    END IF;
    RETURN v;
  ELSIF p_kind = 'folder' THEN
    IF NOT EXISTS (SELECT 1 FROM public.hr_drive_folders f WHERE f.id = p_id AND f.deleted_at IS NULL) OR NOT public.hr_drive_sees_folder(p_id) THEN
      RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
    END IF;
    WITH RECURSIVE down AS (
      SELECT p_id AS id, 1 AS depth
      UNION ALL
      SELECT c.id, down.depth + 1 FROM public.hr_drive_folders c JOIN down ON c.parent_folder_id = down.id
       WHERE c.deleted_at IS NULL AND public.hr_drive_sees(c.private_by, c.private_rank) AND down.depth < 64
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'path', x.file_path, 'fileName', x.file_name) ORDER BY x.uploaded_at, x.id), '[]'::jsonb)
      INTO v
      FROM public.hr_drive_files x
     WHERE x.parent_folder_id IN (SELECT id FROM down) AND x.deleted_at IS NULL
       AND public.hr_drive_sees(x.private_by, x.private_rank)
       AND NOT EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = x.id);
    IF jsonb_array_length(v) > 300 THEN
      RAISE EXCEPTION 'That is more than 300 files to copy at once — copy the folders inside it one by one.' USING ERRCODE = '22023';
    END IF;
    RETURN v;
  END IF;
  RAISE EXCEPTION 'Only a file or a folder is copied.' USING ERRCODE = '22023';
END
$$;

-- A file's copy (Create): a new file in p_parent of the object the Server Action copied to p_path, named p_name (its own
-- by default). It takes its lock along — its own and the strongest it leaves behind; it is shared with nobody.
CREATE OR REPLACE FUNCTION public.hr_drive_file_copy(p_id uuid, p_parent text, p_path text, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x public.hr_drive_files%ROWTYPE;
  v_place record;
  v_lock record;
  v_id uuid;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create']) THEN
    RAISE EXCEPTION 'Copying a file needs Documentation · Create' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM public.hr_drive_files WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.hr_drive_sees_file(p_id) OR EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = p_id) THEN
    RAISE EXCEPTION 'That file is not there any more.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_place FROM public.hr_drive_place(p_parent);
  IF NOT public.hr_doc_file_present(p_path, 'drive') THEN
    RAISE EXCEPTION 'The copy did not arrive. Please try again.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_drive_files y WHERE y.file_path = p_path) THEN
    RAISE EXCEPTION 'That file is filed already.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_lock FROM public.hr_drive_lock_left(x.parent_folder_id, v_place.folder, x.private_by, x.private_rank);
  INSERT INTO public.hr_drive_files (parent_kind, parent_dept_id, parent_folder_id, parent_staff_id, file_path, file_name, content_type,
      file_size, uploaded_by, uploaded_by_name, private_by, private_rank, private_by_name, private_at)
  VALUES (v_place.kind, v_place.dept, v_place.folder, v_place.staff, p_path,
      left(coalesce(nullif(trim(p_name), ''), x.file_name), 200), x.content_type, x.file_size, auth.uid(), public.hr_doc_actor_name(),
      coalesce(v_lock.lock_by, x.private_by),
      CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_rank ELSE x.private_rank END,
      CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_name ELSE x.private_by_name END,
      CASE WHEN coalesce(v_lock.lock_by, x.private_by) IS NOT NULL THEN now() END)
  RETURNING id INTO v_id;
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
  VALUES (v_id, 'Copied', auth.uid(), public.hr_doc_actor_name(),
          'From ' || x.ref || ' · into ' || coalesce(public.hr_drive_label(v_place.kind, v_place.dept, v_place.folder, v_place.staff), 'the Data center'));
  RETURN v_id;
END
$$;

-- A folder's copy (Create): it and every folder and file in it the caller is shown, in p_parent — named p_name, or "Copy
-- of …" (then "(2)", "(3)" …) when none is given. A file is copied only when p_files names the object copied for it
-- ({file id: new path}); the others are counted. Never into itself or a folder inside it. Locks go along (the copied
-- folder's own and the strongest it leaves behind; those inside as they were); nothing is shared with anybody.
CREATE OR REPLACE FUNCTION public.hr_drive_folder_copy(p_id uuid, p_parent text, p_name text, p_files jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.hr_drive_folders%ROWTYPE;
  v_place record;
  v_lock record;
  v_name text;
  v_n integer := 1;
  v_root uuid;
  v_map jsonb := '{}'::jsonb;
  v_new uuid;
  r record;
  v_folders integer := 0;
  v_files integer := 0;
  v_skipped integer := 0;
  v_path text;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create']) THEN
    RAISE EXCEPTION 'Copying a folder needs Documentation · Create' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM public.hr_drive_folders WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.hr_drive_sees_folder(p_id) THEN
    RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_place FROM public.hr_drive_place(p_parent);
  IF v_place.kind = 'folder' AND EXISTS (
       WITH RECURSIVE up AS (
         SELECT a.id, a.parent_folder_id, 1 AS depth FROM public.hr_drive_folders a WHERE a.id = v_place.folder
         UNION ALL
         SELECT c.id, c.parent_folder_id, up.depth + 1 FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
       SELECT 1 FROM up WHERE up.id = p_id) THEN
    RAISE EXCEPTION 'A folder cannot be copied inside itself.' USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(coalesce(p_name, '')), '') IS NULL THEN
    v_name := left('Copy of ' || f.name, 80);
    WHILE public.hr_drive_name_taken(v_place.kind, v_place.dept, v_place.folder, v_place.staff, v_name, NULL) LOOP
      v_n := v_n + 1;
      v_name := left('Copy of ' || f.name, 80 - length(' (' || v_n || ')')) || ' (' || v_n || ')';
    END LOOP;
  ELSE
    v_name := trim(p_name);
    IF length(v_name) > 80 THEN
      RAISE EXCEPTION 'Keep the name under 80 characters.' USING ERRCODE = '22023';
    END IF;
    IF v_name ~ '[/\\]' THEN
      RAISE EXCEPTION 'A folder''s name cannot hold a slash.' USING ERRCODE = '22023';
    END IF;
    IF public.hr_drive_name_taken(v_place.kind, v_place.dept, v_place.folder, v_place.staff, v_name, NULL) THEN
      RAISE EXCEPTION '% is there already — rename one first.', v_name USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT * INTO v_lock FROM public.hr_drive_lock_left(f.parent_folder_id, v_place.folder, f.private_by, f.private_rank);
  INSERT INTO public.hr_drive_folders (name, parent_kind, parent_dept_id, parent_folder_id, parent_staff_id, created_by, created_by_name,
      private_by, private_rank, private_by_name, private_at)
  VALUES (v_name, v_place.kind, v_place.dept, v_place.folder, v_place.staff, auth.uid(), public.hr_doc_actor_name(),
      coalesce(v_lock.lock_by, f.private_by),
      CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_rank ELSE f.private_rank END,
      CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_name ELSE f.private_by_name END,
      CASE WHEN coalesce(v_lock.lock_by, f.private_by) IS NOT NULL THEN now() END)
  RETURNING id INTO v_root;
  v_map := jsonb_build_object(p_id::text, v_root);
  v_folders := 1;

  -- The folders in it, top down, each under the copy of the folder it was in.
  FOR r IN
    WITH RECURSIVE down AS (
      SELECT c.id, c.parent_folder_id, c.name, c.private_by, c.private_rank, c.private_by_name, c.private_at, 1 AS depth
        FROM public.hr_drive_folders c
       WHERE c.parent_folder_id = p_id AND c.deleted_at IS NULL AND public.hr_drive_sees(c.private_by, c.private_rank)
      UNION ALL
      SELECT c.id, c.parent_folder_id, c.name, c.private_by, c.private_rank, c.private_by_name, c.private_at, down.depth + 1
        FROM public.hr_drive_folders c JOIN down ON c.parent_folder_id = down.id
       WHERE c.deleted_at IS NULL AND public.hr_drive_sees(c.private_by, c.private_rank) AND down.depth < 64
    )
    SELECT * FROM down ORDER BY depth, lower(name), id
  LOOP
    INSERT INTO public.hr_drive_folders (name, parent_kind, parent_folder_id, created_by, created_by_name,
        private_by, private_rank, private_by_name, private_at)
    VALUES (r.name, 'folder', (v_map ->> r.parent_folder_id::text)::uuid, auth.uid(), public.hr_doc_actor_name(),
        r.private_by, r.private_rank, r.private_by_name, r.private_at)
    RETURNING id INTO v_new;
    v_map := v_map || jsonb_build_object(r.id::text, v_new);
    v_folders := v_folders + 1;
  END LOOP;

  -- Their files, each where its object was copied to.
  FOR r IN
    SELECT x.* FROM public.hr_drive_files x
     WHERE v_map ? x.parent_folder_id::text AND x.deleted_at IS NULL
       AND public.hr_drive_sees(x.private_by, x.private_rank)
       AND NOT EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = x.id)
     ORDER BY x.uploaded_at, x.id
  LOOP
    v_path := coalesce(p_files, '{}'::jsonb) ->> r.id::text;
    IF v_path IS NULL OR NOT public.hr_doc_file_present(v_path, 'drive')
       OR EXISTS (SELECT 1 FROM public.hr_drive_files y WHERE y.file_path = v_path) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.hr_drive_files (parent_kind, parent_folder_id, file_path, file_name, content_type, file_size,
        uploaded_by, uploaded_by_name, private_by, private_rank, private_by_name, private_at)
    VALUES ('folder', (v_map ->> r.parent_folder_id::text)::uuid, v_path, r.file_name, r.content_type, r.file_size,
        auth.uid(), public.hr_doc_actor_name(), r.private_by, r.private_rank, r.private_by_name, r.private_at)
    RETURNING id INTO v_new;
    INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
    VALUES (v_new, 'Copied', auth.uid(), public.hr_doc_actor_name(), 'From ' || r.ref || ' · with ' || f.name);
    v_files := v_files + 1;
  END LOOP;
  RETURN jsonb_build_object('id', v_root, 'name', v_name, 'folders', v_folders, 'files', v_files, 'skipped', v_skipped);
END
$$;

-- ── 7. View only me, and shared with the person ─────────────────────────────

-- A file's or a folder's ⋮ › View only me (Edit): on — for the caller and whoever stands above them (a login of their own
-- with a title on the ladder) — or off. On keeps it from its person unless shared with them again.
CREATE OR REPLACE FUNCTION public.hr_drive_private(p_kind text, p_id uuid, p_on boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank integer;
  v_name text;
  v_by uuid;
  v_shared boolean := false;
  f public.hr_drive_folders%ROWTYPE;
  x public.hr_drive_files%ROWTYPE;
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'View only me needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'folder' THEN
    SELECT * INTO f FROM public.hr_drive_folders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND OR NOT public.hr_drive_sees_folder(p_id) THEN
      RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
    END IF;
    v_name := f.name;
    v_by := f.private_by;
  ELSIF p_kind = 'file' THEN
    SELECT * INTO x FROM public.hr_drive_files WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND OR NOT public.hr_drive_sees_file(p_id) THEN
      RAISE EXCEPTION 'That file is not there any more.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = p_id) THEN
      RAISE EXCEPTION 'It is in the Bin — restore it first.' USING ERRCODE = '22023';
    END IF;
    v_name := x.file_name;
    v_by := x.private_by;
  ELSE
    RAISE EXCEPTION 'Only a file or a folder is View only me.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_on, false) THEN
    v_rank := public.hr_drive_rank_of(auth.uid());
    IF v_rank IS NULL THEN
      RAISE EXCEPTION 'View only me needs a login of your own, with a title on the ladder.' USING ERRCODE = '22023';
    END IF;
    IF p_kind = 'folder' THEN
      v_shared := coalesce(public.hr_drive_member_sees_folder(p_id), false);
      UPDATE public.hr_drive_folders
         SET private_by = auth.uid(), private_rank = v_rank, private_by_name = public.hr_doc_actor_name(), private_at = now(),
             member_view = CASE WHEN member_view THEN NULL ELSE member_view END
       WHERE id = p_id;
    ELSE
      v_shared := coalesce(public.hr_drive_member_sees_file(p_id), false);
      UPDATE public.hr_drive_files
         SET private_by = auth.uid(), private_rank = v_rank, private_by_name = public.hr_doc_actor_name(), private_at = now(),
             member_view = CASE WHEN member_view THEN NULL ELSE member_view END
       WHERE id = p_id;
      INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
      VALUES (p_id, 'View only me', auth.uid(), public.hr_doc_actor_name(), 'Seen only by ' || public.hr_doc_actor_name() || ' and above');
    END IF;
    RETURN jsonb_build_object('name', v_name, 'on', true, 'wasShared', v_shared);
  END IF;

  IF v_by IS NULL THEN
    RETURN jsonb_build_object('name', v_name, 'on', false, 'wasShared', false);
  END IF;
  IF p_kind = 'folder' THEN
    IF public.hr_drive_name_taken(f.parent_kind, f.parent_dept_id, f.parent_folder_id, f.parent_staff_id, f.name, f.id) THEN
      RAISE EXCEPTION '% is there already — rename one first.', f.name USING ERRCODE = '22023';
    END IF;
    UPDATE public.hr_drive_folders SET private_by = NULL, private_rank = NULL, private_by_name = NULL, private_at = NULL WHERE id = p_id;
  ELSE
    UPDATE public.hr_drive_files SET private_by = NULL, private_rank = NULL, private_by_name = NULL, private_at = NULL WHERE id = p_id;
    INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name)
    VALUES (p_id, 'View only me off', auth.uid(), public.hr_doc_actor_name());
  END IF;
  RETURN jsonb_build_object('name', v_name, 'on', false, 'wasShared', false);
END
$$;

-- A file's or a folder's ⋮ › "<person> can view" (Edit): shared with the person whose folder it is in, or kept back.
-- Answers the person and whether they now see it.
CREATE OR REPLACE FUNCTION public.hr_drive_member_view(p_kind text, p_id uuid, p_on boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person uuid;
  v_name text;
  v_who text;
  v_sees boolean;
  f public.hr_drive_folders%ROWTYPE;
  x public.hr_drive_files%ROWTYPE;
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Sharing needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  IF p_on IS NULL THEN
    RAISE EXCEPTION 'Share it or keep it back.' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'folder' THEN
    SELECT * INTO f FROM public.hr_drive_folders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND OR NOT public.hr_drive_sees_folder(p_id) THEN
      RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
    END IF;
    v_person := public.hr_drive_person_of(f.parent_kind, f.parent_staff_id, f.parent_folder_id);
    v_name := f.name;
  ELSIF p_kind = 'file' THEN
    SELECT * INTO x FROM public.hr_drive_files WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND OR NOT public.hr_drive_sees_file(p_id) THEN
      RAISE EXCEPTION 'That file is not there any more.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = p_id) THEN
      RAISE EXCEPTION 'It is in the Bin — restore it first.' USING ERRCODE = '22023';
    END IF;
    v_person := public.hr_drive_person_of(x.parent_kind, x.parent_staff_id, x.parent_folder_id);
    v_name := x.file_name;
  ELSE
    RAISE EXCEPTION 'Only a file or a folder is shared.' USING ERRCODE = '22023';
  END IF;
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'Only what is in a person''s folder can be shared with them.' USING ERRCODE = '22023';
  END IF;
  SELECT s.employee_name INTO v_who FROM public.hr_staff_costs s WHERE s.id = v_person;
  IF p_kind = 'folder' THEN
    UPDATE public.hr_drive_folders SET member_view = p_on, member_view_by = auth.uid(), member_view_at = now() WHERE id = p_id;
    v_sees := public.hr_drive_member_sees_folder(p_id);
  ELSE
    UPDATE public.hr_drive_files SET member_view = p_on, member_view_by = auth.uid(), member_view_at = now() WHERE id = p_id;
    v_sees := public.hr_drive_member_sees_file(p_id);
    INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
    VALUES (p_id, CASE WHEN p_on THEN 'Shared with ' ELSE 'Kept from ' END || coalesce(v_who, 'its person'),
            auth.uid(), public.hr_doc_actor_name(), NULL);
  END IF;
  RETURN jsonb_build_object('name', v_name, 'person', v_who, 'sees', v_sees);
END
$$;

-- A letter's ⋮ › "<person> can view" (Edit). Off: still on the record — counted, compulsory met — but nowhere in their
-- app: they come off the memo it travelled as (every reader of memos asks its recipients), their receipt kept. On: put
-- back on the memo, its notice read again when they had read it.
CREATE OR REPLACE FUNCTION public.hr_letter_member_view(p_letter uuid, p_on boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l public.hr_person_letters%ROWTYPE;
  v_who text;
  v_user uuid;
  v_version integer;
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Sharing a letter needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  IF p_on IS NULL THEN
    RAISE EXCEPTION 'Share it or keep it back.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO l FROM public.hr_person_letters WHERE id = p_letter FOR UPDATE;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'That letter is not on file any more.' USING ERRCODE = '22023';
  END IF;
  IF l.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'That letter was withdrawn.' USING ERRCODE = '22023';
  END IF;
  SELECT s.employee_name, s.user_id INTO v_who, v_user FROM public.hr_staff_costs s WHERE s.id = l.staff_id;

  IF NOT p_on THEN
    IF l.member_hidden_at IS NULL THEN
      UPDATE public.hr_person_letters SET member_hidden_at = now(), member_hidden_by = auth.uid() WHERE id = p_letter;
      IF l.memo_id IS NOT NULL THEN
        DELETE FROM public.member_memo_recipients WHERE memo_id = l.memo_id AND staff_id = l.staff_id;
      END IF;
      INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name, note)
      VALUES (p_letter, 'Kept from ' || coalesce(v_who, 'its person'), auth.uid(), public.hr_doc_actor_name(),
              'Still on the record — no longer in their app');
    END IF;
  ELSIF l.member_hidden_at IS NOT NULL THEN
    UPDATE public.hr_person_letters SET member_hidden_at = NULL, member_hidden_by = NULL WHERE id = p_letter;
    SELECT m.version INTO v_version FROM public.member_memos m WHERE m.id = l.memo_id AND m.withdrawn_at IS NULL;
    IF v_version IS NOT NULL THEN
      INSERT INTO public.member_memo_recipients (memo_id, staff_id) VALUES (l.memo_id, l.staff_id) ON CONFLICT DO NOTHING;
      -- Read before it was kept back: its notice is not news.
      IF v_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.member_memo_receipts r
                                         WHERE r.memo_id = l.memo_id AND r.user_id = v_user AND r.version = v_version) THEN
        UPDATE public.app_notifications SET read_at = now()
         WHERE user_id = v_user AND ref_kind = 'memo' AND ref_id = l.memo_id::text AND read_at IS NULL;
      END IF;
    END IF;
    INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name, note)
    VALUES (p_letter, 'Shared with ' || coalesce(v_who, 'its person'), auth.uid(), public.hr_doc_actor_name(), 'Back in their app');
  END IF;
  RETURN jsonb_build_object('id', p_letter, 'person', v_who, 'type', l.type_name, 'sees', p_on);
END
$$;

-- ── 8. The Bin, with what each caller is shown ──────────────────────────────

-- A folder in the Bin back where it was — the folder it was in first, when that is in the Bin too. False when it is gone
-- for good: what was in it then goes to the top of the Data center.
CREATE OR REPLACE FUNCTION public.hr_drive_bin_reopen(p_folder uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.hr_drive_folders%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.hr_drive_folders WHERE id = p_folder FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF f.deleted_at IS NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hr_drive_bin x WHERE x.folder_id = p_folder
                  AND x.deleted_at > now() - public.hr_drive_bin_keeps()) THEN
    RETURN false;
  END IF;
  IF f.parent_kind = 'folder' AND NOT public.hr_drive_bin_reopen(f.parent_folder_id) THEN
    UPDATE public.hr_drive_folders SET parent_kind = 'root', parent_dept_id = NULL, parent_folder_id = NULL, parent_staff_id = NULL
     WHERE id = p_folder RETURNING * INTO f;
  END IF;
  IF public.hr_drive_name_taken(f.parent_kind, f.parent_dept_id, f.parent_folder_id, f.parent_staff_id, f.name, f.id)
     AND (f.private_by IS NULL OR EXISTS (
           SELECT 1 FROM public.hr_drive_folders o
            WHERE o.deleted_at IS NULL AND o.id <> f.id AND o.parent_kind = f.parent_kind
              AND o.parent_dept_id IS NOT DISTINCT FROM f.parent_dept_id AND o.parent_folder_id IS NOT DISTINCT FROM f.parent_folder_id
              AND o.parent_staff_id IS NOT DISTINCT FROM f.parent_staff_id AND lower(trim(o.name)) = lower(trim(f.name))
              AND o.private_by IS NOT DISTINCT FROM f.private_by)) THEN
    RAISE EXCEPTION '% is there already — rename one first.', f.name USING ERRCODE = '22023';
  END IF;
  IF f.private_by IS NULL AND EXISTS (
       SELECT 1 FROM public.hr_drive_folders o
        WHERE o.deleted_at IS NULL AND o.id <> f.id AND o.private_by IS NULL AND o.parent_kind = f.parent_kind
          AND o.parent_dept_id IS NOT DISTINCT FROM f.parent_dept_id AND o.parent_folder_id IS NOT DISTINCT FROM f.parent_folder_id
          AND o.parent_staff_id IS NOT DISTINCT FROM f.parent_staff_id AND lower(trim(o.name)) = lower(trim(f.name))) THEN
    RAISE EXCEPTION '% is there already — rename one first.', f.name USING ERRCODE = '22023';
  END IF;
  UPDATE public.hr_drive_folders SET deleted_at = NULL, deleted_by = NULL WHERE id = p_folder;
  DELETE FROM public.hr_drive_bin WHERE folder_id = p_folder;
  RETURN true;
END
$$;

-- Bin › Restore (Edit): back where it was, for what the caller is shown. Answers what it was and where it is now.
CREATE OR REPLACE FUNCTION public.hr_drive_bin_restore(p_bin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x public.hr_drive_bin%ROWTYPE;
  y public.hr_drive_files%ROWTYPE;
  v_kind text;
  v_dept uuid;
  v_folder uuid;
  v_staff uuid;
  v_where text;
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Restoring needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM public.hr_drive_bin WHERE id = p_bin FOR UPDATE;
  IF NOT FOUND OR x.deleted_at <= now() - public.hr_drive_bin_keeps()
     OR NOT (CASE WHEN x.kind = 'folder' THEN public.hr_drive_sees_folder(x.folder_id) ELSE public.hr_drive_sees_file(x.file_id) END) THEN
    RAISE EXCEPTION 'That is not in the Bin any more.' USING ERRCODE = '22023';
  END IF;
  IF x.kind = 'folder' THEN
    IF NOT public.hr_drive_bin_reopen(x.folder_id) THEN
      RAISE EXCEPTION 'That is not in the Bin any more.' USING ERRCODE = '22023';
    END IF;
    SELECT f.parent_kind, f.parent_dept_id, f.parent_folder_id, f.parent_staff_id INTO v_kind, v_dept, v_folder, v_staff
      FROM public.hr_drive_folders f WHERE f.id = x.folder_id;
  ELSE
    SELECT * INTO y FROM public.hr_drive_files WHERE id = x.file_id FOR UPDATE;
    IF y.parent_kind = 'folder' AND NOT public.hr_drive_bin_reopen(y.parent_folder_id) THEN
      UPDATE public.hr_drive_files SET parent_kind = 'root', parent_folder_id = NULL WHERE id = y.id;
      y.parent_kind := 'root';
      y.parent_folder_id := NULL;
    END IF;
    DELETE FROM public.hr_drive_bin WHERE id = p_bin;
    v_kind := y.parent_kind;
    v_dept := y.parent_dept_id;
    v_folder := y.parent_folder_id;
    v_staff := y.parent_staff_id;
  END IF;
  v_where := public.hr_drive_label(v_kind, v_dept, v_folder, v_staff);
  IF x.kind = 'file' THEN
    INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
    VALUES (x.file_id, 'Restored', auth.uid(), public.hr_doc_actor_name(), 'Into ' || coalesce(v_where, 'the Data center'));
  END IF;
  RETURN jsonb_build_object('kind', x.kind, 'name', x.name, 'label', coalesce(v_where, 'Data center'));
END
$$;

-- Bin › Delete forever (Edit): deleted now, as a Data center file always was — of what the caller is shown.
CREATE OR REPLACE FUNCTION public.hr_drive_bin_delete(p_bin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x public.hr_drive_bin%ROWTYPE;
  v_paths text[];
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Deleting needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM public.hr_drive_bin WHERE id = p_bin;
  IF NOT FOUND
     OR NOT (CASE WHEN x.kind = 'folder' THEN public.hr_drive_sees_folder(x.folder_id) ELSE public.hr_drive_sees_file(x.file_id) END) THEN
    RAISE EXCEPTION 'That is not in the Bin any more.' USING ERRCODE = '22023';
  END IF;
  v_paths := public.hr_drive_bin_drop(p_bin, false);
  RETURN jsonb_build_object('files', cardinality(v_paths));
END
$$;

-- Bin › Empty bin (Edit): everything in it the caller is shown, now — never another's View only me. Answers how many.
CREATE OR REPLACE FUNCTION public.hr_drive_bin_empty()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Emptying the Bin needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  FOR r IN SELECT x.id FROM public.hr_drive_bin x
            WHERE CASE WHEN x.kind = 'folder' THEN public.hr_drive_sees_folder(x.folder_id) ELSE public.hr_drive_sees_file(x.file_id) END
            ORDER BY x.deleted_at, x.id LOOP
    PERFORM public.hr_drive_bin_drop(r.id, false);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('count', v_n);
END
$$;

-- ── 9. One's own documents ──────────────────────────────────────────────────

-- What of a person's folder is shared with them, as their app draws it: each folder shared with them and each file, under
-- the nearest folder above it they are shown (null = the top of Personal); their letters still on file and not kept from
-- them, each with their receipt of the memo it travelled as. `p_as_hr`: read for HR (the Revenue app's View as) — what the
-- reader is not shown (View only me) is left out too.
CREATE OR REPLACE FUNCTION public.hr_personal_documents(p_staff uuid, p_as_hr boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := (SELECT s.user_id FROM public.hr_staff_costs s WHERE s.id = p_staff);
BEGIN
  RETURN (
    WITH RECURSIVE tree AS (
      SELECT f.id, f.name, f.created_at, coalesce(f.member_view, false) AS shown,
             NULL::uuid AS shown_in,
             (NOT p_as_hr OR public.hr_drive_sees(f.private_by, f.private_rank)) AS hr_sees, 1 AS depth
        FROM public.hr_drive_folders f
       WHERE f.parent_kind = 'person' AND f.parent_staff_id = p_staff AND f.deleted_at IS NULL
      UNION ALL
      SELECT c.id, c.name, c.created_at,
             coalesce(c.member_view, CASE WHEN c.private_by IS NOT NULL THEN false ELSE t.shown END),
             CASE WHEN t.shown THEN t.id ELSE t.shown_in END,
             t.hr_sees AND (NOT p_as_hr OR public.hr_drive_sees(c.private_by, c.private_rank)),
             t.depth + 1
        FROM public.hr_drive_folders c JOIN tree t ON c.parent_folder_id = t.id
       WHERE c.deleted_at IS NULL AND t.depth < 64
    ), files AS (
      SELECT x.id, x.ref, x.file_name, x.content_type, x.file_size, x.uploaded_at,
             coalesce(x.member_view, CASE WHEN x.private_by IS NOT NULL THEN false ELSE coalesce(t.shown, false) END) AS shown,
             CASE WHEN t.shown THEN t.id ELSE t.shown_in END AS shown_in,
             coalesce(t.hr_sees, true) AND (NOT p_as_hr OR public.hr_drive_sees(x.private_by, x.private_rank)) AS hr_sees
        FROM public.hr_drive_files x
        LEFT JOIN tree t ON t.id = x.parent_folder_id
       WHERE x.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = x.id)
         AND ((x.parent_kind = 'person' AND x.parent_staff_id = p_staff) OR (x.parent_kind = 'folder' AND t.id IS NOT NULL))
    )
    SELECT jsonb_build_object(
      'folders', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'parent', t.shown_in, 'at', t.created_at)
                    ORDER BY lower(t.name), t.id), '[]'::jsonb)
                    FROM tree t WHERE t.shown AND t.hr_sees),
      'files', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'name', x.file_name, 'contentType', x.content_type,
                  'size', x.file_size, 'at', x.uploaded_at, 'parent', x.shown_in,
                  'seen', EXISTS (SELECT 1 FROM public.hr_drive_member_seen s WHERE s.file_id = x.id AND s.staff_id = p_staff))
                  ORDER BY lower(x.file_name), x.id), '[]'::jsonb)
                  FROM files x WHERE x.shown AND x.hr_sees),
      'letters', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'ref', l.ref, 'typeName', coalesce(lt.name, l.type_name),
                    'name', l.file_name, 'contentType', l.content_type, 'size', l.file_size, 'at', l.filed_at, 'memoId', l.memo_id,
                    'readAt', rc.read_at, 'acknowledgedAt', rc.acknowledged_at)
                    ORDER BY l.filed_at DESC, l.ref DESC), '[]'::jsonb)
                    FROM public.hr_person_letters l
                    LEFT JOIN public.hr_letter_types lt ON lt.id = l.letter_type_id
                    LEFT JOIN public.member_memos m ON m.id = l.memo_id
                    LEFT JOIN LATERAL (
                      SELECT min(r.read_at) AS read_at, min(r.acknowledged_at) AS acknowledged_at
                        FROM public.member_memo_receipts r
                       WHERE r.memo_id = l.memo_id AND r.user_id = v_user AND r.version = m.version
                    ) rc ON true
                   WHERE l.staff_id = p_staff AND l.withdrawn_at IS NULL AND l.member_hidden_at IS NULL)
    )
  );
END
$$;

-- A department's documents for a person, with whether they opened each.
CREATE OR REPLACE FUNCTION public.hr_company_documents(p_staff uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept uuid := (SELECT s.department_id FROM public.hr_staff_costs s WHERE s.id = p_staff);
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'fileName', d.file_name, 'contentType', d.content_type,
             'size', d.file_size, 'uploadedAt', d.uploaded_at,
             'seen', EXISTS (SELECT 1 FROM public.hr_document_seen x WHERE x.document_id = d.id AND x.staff_id = p_staff))
           ORDER BY d.uploaded_at DESC, d.ref DESC)
      FROM public.hr_documents d
     WHERE d.deleted_at IS NULL AND v_dept IS NOT NULL AND v_dept = ANY (d.department_ids)
  ), '[]'::jsonb);
END
$$;

-- A Revenue member's company documents stay behind Profile · Documentation's box (mig 20261011190000); anybody else's
-- department documents are theirs.
CREATE OR REPLACE FUNCTION public.hr_my_company_open()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NOT public.has_perm('member_portal') OR NOT public.tab_box_closed('rev.documentation', 'view');
END
$$;

-- The caller's own documents, in every face of the app: Company (their department's) and Personal (what of their folder
-- is shared with them, their letters). A login no People record names (principal@, hr@ …) has none.
CREATE OR REPLACE FUNCTION public.my_documents()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_staff uuid;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  SELECT s.id INTO v_staff FROM public.hr_staff_costs s
   WHERE s.user_id = v_me AND s.status = 'active'
   ORDER BY s.created_at, s.id LIMIT 1;
  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('staffId', NULL, 'company', '[]'::jsonb,
      'personal', jsonb_build_object('folders', '[]'::jsonb, 'files', '[]'::jsonb, 'letters', '[]'::jsonb));
  END IF;
  RETURN jsonb_build_object('staffId', v_staff,
    'company', CASE WHEN public.hr_my_company_open() THEN public.hr_company_documents(v_staff) ELSE '[]'::jsonb END,
    'personal', public.hr_personal_documents(v_staff, false));
END
$$;

-- One of them, opened by its person: the object to sign, and the open recorded — a company document seen ("Opened in
-- My documents"), a file of theirs seen ("Opened"), a letter's memo read.
CREATE OR REPLACE FUNCTION public.my_document_open(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_staff uuid;
  v_dept uuid;
  v_who text;
  v jsonb;
  l public.hr_person_letters%ROWTYPE;
  v_version integer;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  SELECT s.id, s.department_id, s.employee_name INTO v_staff, v_dept, v_who FROM public.hr_staff_costs s
   WHERE s.user_id = v_me AND s.status = 'active'
   ORDER BY s.created_at, s.id LIMIT 1;
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'No People record is linked to this account.' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'document' THEN
    IF NOT public.hr_my_company_open() THEN
      RAISE EXCEPTION 'Documentation is not open to your account.' USING ERRCODE = '42501';
    END IF;
    SELECT jsonb_build_object('path', d.file_path, 'fileName', d.file_name, 'contentType', d.content_type) INTO v
      FROM public.hr_documents d WHERE d.id = p_id AND d.deleted_at IS NULL AND v_dept = ANY (d.department_ids);
    IF v IS NULL THEN
      RAISE EXCEPTION 'That document is not shared with you.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.hr_document_seen (document_id, staff_id) VALUES (p_id, v_staff) ON CONFLICT DO NOTHING;
    INSERT INTO public.hr_document_events (document_id, what, actor_id, actor_name)
    VALUES (p_id, 'Opened in My documents', v_me, v_who);
  ELSIF p_kind = 'drive' THEN
    SELECT jsonb_build_object('path', x.file_path, 'fileName', x.file_name, 'contentType', x.content_type) INTO v
      FROM public.hr_drive_files x
     WHERE x.id = p_id AND x.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = x.id)
       AND public.hr_drive_person_of_file(x.id) = v_staff AND public.hr_drive_member_sees_file(x.id);
    IF v IS NULL THEN
      RAISE EXCEPTION 'That file is not shared with you.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.hr_drive_member_seen (file_id, staff_id) VALUES (p_id, v_staff) ON CONFLICT DO NOTHING;
    INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name)
    VALUES (p_id, 'Opened', v_me, coalesce(v_who, 'Its person'));
  ELSIF p_kind = 'letter' THEN
    SELECT * INTO l FROM public.hr_person_letters
     WHERE id = p_id AND staff_id = v_staff AND withdrawn_at IS NULL AND member_hidden_at IS NULL;
    IF l.id IS NULL THEN
      RAISE EXCEPTION 'That letter is not shared with you.' USING ERRCODE = '42501';
    END IF;
    v := jsonb_build_object('path', l.file_path, 'fileName', l.file_name, 'contentType', l.content_type);
    -- Opening the letter is reading the memo it travelled as.
    SELECT m.version INTO v_version FROM public.member_memos m
     WHERE m.id = l.memo_id AND m.withdrawn_at IS NULL
       AND EXISTS (SELECT 1 FROM public.member_memo_recipients p WHERE p.memo_id = m.id AND p.staff_id = v_staff);
    IF v_version IS NOT NULL THEN
      INSERT INTO public.member_memo_receipts (memo_id, user_id, version) VALUES (l.memo_id, v_me, v_version)
      ON CONFLICT (memo_id, user_id, version) DO NOTHING;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown kind of file' USING ERRCODE = '22023';
  END IF;
  RETURN v;
END
$$;

-- The Revenue app's View as (Documentation · View): one person's Company and Personal as they see them — less what the
-- reader is not shown — nothing marked seen.
CREATE OR REPLACE FUNCTION public.my_documents_of(p_staff uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Seeing a member''s documents needs Documentation · View.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.id = p_staff) THEN
    RAISE EXCEPTION 'Pick a team member first.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('staffId', p_staff,
    'company', public.hr_company_documents(p_staff),
    'personal', public.hr_personal_documents(p_staff, true));
END
$$;

-- ── 10. Production's other readers, one span each ───────────────────────────

-- The bucket: a Revenue member's company documents behind their box, anybody else's open; a letter kept from its person
-- is not theirs to sign; a file of their folder shared with them is.
SELECT pg_temp.swap_check('public.hr_file_readable_by_member(text)',
  $q$RETURN (NOT public.tab_box_closed('rev.documentation', 'view') AND EXISTS (SELECT 1 FROM public.hr_documents d$q$,
  $q$RETURN (public.hr_my_company_open() AND EXISTS (SELECT 1 FROM public.hr_documents d$q$);
SELECT pg_temp.swap_check('public.hr_file_readable_by_member(text)',
  $q$OR EXISTS (SELECT 1 FROM public.hr_person_letters l WHERE l.file_path = p_name AND l.staff_id = v_staff AND l.withdrawn_at IS NULL)$q$,
  $q$OR EXISTS (SELECT 1 FROM public.hr_person_letters l WHERE l.file_path = p_name AND l.staff_id = v_staff AND l.withdrawn_at IS NULL
                  AND l.member_hidden_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.hr_drive_files x WHERE x.file_path = p_name AND x.deleted_at IS NULL
                  AND NOT EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = x.id)
                  AND public.hr_drive_person_of_file(x.id) = v_staff AND public.hr_drive_member_sees_file(x.id))$q$);

-- The bucket's read for HR leaves out a Data center file the reader is not shown (View only me).
ALTER POLICY hr_documents_read ON storage.objects
  USING (bucket_id = 'hr-documents'
    AND (((SELECT public.has_any_action(ARRAY['documentation.view'])) AND public.hr_doc_readable_by_hr(name))
         OR public.hr_file_readable_by_member(name)));

-- Documentation's read: each letter says when it was kept from its person; a published memo's count of acknowledgements
-- leaves out whoever a copy is kept from (they are no longer among its recipients).
SELECT pg_temp.swap_check('public.hr_documentation()',
  $q$'filedAt', l.filed_at, 'filedBy', l.filed_by_name, 'source', l.source, 'withdrawnAt', l.withdrawn_at,$q$,
  $q$'filedAt', l.filed_at, 'filedBy', l.filed_by_name, 'source', l.source, 'withdrawnAt', l.withdrawn_at,
                   'hiddenAt', l.member_hidden_at,$q$);
SELECT pg_temp.swap_check('public.hr_documentation()',
  $q$WHERE x.memo_id = m.id AND x.version = m.version AND x.acknowledged_at IS NOT NULL)$q$,
  $q$WHERE x.memo_id = m.id AND x.version = m.version AND x.acknowledged_at IS NOT NULL
                                         AND NOT EXISTS (SELECT 1 FROM public.hr_person_letters hl JOIN public.hr_staff_costs hs ON hs.id = hl.staff_id
                                                          WHERE hl.memo_id = m.id AND hl.member_hidden_at IS NOT NULL AND hs.user_id = x.user_id))$q$);

-- A published memo withdrawn: "Had reached N people · M acknowledged" counts as its list did.
SELECT pg_temp.swap_check('public.hr_memo_withdraw(uuid)',
  $q$WHERE x.memo_id = p_id AND x.version = v_memo.version AND x.acknowledged_at IS NOT NULL;$q$,
  $q$WHERE x.memo_id = p_id AND x.version = v_memo.version AND x.acknowledged_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.hr_person_letters hl JOIN public.hr_staff_costs hs ON hs.id = hl.staff_id
                      WHERE hl.memo_id = p_id AND hl.member_hidden_at IS NOT NULL AND hs.user_id = x.user_id);$q$);

-- ── 11. The Audit Log: View only me needs the Audit Log key ─────────────────

ALTER TABLE public.audit_tables DROP CONSTRAINT audit_tables_needs_rule_check;
ALTER TABLE public.audit_tables ADD CONSTRAINT audit_tables_needs_rule_check
  CHECK (needs_rule IN ('payroll_voucher', 'payroll_pool_row', 'drive_private'));
SELECT pg_temp.swap_check('public.audit_row_needs(text,text,jsonb)',
  $q$THEN c_needs END;
  END IF;
  RETURN NULL;$q$,
  $q$THEN c_needs END;
  ELSIF p_rule = 'drive_private' THEN
    -- The Data center's View only me (mig 20261014190000): only the Audit Log key reads its history.
    RETURN CASE WHEN public.hr_drive_row_private(p_table, p_row) THEN ARRAY['audit_log'] END;
  END IF;
  RETURN NULL;$q$);
SELECT public.audit_register('hr_drive_folders', 'Data center folders', 'People', '{documentation}', 'all',
  p_labels => '{name}', p_needs => 'drive_private');
SELECT public.audit_register('hr_drive_files', 'Data center files', 'People', '{documentation}', 'all',
  p_keys => '{ref}', p_labels => '{file_name}', p_needs => 'drive_private');
SELECT public.audit_register('hr_drive_bin', 'Data center bin', 'People', '{documentation}', 'all',
  p_labels => '{name}', p_needs => 'drive_private');

-- ── 12. Who may call what ───────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.hr_drive_rank_of(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_sees(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_sees_folder(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_sees_file(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_locked_folder(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_person_of(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_person_of_file(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_member_sees_folder(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_member_sees_file(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_address(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_label(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_lock_left(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_place(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_name_taken(text, uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_row_private(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_personal_documents(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_company_documents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_my_company_open() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_drive_rank_of(uuid), public.hr_drive_sees(uuid, integer), public.hr_drive_sees_folder(uuid),
  public.hr_drive_sees_file(uuid), public.hr_drive_locked_folder(uuid), public.hr_drive_person_of(text, uuid, uuid),
  public.hr_drive_person_of_file(uuid), public.hr_drive_member_sees_folder(uuid), public.hr_drive_member_sees_file(uuid),
  public.hr_drive_address(text, uuid, uuid, uuid), public.hr_drive_label(text, uuid, uuid, uuid),
  public.hr_drive_lock_left(uuid, uuid, uuid, integer), public.hr_drive_place(text),
  public.hr_drive_name_taken(text, uuid, uuid, uuid, text, uuid), public.hr_drive_row_private(text, jsonb),
  public.hr_personal_documents(uuid, boolean), public.hr_company_documents(uuid), public.hr_my_company_open() TO service_role;

-- The bucket's read policy calls it as the reader: a signed-in session only.
REVOKE ALL ON FUNCTION public.hr_doc_readable_by_hr(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_doc_readable_by_hr(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.hr_drive_file_move(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_drive_copy_plan(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_drive_file_copy(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_drive_folder_copy(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_drive_private(text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_drive_member_view(text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_letter_member_view(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_documents() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_document_open(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_documents_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_drive_file_move(uuid, text), public.hr_drive_copy_plan(text, uuid),
  public.hr_drive_file_copy(uuid, text, text, text), public.hr_drive_folder_copy(uuid, text, text, jsonb),
  public.hr_drive_private(text, uuid, boolean), public.hr_drive_member_view(text, uuid, boolean),
  public.hr_letter_member_view(uuid, boolean), public.my_documents(), public.my_document_open(text, uuid),
  public.my_documents_of(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.my_documents() IS
  'One''s own documents (2026-10-14), in every face of the app: Company — the department''s, a Revenue member''s behind Profile · Documentation — and Personal — what of their Data center folder is shared with them, their letters not kept from them.';
COMMENT ON FUNCTION public.hr_drive_private(text, uuid, boolean) IS
  'The Data center''s View only me (2026-10-14): only the one who set it, whoever stands higher on the ladder, and the Principal see it.';

-- ── Guards ──────────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.hr_drive_file_move(uuid, text)', 'public.hr_drive_copy_plan(text, uuid)',
      'public.hr_drive_file_copy(uuid, text, text, text)', 'public.hr_drive_folder_copy(uuid, text, text, jsonb)',
      'public.hr_drive_private(text, uuid, boolean)', 'public.hr_drive_member_view(text, uuid, boolean)',
      'public.hr_letter_member_view(uuid, boolean)', 'public.my_documents()', 'public.my_document_open(text, uuid)',
      'public.my_documents_of(uuid)', 'public.hr_drive()', 'public.hr_drive_file(uuid)'] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: the publishable key may call it', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: a signed-in reader may not call it', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY['public.hr_drive_rank_of(uuid)', 'public.hr_drive_sees(uuid, integer)', 'public.hr_drive_sees_folder(uuid)',
      'public.hr_drive_sees_file(uuid)', 'public.hr_drive_place(text)', 'public.hr_drive_name_taken(text, uuid, uuid, uuid, text, uuid)',
      'public.hr_personal_documents(uuid, boolean)', 'public.hr_company_documents(uuid)', 'public.hr_drive_lock_left(uuid, uuid, uuid, integer)',
      'public.hr_drive_member_sees_file(uuid)', 'public.hr_drive_row_private(text, jsonb)'] LOOP
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') OR has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: open to sessions', v_fn;
    END IF;
  END LOOP;
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hr_file_readable_by_member(text)'::regprocedure), 'member_hidden_at') = 0
     OR strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hr_file_readable_by_member(text)'::regprocedure), 'hr_drive_member_sees_file') = 0 THEN
    RAISE EXCEPTION 'the bucket does not know a person''s own files';
  END IF;
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.audit_row_needs(text,text,jsonb)'::regprocedure), 'drive_private') = 0 THEN
    RAISE EXCEPTION 'the Audit Log does not know View only me';
  END IF;
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hr_documentation()'::regprocedure), 'member_hidden_at') = 0 THEN
    RAISE EXCEPTION 'Documentation does not say which letters are kept from their person';
  END IF;
END
$guard$;
