-- ============================================================================
-- 20261017130000_drop_my_profile.sql
-- One Edit profile (2026-10-17 — the user, asked which of the phone's two Edit profiles to keep: "finance app 他原本
-- 的那个profile就不需要了，帮我删除掉，留new de 就好", and on the computer too).
-- ============================================================================
--
-- The one kept is Me › Profile's: the change goes to HR as a profile request (att_create_request kind 'profile',
-- applied by att_profile_apply once HR approves). The account menu's Edit profile (mig 20261014210000) — the
-- Finance app's Profile row and the desktop account menu's — is gone from the app, and with it the two functions
-- that read and saved one's own name and phone at once: left callable, any sign-in could still change its own name
-- and phone without HR. Nothing else calls them (checked on production 2026-10-17).

DROP FUNCTION IF EXISTS public.update_my_profile(text, text);
DROP FUNCTION IF EXISTS public.my_profile();
