-- ============================================================================
-- 20261014230000_data_center_personal_review_fixes.sql
-- People › Documentation: what the independent review of 20261014190000 found
-- (2026-10-14, PR #393) — a person's own documents and View only me, closed
-- where they still leaked.
-- ============================================================================
--
--   H1  An object the Data center has not recorded yet — an upload or a copy in
--       flight, or one left behind when its record was refused — was readable by
--       anybody with Documentation · View (the bucket's read asked only for a row
--       the reader is not shown). Now an unrecorded `drive/` object is its
--       uploader's alone (`storage.objects.owner_id`), the hourly sweep deletes one
--       a day old (`hr_drive_orphans`, the service role's), a copy is checked —
--       the place, inside itself, the name — BEFORE any object is copied
--       (`hr_drive_copy_plan(kind, id, parent, name)`), and the leftovers HR's own
--       writes sweep are only what the sweeper may read.
--   H2  The Audit Log hid only what was written after a lock. Now locking hides
--       the history of the thing and of everything in it — and so does moving it
--       into a locked folder (`hr_drive_audit_hide`): `needs = {audit_log}`. Taking
--       the lock off shows nothing again (the safe side).
--   M1  A letter kept from its person left its memo with no recipient, which
--       Member services read as one of its own and `hr_letter_withdraw` as reaching
--       nobody (withdrawing the memo, its receipts with it). Neither any more.
--   M3  A share inside a locked folder outlived the lock. A lock is now a barrier:
--       nothing in a locked folder reaches its person unless the locked folder
--       itself is shared with them (a lock clears its own share, as before).
--       Sharing something inside such a folder is refused with its name, and a
--       lock says "no longer sees it" when the person saw anything in it.
--   M4  Restored to the top of the Data center (its folder gone for good), a thing
--       now takes along the lock of the folders it was in.
--   Low A walk up more than 64 folders no longer passes as "not locked" — it fails
--       closed (not shown; locked for the Audit Log).
--
-- Not changed — the review's M2, written into the rules instead: View only me
-- compares ranks on the ladder, which whoever may edit People (a title) or the
-- ladder can move.
--
-- Bodies replaced whole are this session's own from 20261014190000, compared
-- with production first (`expect_body`); production's older bodies get one span
-- each (`swap_check`).

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

SELECT pg_temp.expect_body('public.hr_drive_sees_folder(uuid)', '816559a23922e01d6372bf4821885a3e');
SELECT pg_temp.expect_body('public.hr_drive_locked_folder(uuid)', '63e4369d58ea7b86e52a8559c02980ca');
SELECT pg_temp.expect_body('public.hr_drive_member_sees_folder(uuid)', 'eb0fd48e5768730d494949b6ed65c8b6');
SELECT pg_temp.expect_body('public.hr_drive_member_sees_file(uuid)', 'b044dd0689e3f860097bb8e97c822196');
SELECT pg_temp.expect_body('public.hr_drive_private(text,uuid,boolean)', '05c6052f6bc093f737d6ac0ce0fab6c5');
SELECT pg_temp.expect_body('public.hr_drive_folder_move(uuid,text)', '6313aff410581e22226cc2c20fc0c90d');
SELECT pg_temp.expect_body('public.hr_drive_file_move(uuid,text)', '0ff8710a269ff09ee277644631462709');
SELECT pg_temp.expect_body('public.hr_drive_bin_reopen(uuid)', '11c53c023a85978e2945f18dd3edb9ce');
SELECT pg_temp.expect_body('public.hr_drive_bin_restore(uuid)', '33508a370a2d833fad8a579414b32785');
SELECT pg_temp.expect_body('public.hr_drive_copy_plan(text,uuid)', '8868972449a579c009fff6f6113ad12c');
SELECT pg_temp.expect_body('public.hr_doc_readable_by_hr(text)', '6c6a19f23c03bba0d5221c323291ea15');
SELECT pg_temp.expect_body('public.hr_drive_member_view(text,uuid,boolean)', 'a4c2ba2ab675a78d62fd78cc4c4fef90');

-- ── 1. Walks that cannot reach the top fail closed ──────────────────────────

-- The caller sees a folder: it and every folder above it — and the walk reached the top (a folder more than 64 deep is
-- not shown).
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
      SELECT f.id, f.parent_kind, f.parent_folder_id, f.private_by, f.private_rank, 1 AS depth
        FROM public.hr_drive_folders f WHERE f.id = p_folder
      UNION ALL
      SELECT c.id, c.parent_kind, c.parent_folder_id, c.private_by, c.private_rank, up.depth + 1
        FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
    SELECT bool_or(up.parent_kind <> 'folder') AND bool_and(public.hr_drive_sees(up.private_by, up.private_rank)) FROM up), false);
END
$$;

-- Something View only me at a folder or above it — or a walk that cannot reach the top (the Audit Log's rule; a lock
-- moved, copied or restored along).
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
      SELECT f.id, f.parent_kind, f.parent_folder_id, f.private_by, 1 AS depth FROM public.hr_drive_folders f WHERE f.id = p_folder
      UNION ALL
      SELECT c.id, c.parent_kind, c.parent_folder_id, c.private_by, up.depth + 1
        FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
    SELECT bool_or(up.private_by IS NOT NULL) OR NOT bool_or(up.parent_kind <> 'folder') FROM up), false);
END
$$;

-- ── 2. A lock is a barrier between a person and what is in it (M3) ──────────

-- Whether a folder is shared with its person, walking up: anything locked on the way that is not itself shared with
-- them shuts it (a barrier); else the nearest share or keep-back decides; else not. A walk that cannot reach the top:
-- not shared.
CREATE OR REPLACE FUNCTION public.hr_drive_member_sees_folder(p_folder uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_found boolean;
  v_top boolean := false;
BEGIN
  FOR r IN
    WITH RECURSIVE up AS (
      SELECT f.id, f.parent_kind, f.parent_folder_id, f.member_view, f.private_by, 1 AS depth
        FROM public.hr_drive_folders f WHERE f.id = p_folder
      UNION ALL
      SELECT c.id, c.parent_kind, c.parent_folder_id, c.member_view, c.private_by, up.depth + 1
        FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
    SELECT up.parent_kind, up.member_view, up.private_by FROM up ORDER BY up.depth
  LOOP
    IF r.private_by IS NOT NULL AND r.member_view IS NOT TRUE THEN
      RETURN false;
    END IF;
    IF v_found IS NULL AND r.member_view IS NOT NULL THEN
      v_found := r.member_view;
    END IF;
    IF r.parent_kind <> 'folder' THEN
      v_top := true;
    END IF;
  END LOOP;
  RETURN v_top AND coalesce(v_found, false);
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
  r record;
  v_found boolean;
  v_top boolean := false;
BEGIN
  SELECT * INTO x FROM public.hr_drive_files WHERE id = p_file;
  IF x.id IS NULL OR (x.private_by IS NOT NULL AND x.member_view IS NOT TRUE) THEN
    RETURN false;
  END IF;
  IF x.parent_kind IS DISTINCT FROM 'folder' THEN
    RETURN coalesce(x.member_view, false);
  END IF;
  v_found := x.member_view;
  FOR r IN
    WITH RECURSIVE up AS (
      SELECT f.id, f.parent_kind, f.parent_folder_id, f.member_view, f.private_by, 1 AS depth
        FROM public.hr_drive_folders f WHERE f.id = x.parent_folder_id
      UNION ALL
      SELECT c.id, c.parent_kind, c.parent_folder_id, c.member_view, c.private_by, up.depth + 1
        FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
    SELECT up.parent_kind, up.member_view, up.private_by FROM up ORDER BY up.depth
  LOOP
    IF r.private_by IS NOT NULL AND r.member_view IS NOT TRUE THEN
      RETURN false;
    END IF;
    IF v_found IS NULL AND r.member_view IS NOT NULL THEN
      v_found := r.member_view;
    END IF;
    IF r.parent_kind <> 'folder' THEN
      v_top := true;
    END IF;
  END LOOP;
  RETURN v_top AND coalesce(v_found, false);
END
$$;

-- The nearest folder at or above a folder that is View only me and not itself shared with its person — what keeps
-- everything in it from them. NULL when nothing does.
CREATE OR REPLACE FUNCTION public.hr_drive_barrier_above(p_folder uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF p_folder IS NULL THEN
    RETURN NULL;
  END IF;
  FOR r IN
    WITH RECURSIVE up AS (
      SELECT f.id, f.name, f.parent_folder_id, f.member_view, f.private_by, 1 AS depth
        FROM public.hr_drive_folders f WHERE f.id = p_folder
      UNION ALL
      SELECT c.id, c.name, c.parent_folder_id, c.member_view, c.private_by, up.depth + 1
        FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
    SELECT up.name, up.member_view, up.private_by FROM up ORDER BY up.depth
  LOOP
    IF r.private_by IS NOT NULL AND r.member_view IS NOT TRUE THEN
      RETURN r.name;
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;

-- Whether a folder's person sees it or anything in it — what a lock on it takes from them.
CREATE OR REPLACE FUNCTION public.hr_drive_member_sees_any(p_folder uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    WITH RECURSIVE down AS (
      SELECT p_folder AS id, 1 AS depth
      UNION ALL
      SELECT c.id, down.depth + 1 FROM public.hr_drive_folders c JOIN down ON c.parent_folder_id = down.id
       WHERE c.deleted_at IS NULL AND down.depth < 64)
    SELECT 1 FROM down WHERE public.hr_drive_member_sees_folder(down.id)
    UNION ALL
    SELECT 1 FROM public.hr_drive_files x
     WHERE x.parent_folder_id IN (SELECT id FROM down) AND x.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = x.id)
       AND public.hr_drive_member_sees_file(x.id));
END
$$;

-- "<person> can view", as before — but not for something inside a folder that is View only me and kept from them: the
-- lock stands between them, and the tick would say what is not so.
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
  v_bar text;
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
  IF p_on THEN
    v_bar := public.hr_drive_barrier_above(CASE WHEN p_kind = 'folder' THEN f.parent_folder_id ELSE x.parent_folder_id END);
    IF v_bar IS NOT NULL THEN
      RAISE EXCEPTION '% is inside %, which is View only me — share % with % first.', v_name, v_bar, v_bar, coalesce(v_who, 'them')
        USING ERRCODE = '22023';
    END IF;
  END IF;
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

-- The page's read works the same out top down: `barred` once anything locked and not itself shared is passed.
SELECT pg_temp.swap_check('public.hr_drive()',
  $q$CASE WHEN f.parent_kind = 'person' THEN coalesce(f.member_view, false) END AS member, 1 AS depth$q$,
  $q$CASE WHEN f.parent_kind = 'person' THEN NOT (f.private_by IS NOT NULL AND f.member_view IS NOT TRUE) AND coalesce(f.member_view, false) END AS member,
             (f.private_by IS NOT NULL AND f.member_view IS NOT TRUE) AS barred, 1 AS depth$q$);
SELECT pg_temp.swap_check('public.hr_drive()',
  $q$THEN coalesce(c.member_view, CASE WHEN c.private_by IS NOT NULL THEN false ELSE t.member END) END,
             t.depth + 1$q$,
  $q$THEN NOT (t.barred OR (c.private_by IS NOT NULL AND c.member_view IS NOT TRUE)) AND coalesce(c.member_view, t.member, false) END,
             t.barred OR (c.private_by IS NOT NULL AND c.member_view IS NOT TRUE),
             t.depth + 1$q$);
SELECT pg_temp.swap_check('public.hr_drive()',
  $q$THEN coalesce(x.member_view, CASE WHEN x.private_by IS NOT NULL THEN false ELSE coalesce(t.member, false) END) END AS member$q$,
  $q$THEN NOT (coalesce(t.barred, false) OR (x.private_by IS NOT NULL AND x.member_view IS NOT TRUE))
                       AND coalesce(x.member_view, t.member, false) END AS member$q$);

-- …and so does what a person reads of their own.
SELECT pg_temp.swap_check('public.hr_personal_documents(uuid,boolean)',
  $q$SELECT f.id, f.name, f.created_at, coalesce(f.member_view, false) AS shown,$q$,
  $q$SELECT f.id, f.name, f.created_at, NOT (f.private_by IS NOT NULL AND f.member_view IS NOT TRUE) AND coalesce(f.member_view, false) AS shown,
             (f.private_by IS NOT NULL AND f.member_view IS NOT TRUE) AS barred,$q$);
SELECT pg_temp.swap_check('public.hr_personal_documents(uuid,boolean)',
  $q$coalesce(c.member_view, CASE WHEN c.private_by IS NOT NULL THEN false ELSE t.shown END),$q$,
  $q$NOT (t.barred OR (c.private_by IS NOT NULL AND c.member_view IS NOT TRUE)) AND coalesce(c.member_view, t.shown),
             t.barred OR (c.private_by IS NOT NULL AND c.member_view IS NOT TRUE),$q$);
SELECT pg_temp.swap_check('public.hr_personal_documents(uuid,boolean)',
  $q$coalesce(x.member_view, CASE WHEN x.private_by IS NOT NULL THEN false ELSE coalesce(t.shown, false) END) AS shown,$q$,
  $q$NOT (coalesce(t.barred, false) OR (x.private_by IS NOT NULL AND x.member_view IS NOT TRUE))
               AND coalesce(x.member_view, t.shown, false) AS shown,$q$);

-- ── 3. The history of what is locked (H2) ───────────────────────────────────

-- When a thing is locked — itself or a folder above it — its history and the history of everything in it need the
-- Audit Log key: what was written before the lock too. Nothing when it is not locked.
CREATE OR REPLACE FUNCTION public.hr_drive_audit_hide(p_kind text, p_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked boolean;
  v_n integer;
BEGIN
  IF p_kind = 'folder' THEN
    v_locked := public.hr_drive_locked_folder(p_id);
  ELSIF p_kind = 'file' THEN
    v_locked := coalesce((SELECT x.private_by IS NOT NULL OR (x.parent_kind = 'folder' AND public.hr_drive_locked_folder(x.parent_folder_id))
                            FROM public.hr_drive_files x WHERE x.id = p_id), false);
  ELSE
    RETURN 0;
  END IF;
  IF NOT v_locked THEN
    RETURN 0;
  END IF;
  WITH RECURSIVE down AS (
    SELECT p_id AS id, 1 AS depth WHERE p_kind = 'folder'
    UNION ALL
    SELECT c.id, down.depth + 1 FROM public.hr_drive_folders c JOIN down ON c.parent_folder_id = down.id WHERE down.depth < 64
  ), files AS (
    SELECT x.id, x.ref FROM public.hr_drive_files x
     WHERE (p_kind = 'file' AND x.id = p_id) OR x.parent_folder_id IN (SELECT id FROM down)
  )
  UPDATE public.audit_events e SET needs = ARRAY['audit_log']
   WHERE e.needs IS DISTINCT FROM ARRAY['audit_log']
     AND ((e.table_name = 'hr_drive_folders' AND e.row_key IN (SELECT id::text FROM down))
       OR (e.table_name = 'hr_drive_files' AND e.row_key IN (SELECT ref FROM files))
       OR (e.table_name = 'hr_drive_bin'
           AND (coalesce(e.new_row, e.old_row) ->> 'file_id' IN (SELECT id::text FROM files)
             OR coalesce(e.new_row, e.old_row) ->> 'folder_id' IN (SELECT id::text FROM down))));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

-- View only me, as before — and its history hidden with it.
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
      v_shared := coalesce(public.hr_drive_member_sees_any(p_id), false);
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
    PERFORM public.hr_drive_audit_hide(p_kind, p_id);
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

-- A folder's Move to…, as before — and, landing in a locked folder (or taking a lock along), its history hidden.
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
  PERFORM public.hr_drive_audit_hide('folder', p_id);
END
$$;

-- A file's Move to…, as before — its history hidden when it lands somewhere locked.
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
  PERFORM public.hr_drive_audit_hide('file', p_id);
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
  VALUES (p_id, 'Moved', auth.uid(), public.hr_doc_actor_name(),
          'Into ' || coalesce(public.hr_drive_label(v_place.kind, v_place.dept, v_place.folder, v_place.staff), 'the Data center'));
END
$$;

-- ── 4. Restored to the top, a thing keeps its lock (M4) ─────────────────────

CREATE OR REPLACE FUNCTION public.hr_drive_bin_reopen(p_folder uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.hr_drive_folders%ROWTYPE;
  v_lock record;
BEGIN
  SELECT * INTO f FROM public.hr_drive_folders WHERE id = p_folder FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF f.deleted_at IS NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hr_drive_bin x WHERE x.folder_id = p_folder
                  AND x.deleted_at > now() - public.hr_drive_bin_keeps()) THEN
    RETURN false;
  END IF;
  IF f.parent_kind = 'folder' AND NOT public.hr_drive_bin_reopen(f.parent_folder_id) THEN
    -- Its folder is gone for good: to the top of the Data center, taking the lock of the folders it was in.
    SELECT * INTO v_lock FROM public.hr_drive_lock_left(f.parent_folder_id, NULL, f.private_by, f.private_rank);
    UPDATE public.hr_drive_folders
       SET parent_kind = 'root', parent_dept_id = NULL, parent_folder_id = NULL, parent_staff_id = NULL,
           private_by = coalesce(v_lock.lock_by, private_by),
           private_rank = CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_rank ELSE private_rank END,
           private_by_name = CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_name ELSE private_by_name END,
           private_at = CASE WHEN v_lock.lock_by IS NOT NULL THEN now() ELSE private_at END
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

CREATE OR REPLACE FUNCTION public.hr_drive_bin_restore(p_bin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x public.hr_drive_bin%ROWTYPE;
  y public.hr_drive_files%ROWTYPE;
  v_lock record;
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
      -- Its folder is gone for good: to the top of the Data center, taking the lock of the folders it was in.
      SELECT * INTO v_lock FROM public.hr_drive_lock_left(y.parent_folder_id, NULL, y.private_by, y.private_rank);
      UPDATE public.hr_drive_files
         SET parent_kind = 'root', parent_folder_id = NULL,
             private_by = coalesce(v_lock.lock_by, private_by),
             private_rank = CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_rank ELSE private_rank END,
             private_by_name = CASE WHEN v_lock.lock_by IS NOT NULL THEN v_lock.lock_name ELSE private_by_name END,
             private_at = CASE WHEN v_lock.lock_by IS NOT NULL THEN now() ELSE private_at END
       WHERE id = y.id;
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

-- ── 5. Objects the Data center has not recorded (H1) ────────────────────────

-- The bucket's read for HR: anything but a Data center object the reader is not shown — a recorded file locked from
-- them, or an object nobody has recorded yet (an upload or a copy in flight, or one left behind), which is only its
-- uploader's (`storage.objects.owner_id`).
CREATE OR REPLACE FUNCTION public.hr_doc_readable_by_hr(p_name text, p_owner text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_name IS NULL OR p_name NOT LIKE 'drive/%' THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_drive_files x WHERE x.file_path = p_name) THEN
    RETURN NOT EXISTS (SELECT 1 FROM public.hr_drive_files x WHERE x.file_path = p_name AND NOT public.hr_drive_sees_file(x.id));
  END IF;
  RETURN p_owner IS NOT NULL AND auth.uid() IS NOT NULL AND p_owner = auth.uid()::text;
END
$$;
REVOKE ALL ON FUNCTION public.hr_doc_readable_by_hr(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_doc_readable_by_hr(text, text) TO authenticated, service_role;

ALTER POLICY hr_documents_read ON storage.objects
  USING (bucket_id = 'hr-documents'
    AND (((SELECT public.has_any_action(ARRAY['documentation.view'])) AND public.hr_doc_readable_by_hr(name, owner_id))
         OR public.hr_file_readable_by_member(name)));
DROP FUNCTION public.hr_doc_readable_by_hr(text);

-- What HR's own writes sweep: only what the sweeper may read (another's unrecorded upload or a file locked from them is
-- not theirs to see — nor, the bucket's delete reading through the read policy, to delete).
SELECT pg_temp.swap_check('public.hr_documentation_leftovers()',
  $q$AND public.hr_doc_file_unused(o.name)$q$,
  $q$AND public.hr_doc_file_unused(o.name)
               AND public.hr_doc_readable_by_hr(o.name, o.owner_id)$q$);

-- The hourly sweep's (the service role): `drive/` objects a day old that no Data center file names — an upload whose
-- record never came, a copy whose record was refused. Answers their names; the sweep removes them.
CREATE OR REPLACE FUNCTION public.hr_drive_orphans(p_limit integer DEFAULT 100)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN coalesce((
    SELECT array_agg(x.name ORDER BY x.created_at, x.name)
      FROM (SELECT o.name, o.created_at
              FROM storage.objects o
             WHERE o.bucket_id = 'hr-documents' AND o.name LIKE 'drive/%'
               AND o.created_at < now() - interval '1 day'
               AND NOT EXISTS (SELECT 1 FROM public.hr_drive_files f WHERE f.file_path = o.name)
             ORDER BY o.created_at, o.name
             LIMIT greatest(1, least(coalesce(p_limit, 100), 500))) x
  ), '{}'::text[]);
END
$$;
REVOKE ALL ON FUNCTION public.hr_drive_orphans(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_drive_orphans(integer) TO service_role;

-- A copy's plan, checked BEFORE any object is copied: the place (shown to the caller), never a folder into itself, and
-- — when a name is given — a name the place does not have. Then, as before, the file or a folder's live files the
-- caller is shown (at most 300).
DROP FUNCTION public.hr_drive_copy_plan(text, uuid);
CREATE FUNCTION public.hr_drive_copy_plan(p_kind text, p_id uuid, p_parent text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  v_place record;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create']) OR NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Copying needs Documentation · View and Create' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_place FROM public.hr_drive_place(p_parent);
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
    IF v_place.kind = 'folder' AND EXISTS (
         WITH RECURSIVE up AS (
           SELECT a.id, a.parent_folder_id, 1 AS depth FROM public.hr_drive_folders a WHERE a.id = v_place.folder
           UNION ALL
           SELECT c.id, c.parent_folder_id, up.depth + 1 FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
         SELECT 1 FROM up WHERE up.id = p_id) THEN
      RAISE EXCEPTION 'A folder cannot be copied inside itself.' USING ERRCODE = '22023';
    END IF;
    IF v_name IS NOT NULL AND public.hr_drive_name_taken(v_place.kind, v_place.dept, v_place.folder, v_place.staff, v_name, NULL) THEN
      RAISE EXCEPTION '% is there already — rename one first.', v_name USING ERRCODE = '22023';
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
REVOKE ALL ON FUNCTION public.hr_drive_copy_plan(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_drive_copy_plan(text, uuid, text, text) TO authenticated, service_role;

-- ── 6. A letter kept back still belongs to Documentation (M1) ───────────────

-- Member services' snapshot leaves out every memo a letter travelled as — kept back, its memo has no recipient left.
SELECT pg_temp.swap_check('public.member_admin_snapshot()',
  $q$AND NOT EXISTS(SELECT 1 FROM public.member_memo_recipients x WHERE x.memo_id=m.id) AND m.withdrawn_at IS NULL));$q$,
  $q$AND NOT EXISTS(SELECT 1 FROM public.member_memo_recipients x WHERE x.memo_id=m.id)
 AND NOT EXISTS(SELECT 1 FROM public.hr_person_letters hl WHERE hl.memo_id=m.id) AND m.withdrawn_at IS NULL));$q$);

-- A memo still reaches somebody while a copy of it is kept back (not withdrawn): withdrawing another copy leaves it —
-- and that person's receipt — alone.
SELECT pg_temp.swap_check('public.hr_letter_withdraw(uuid)',
  $q$AND NOT EXISTS (SELECT 1 FROM public.member_memo_audiences a WHERE a.memo_id = v_letter.memo_id) THEN$q$,
  $q$AND NOT EXISTS (SELECT 1 FROM public.member_memo_audiences a WHERE a.memo_id = v_letter.memo_id)
     AND NOT EXISTS (SELECT 1 FROM public.hr_person_letters h
                      WHERE h.memo_id = v_letter.memo_id AND h.withdrawn_at IS NULL AND h.member_hidden_at IS NOT NULL) THEN$q$);

-- ── 7. Who may call them ────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.hr_drive_audit_hide(text, uuid), public.hr_drive_barrier_above(uuid), public.hr_drive_member_sees_any(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_drive_audit_hide(text, uuid), public.hr_drive_barrier_above(uuid), public.hr_drive_member_sees_any(uuid)
  TO service_role;

DO $guard$
BEGIN
  IF has_function_privilege('anon', 'public.hr_drive_copy_plan(text, uuid, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.hr_drive_copy_plan(text, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'the copy plan is not a signed-in session''s alone';
  END IF;
  IF has_function_privilege('authenticated', 'public.hr_drive_orphans(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_drive_audit_hide(text, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_drive_barrier_above(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_drive_member_sees_any(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a helper is open to sessions';
  END IF;
  IF to_regprocedure('public.hr_doc_readable_by_hr(text)') IS NOT NULL OR to_regprocedure('public.hr_drive_copy_plan(text, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'an old signature is still there';
  END IF;
  IF strpos((SELECT qual FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'hr_documents_read'), 'owner_id') = 0 THEN
    RAISE EXCEPTION 'the bucket''s read does not know an unrecorded object''s owner';
  END IF;
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hr_drive()'::regprocedure), 'barred') = 0
     OR strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hr_personal_documents(uuid,boolean)'::regprocedure), 'barred') = 0 THEN
    RAISE EXCEPTION 'a lock is not a barrier in the reads';
  END IF;
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.member_admin_snapshot()'::regprocedure), 'hr_person_letters') = 0
     OR strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hr_letter_withdraw(uuid)'::regprocedure), 'member_hidden_at') = 0 THEN
    RAISE EXCEPTION 'a kept-back letter is not Documentation''s';
  END IF;
END
$guard$;
