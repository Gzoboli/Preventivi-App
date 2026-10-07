-- Task 3b: one AI run at a time per quote (conversation, generate, revise, apply).
-- The edge function claims the quote by setting ai_run_started_at; a run older than
-- 5 minutes is considered dead (the function is killed after 150 s) and can be reclaimed.
alter table public.quotes add column if not exists ai_run_started_at timestamptz;

-- Pilot limits (Gio, Task 3b): every AI call counts, transcriptions excluded.
update public.app_config set value = '20' where key = 'limit_generations_per_quote';
update public.app_config set value = '30' where key = 'limit_generations_per_user_day';
update public.app_config set value = '150' where key = 'limit_generations_total_day';
-- Voice answers on every question card: more voice notes per quote (transcription is cheap).
update public.app_config set value = '30' where key = 'limit_audio_files_per_quote';
