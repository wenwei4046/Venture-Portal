-- A cold lead template says its language and its kind (2026-11-04; the owner, a Chinese template listed in WhatsApp
-- Manager as English: "为什么这边是英文？在crm 没得选中英", then "而且是不是能选它是营销还是实用性这一类的 … 是否也需要加到
-- crm 中？" — "先做但不用上线"). crm_templates.language and .category were always their defaults ('en', 'MARKETING',
-- 20261011140000) and nothing set them, so every template went to Meta as an English marketing one.
--
-- A SIX-argument crm_save_template(…, p_language, p_category) — production's four-argument body (md5
-- 8b9e24d593fd9812825d90c8e75997b7) with the two added: English ('en') or Chinese ('zh_CN'), Marketing or Utility, as
-- Meta names them. A template already with Meta whose language or kind changes is a new draft, as one whose words change:
-- Meta never changes a reviewed template's language, and a kind it decided is not undone by asking again. The four-argument
-- function stays as it is, for a page opened before the release (it keeps both). No defaults, so no call matches both.

create or replace function public.crm_save_template(p_id uuid, p_name text, p_channel text, p_body text, p_language text, p_category text)
returns public.crm_templates language plpgsql security definer set search_path = public as $$
declare t crm_templates;
begin
  if not public.crm_manages() then perform crm_deny('write templates'); end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_body), '') = '' then raise exception 'Give the template a name and a message.' using errcode = '22023'; end if;
  if length(trim(p_body)) > 1024 then raise exception 'A template message can be up to 1,024 characters.' using errcode = '22023'; end if;
  if coalesce(p_channel, '') not in ('whatsapp', 'messenger') then raise exception 'Choose WhatsApp or Messenger.' using errcode = '22023'; end if;
  if coalesce(p_language, '') not in ('en', 'zh_CN') then raise exception 'Choose English or Chinese.' using errcode = '22023'; end if;
  if coalesce(p_category, '') not in ('MARKETING', 'UTILITY') then raise exception 'Choose Marketing or Utility.' using errcode = '22023'; end if;
  if p_id is null then
    insert into crm_templates (name, channel, body, language, category, created_by, updated_by)
      values (trim(p_name), p_channel, trim(p_body), p_language, p_category, crm_me(), crm_me()) returning * into t;
  else
    update crm_templates set name = trim(p_name), channel = p_channel, body = trim(p_body), language = p_language, category = p_category,
      status = case when body = trim(p_body) and channel = p_channel and language = p_language and category = p_category then status else 'draft' end,
      is_on = case when body = trim(p_body) and channel = p_channel and language = p_language and category = p_category then is_on else false end,
      meta_name = case when body = trim(p_body) and channel = p_channel and language = p_language and category = p_category then meta_name else null end,
      meta_id = case when body = trim(p_body) and channel = p_channel and language = p_language and category = p_category then meta_id else null end,
      reject_reason = case when body = trim(p_body) and channel = p_channel and language = p_language and category = p_category then reject_reason else null end,
      updated_by = crm_me(), updated_at = now()
     where id = p_id returning * into t;
    if t.id is null then raise exception 'That template is gone. Reload.' using errcode = 'P0002'; end if;
  end if;
  return t;
end $$;

revoke all on function public.crm_save_template(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.crm_save_template(uuid, text, text, text, text, text) to authenticated;
