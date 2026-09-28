-- Open sign-up: anyone can log in with their email (magic link).
-- Removes the allowed_emails gate. Profile auto-creation (on_auth_user_created) is kept.
-- Privacy is unaffected: RLS still limits every user to their own rows.

drop trigger if exists gate_auth_user on auth.users;
drop function if exists public.gate_new_user();
drop table if exists public.allowed_emails;
