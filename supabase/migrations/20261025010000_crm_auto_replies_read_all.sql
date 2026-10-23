-- View as a team member shows that person's auto-replies, read only (2026-10-24; the owner, viewing ANTHONY's CRM: "as member
-- 時，是無法看到他們設的auto reply嗎？" → "View as 时读被查看的那个人的设定，只看不能改"). crm_auto_replies was each person's
-- own (crm_auto_replies_own), so View as drew the viewer's own settings under the other person's name. Whoever sees everybody's
-- CRM (CRM · View at All — crm_sees_all(), reading only) now reads everybody's; nobody may write another's (there is still no
-- write policy: crm_save_auto_replies writes the caller's own row). The app picks the viewed person's row (crm-data.ts).
create policy crm_auto_replies_read_all on public.crm_auto_replies
  for select to authenticated using ((select public.crm_sees_all()));
