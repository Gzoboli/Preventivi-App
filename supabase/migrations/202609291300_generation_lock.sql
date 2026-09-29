-- generate-quote runs in steps (transcription, then AI), each in its own Edge Function call.
-- run_started_at is a lease: a step only starts if no other step holds it (or it is older
-- than the function's wall-clock limit), so a quote can never be processed twice at once.

alter table public.quote_versions add column run_started_at timestamptz;

-- Audio limit by number of files (duration can't be checked reliably server-side).
delete from public.app_config where key = 'limit_audio_minutes_per_quote';
insert into public.app_config (key, value) values
  ('limit_audio_files_per_quote', '8'),
  ('ai_effort', 'medium')
on conflict (key) do nothing;
