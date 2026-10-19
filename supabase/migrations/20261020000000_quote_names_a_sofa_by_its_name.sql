-- ════════════════════════════════════════════════════════════════════════════
-- The Quote names a sofa by its name alone (2026-10-20)
--
-- The user, asked whether the Revenue app's Quote should lead with a sofa's name
-- the way Product List now does ("5071 AAAA" there until today): "quote show aaaa
-- enough, not need the code". member_catalogue named a sofa with a name by its
-- code and its name ("8030 SOFFIO", "5071 AAAA" — the family a SKU is sold under);
-- from today a named sofa is its name alone ("SOFFIO", "AAAA"), as a mattress is
-- (APEX). A sofa with no name of its own or the ERP's still reads its code.
--
-- Production's body with ONE expression swapped — the sofa branch of `name` —
-- and the comment above it, refused unless production still runs the body
-- 20261019140000 left (md5 7ad51e77…; CLAUDE.md › never CREATE OR REPLACE from a
-- stale copy). The Quote keeps each sofa model apart by its id, never by this
-- name (`catalogFromProducts`), so two sofas named alike stay two models; its
-- search still finds a sofa by its code (the model's `desc`).
-- Run twice it changes nothing.
-- ════════════════════════════════════════════════════════════════════════════

DO $swap$
DECLARE
  v_fn       constant regprocedure := 'public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure;
  v_old      constant text := $s$BTRIM(c.model_code) || ' ' || BTRIM(c.model_name)$s$;
  v_new      constant text := $s$BTRIM(c.model_name)$s$;
  v_old_note constant text := $s$(a sofa's code first: "8030 SOFFIO")$s$;
  v_new_note constant text := $s$(a named sofa by its name alone: "SOFFIO")$s$;
  v_before   constant text := '7ad51e775f94d16c69533b34b496d29e';
  v_after    constant text := '99957d1999e752def202b3d2006ff683';
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_fn;
  IF md5(v_src) = v_after THEN
    RETURN;  -- swapped already
  END IF;
  IF md5(v_src) <> v_before THEN
    RAISE EXCEPTION 'member_catalogue changed on production since 2026-10-19 (md5 %) — re-derive this migration from its live definition', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'member_catalogue: "%" is not there exactly once', v_old;
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old_note, ''))) / length(v_old_note) <> 1 THEN
    RAISE EXCEPTION 'member_catalogue: "%" is not there exactly once', v_old_note;
  END IF;

  -- pg_get_functiondef + replace: owner, grants (service role only), comment and settings stay.
  EXECUTE replace(replace(pg_get_functiondef(v_fn), v_old, v_new), v_old_note, v_new_note);

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_fn;
  IF md5(v_src) <> v_after THEN
    RAISE EXCEPTION 'member_catalogue did not land as written (md5 %)', md5(v_src);
  END IF;
END
$swap$;

NOTIFY pgrst, 'reload schema';
