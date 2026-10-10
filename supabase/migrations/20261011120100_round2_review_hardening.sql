-- ============================================================================
-- 20261011120100_round2_review_hardening.sql
-- The HR revamp's second package, after its independent security review
-- (2026-10-11; `.design/hr-r2/review-security.md`, findings L4, L5, N7).
-- ============================================================================
--
-- 1. (L4) Hiring's and Documentation's 16 tables kept Supabase's default
--    client grants (SELECT … TRUNCATE to anon and authenticated). Row level
--    security with no policy already shuts the REST API, and every read and
--    write is one of the modules' SECURITY DEFINER functions (they run as their
--    owner — untouched by this) — so the grants only ever widened what a stray
--    policy or a switched-off RLS would expose. Taken back, as Meeting Rooms'
--    and the guest link's tables never had them.
-- 2. (L5) Member services' snapshot (`member_admin_snapshot`) listed every memo
--    to whoever manages memos — Documentation's letters to one person
--    (Warning, Increment, Offer) among them. A memo addressed to PEOPLE is
--    Documentation's now: one statement swapped into production's body leaves
--    it out (Member services has not published memos since #276). Their
--    history opens to Documentation, in People, and the memos' history shows
--    each by its title again (the Documentation migration's re-registration
--    had dropped it).
-- 3. (N7) A file a member reads (`hr_file_readable_by_member`, the storage
--    policy's helper) now also asks that their ACCOUNT is active — a
--    switched-off account's session, while it lives, signs no file.
--
-- Function changes swap one statement each into PRODUCTION's body (read off
-- pg_proc on 2026-10-11: member_admin_snapshot md5 7c8798db…,
-- hr_file_readable_by_member d3bc2324…); the swap refuses if production
-- changed since. Owners, grants, volatility and every other statement stay.

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

-- ── 1. The client grants ─────────────────────────────────────────────────────

REVOKE ALL ON
  public.hiring_requests, public.hiring_request_events, public.hiring_candidates, public.hiring_form_fields,
  public.hiring_sources, public.hiring_candidate_fields, public.hiring_talents, public.hiring_talent_events,
  public.hr_documents, public.hr_document_events, public.hr_document_seen, public.hr_letter_types,
  public.hr_publish_types, public.hr_person_letters, public.hr_letter_events, public.member_memo_recipients
FROM anon, authenticated;

REVOKE ALL ON SEQUENCE
  public.hiring_request_events_id_seq, public.hiring_request_no_seq, public.hiring_talent_events_id_seq,
  public.hiring_talent_no_seq, public.hr_document_events_id_seq, public.hr_document_ref_seq,
  public.hr_letter_events_id_seq, public.hr_letter_ref_seq
FROM anon, authenticated;

-- ── 2. Member services leaves Documentation's letters out ─────────────────────

SELECT pg_temp.swap_check('public.member_admin_snapshot()',
  $q$FROM public.member_memos m WHERE v_memos));$q$,
  $q$FROM public.member_memos m WHERE v_memos
 AND NOT EXISTS(SELECT 1 FROM public.member_memo_recipients x WHERE x.memo_id=m.id)));$q$);

SELECT public.audit_register('member_memos', 'Memos', 'People', '{documentation}', 'all', p_labels => '{title}');
SELECT public.audit_register('member_memo_recipients', 'Memo recipients', 'People', '{documentation}', 'all');

-- ── 3. A member's file: an active account's ───────────────────────────────────

SELECT pg_temp.swap_check('public.hr_file_readable_by_member(text)',
  $q$FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active' LIMIT 1;$q$,
  $q$FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active'
     AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_active) LIMIT 1;$q$);
