-- ============================================================================
-- 20261023120000_team_assistant_assigns.sql
-- A TA with people below them assigns too (2026-10-23 — the owner: "ta can assign as well").
-- ============================================================================
--
-- crm_assign_member is a leader's Assign to — Mine's chat, and since the same day the Team side's chat too (the owner:
-- "照「同一套规则」，跟 Mine 一样"): give a customer of one's team to somebody below oneself in it, at once ("只有上級能給
-- 自己的下級", the owner 2026-10-14). It let a TL or an STL only, and only for a team below them (c.team_id in their
-- downline). A TA leads too — on production CHEA HUAN and LAWRENCE have people reporting to them — but is not the top of
-- a team, so neither test could pass. Now:
--   * a TL, an STL or a TA may assign;
--   * a customer within reach: of a team below oneself (as before), or with oneself or somebody below;
--   * to somebody in that team AND below oneself (crm_team_handlers ∩ crm_my_downline): a TL's and an STL's choices are
--     those already — their team is their downline — and a TA's are their own people, never their TL or a peer;
--   * NULL-safe: somebody with no CRM role is refused (NOT IN on a NULL role never fired — CLAUDE.md › a role check must
--     hold for somebody who has NO role), and nobody (p_member NULL) is never "assigned": it took the customer off
--     whoever had it.
-- Production's body (md5 b07634bd092e03dc98dbdb0ef0a1b5da), its two checks rewritten; crm_can('edit', 'own') stays, as
-- crm_keeps_its_permission_checks asks. The grants stand (CREATE OR REPLACE). Running it twice changes nothing.
-- PGlite: tests/member-sql/validate-team-assistant-assigns.mjs.

DO $guard$
DECLARE
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.crm_assign_member(uuid,uuid)'::regprocedure);
BEGIN
  IF md5(v_src) IS DISTINCT FROM 'b07634bd092e03dc98dbdb0ef0a1b5da' AND strpos(v_src, '''stl'', ''ta''') = 0 THEN
    RAISE EXCEPTION 'crm_assign_member changed in production since this migration was written (md5 %)', md5(v_src);
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.crm_assign_member(p_contact uuid, p_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c crm_contacts;
begin
  select * into c from crm_contacts where id = p_contact;
  if c.id is null or c.team_id is null or not public.crm_can('edit', 'own') or coalesce(crm_my_role() not in ('tl', 'stl', 'ta'), true)
     or not (c.team_id in (select crm_my_downline()) or coalesce(c.assigned_to in (select crm_my_downline()), false)) then
    perform crm_deny('assign this customer');
  end if;
  if p_member is null or p_member not in (select crm_team_handlers(c.team_id)) or p_member not in (select crm_my_downline()) then
    raise exception 'They are not in this team.' using errcode = '22023';
  end if;
  update crm_contacts set assigned_to = p_member where id = p_contact;
end $function$;
