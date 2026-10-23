-- ============================================================================
-- 20261024235300_talent_bank_reasons_managed.sql
-- Hiring › Talent Bank: the reasons are HR's to manage, as the file types are
-- (2026-10-24 — asked whether HR should add, rename and turn off the reasons
-- like File types, the user: "1, yes do with same").
-- ============================================================================
--
-- The five reasons of 20261024233700 become rows of `hiring_bank_reasons`,
-- their keys kept (not_shortlisted, failed_interview, not_right_now,
-- declined_offer, other) — so every talent's `reason` and the stage's default
-- (`hiring_out_reason`) still name them. `hiring_talents.reason` names a row
-- (a foreign key in place of the five-value CHECK).
--
-- As File types (mig 20261011210000):
--   * Form settings lists them, each with how many people in the bank have it;
--     ✎ renames (`hiring_bank_reason_rename` — a name another has is refused),
--     On / Off (`hiring_bank_reason_set_active`) — never the last one on;
--   * "+ Add a new reason…" in a reason picker, and Form settings' "+ Add
--     reason" (`hiring_bank_reason_add`): a name one already has (turned off or
--     not) is that one, turned back on;
--   * a reason turned off leaves the pickers; the people kept with it keep it
--     and show it; nobody new is given it (`hiring_reason_check`: "X is turned
--     off — pick another reason."). The database's own default, used only
--     when an older page sends no reason, is kept as the stage says.
--   * no reason is removed (a used one never, an unused one is turned off).
--
-- As every Hiring table: RLS on, no policy, nothing granted; read through
-- hiring_board() (`talentReasons`), written by the functions below (Edit),
-- `audit_register`ed under People {hiring}. The two helpers made again are this
-- day's own (md5 checked first); hiring_board() has one span added.

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

CREATE OR REPLACE FUNCTION pg_temp.body_is(p_sig regprocedure, p_md5 text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_md5 text := (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_sig);
BEGIN
  IF v_md5 IS DISTINCT FROM p_md5 THEN
    RAISE EXCEPTION '%: its body is % now, not % — production changed since this migration was written', p_sig, v_md5, p_md5;
  END IF;
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

SELECT pg_temp.body_is('public.hiring_reason_label(text)', 'bdedb99e7569cd65e9df2004033415e0');
SELECT pg_temp.body_is('public.hiring_reason_check(text)', 'b7f86db9b777010743109ddbd4c09de3');

-- ── 1. The reasons, a list HR keeps ─────────────────────────────────────────

CREATE TABLE public.hiring_bank_reasons (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  sort integer NOT NULL DEFAULT 0,
  retired_at timestamptz,
  retired_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id)
);
CREATE UNIQUE INDEX hiring_bank_reasons_name_key ON public.hiring_bank_reasons (lower(btrim(name)));
ALTER TABLE public.hiring_bank_reasons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hiring_bank_reasons FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.hiring_bank_reasons IS
  'Why somebody is kept in the Talent Bank (2026-10-24): the five it began with keep their keys (the stage''s default names them), HR adds, renames and turns off more in Form settings. Read through hiring_board(), written by hiring_bank_reason_add / _rename / _set_active.';
SELECT public.audit_register('hiring_bank_reasons', 'Talent Bank reasons', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{name}');

INSERT INTO public.hiring_bank_reasons (id, name, sort) VALUES
  ('not_shortlisted', 'Not shortlisted', 1),
  ('failed_interview', 'Failed interview', 2),
  ('not_right_now', 'Not right now', 3),
  ('declined_offer', 'Declined offer', 4),
  ('other', 'Other', 5);

-- A talent's reason names a row of the list (the five-value CHECK goes).
ALTER TABLE public.hiring_talents DROP CONSTRAINT hiring_talents_reason;
ALTER TABLE public.hiring_talents ADD CONSTRAINT hiring_talents_reason
  FOREIGN KEY (reason) REFERENCES public.hiring_bank_reasons(id);
COMMENT ON COLUMN public.hiring_talents.reason IS
  'Why they are kept in the Talent Bank: a row of hiring_bank_reasons (2026-10-24). Null: kept before it was asked.';

-- The words of a reason: its name in the list.
CREATE OR REPLACE FUNCTION public.hiring_reason_label(p_reason text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN coalesce((SELECT r.name FROM public.hiring_bank_reasons r WHERE r.id = p_reason), coalesce(p_reason, ''));
END
$function$;

-- A reason handed in: one of the list's, and on — else refused in words.
CREATE OR REPLACE FUNCTION public.hiring_reason_check(p_reason text)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  r public.hiring_bank_reasons;
BEGIN
  IF p_reason IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO r FROM public.hiring_bank_reasons WHERE id = p_reason;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pick why they are kept.' USING ERRCODE = '22023';
  END IF;
  IF r.retired_at IS NOT NULL THEN
    RAISE EXCEPTION '% is turned off — pick another reason.', r.name USING ERRCODE = '22023';
  END IF;
END
$function$;

-- ── 2. HR keeps the list ────────────────────────────────────────────────────

-- + Add reason / "+ Add a new reason…": the reason of that name — made if new, turned back on if it was off.
CREATE FUNCTION public.hiring_bank_reason_add(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_id text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the reason.' USING ERRCODE = '22023';
  END IF;
  SELECT r.id INTO v_id FROM public.hiring_bank_reasons r WHERE lower(btrim(r.name)) = lower(v_name);
  IF v_id IS NOT NULL THEN
    -- A reason turned off comes back when it is named again.
    UPDATE public.hiring_bank_reasons SET retired_at = NULL, retired_by = NULL WHERE id = v_id AND retired_at IS NOT NULL;
    RETURN v_id;
  END IF;
  BEGIN
    INSERT INTO public.hiring_bank_reasons (name, sort, created_by)
    VALUES (v_name, coalesce((SELECT max(r.sort) FROM public.hiring_bank_reasons r), 0) + 1, auth.uid())
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT r.id INTO v_id FROM public.hiring_bank_reasons r WHERE lower(btrim(r.name)) = lower(v_name);
  END;
  RETURN v_id;
END
$function$;

-- Form settings › ✎: a new name; the people kept with it read it at once.
CREATE FUNCTION public.hiring_bank_reason_rename(p_reason text, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reason public.hiring_bank_reasons;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/hiring/requests'], ARRAY['hiring.edit']);
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_reason FROM public.hiring_bank_reasons WHERE id = p_reason FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That reason is not there any more' USING ERRCODE = '22023'; END IF;
  IF length(v_name) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Name the reason.' USING ERRCODE = '22023'; END IF;
  IF v_name IS NOT DISTINCT FROM v_reason.name THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.hiring_bank_reasons r WHERE lower(btrim(r.name)) = lower(v_name) AND r.id IS DISTINCT FROM p_reason) THEN
    RAISE EXCEPTION 'That reason is already there.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hiring_bank_reasons SET name = v_name WHERE id = p_reason;
END
$function$;

-- Form settings › On / Off: off leaves the pickers, the people kept with it keep it. Never the last one on.
CREATE FUNCTION public.hiring_bank_reason_set_active(p_reason text, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reason public.hiring_bank_reasons;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/hiring/requests'], ARRAY['hiring.edit']);
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_reason FROM public.hiring_bank_reasons WHERE id = p_reason FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That reason is not there any more' USING ERRCODE = '22023'; END IF;
  IF p_active IS NULL OR p_active = (v_reason.retired_at IS NULL) THEN RETURN; END IF;
  IF NOT p_active AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_reasons r WHERE r.retired_at IS NULL AND r.id <> p_reason) THEN
    RAISE EXCEPTION 'Keep at least one reason on.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hiring_bank_reasons
     SET retired_at = CASE WHEN p_active THEN NULL ELSE now() END,
         retired_by = CASE WHEN p_active THEN NULL ELSE auth.uid() END
   WHERE id = p_reason;
END
$function$;

-- ── 3. The board answers the list ───────────────────────────────────────────

SELECT pg_temp.swap_check('public.hiring_board()',
  $$FROM public.hiring_file_types t),$$,
  $$FROM public.hiring_file_types t),
    'talentReasons', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'active', x.retired_at IS NULL,
        'used', (SELECT count(*) FROM public.hiring_talents ht WHERE ht.reason = x.id AND ht.removed_at IS NULL))
        ORDER BY x.sort, x.created_at), '[]'::jsonb) FROM public.hiring_bank_reasons x),$$);

-- ── 4. Who may call what ────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.hiring_bank_reason_add(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_reason_rename(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_reason_set_active(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hiring_bank_reason_add(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hiring_bank_reason_rename(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hiring_bank_reason_set_active(text, boolean) TO authenticated, service_role;
-- The two helpers stay the functions' alone (CREATE OR REPLACE keeps their grants; said again).
REVOKE ALL ON FUNCTION public.hiring_reason_label(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_reason_check(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hiring_reason_label(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hiring_reason_check(text) TO service_role;

-- Form settings' two ask its page, as the file types' do (Add is offered on the request's page and the Talent Bank too).
SELECT pg_temp.tab_guard('public.hiring_bank_reason_rename(text, text)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_bank_reason_set_active(text, boolean)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
