-- Server-side log of every paid AI call (Anthropic generation, OpenAI transcription).
-- Written only by Edge Functions with the service role; no client policies = invisible to users.
-- Used to enforce the limits in app_config before each call.

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  quote_version_id uuid references public.quote_versions(id) on delete set null,
  kind text not null check (kind in ('generate', 'transcribe')),
  model text,
  input_tokens int,
  output_tokens int,
  audio_seconds numeric,
  created_at timestamptz not null default now()
);
alter table public.ai_usage enable row level security;
create index ai_usage_created_idx on public.ai_usage (created_at);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at);
create index ai_usage_quote_idx on public.ai_usage (quote_id);

insert into public.app_config (key, value) values
  ('limit_generations_per_quote', '5'),
  ('limit_generations_per_user_day', '12'),
  ('limit_generations_total_day', '40'),
  ('limit_audio_minutes_per_quote', '15')
on conflict (key) do nothing;

update public.app_config set value = 'claude-sonnet-5-5', updated_at = now() where key = 'ai_model';
