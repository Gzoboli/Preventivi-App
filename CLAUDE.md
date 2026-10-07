# CLAUDE.md — Preventivi App

AI quoting tool for Italian electricians. Proof of concept, 3–5 testers, built to become the real product later: write clean, standard, maintainable code.
Product spec: `SPEC.md`. The owner (Gio) is not a developer: after every task, end with a short **Italian** summary of what changed and exactly how to test it (phone + desktop).

## Stack
- Frontend: Vite + React + TypeScript + Tailwind CSS + React Router. Deployed on Vercel from `main`.
- Backend: Supabase (Postgres, Auth, Storage, Edge Functions in Deno/TypeScript) with `@supabase/supabase-js` v2.
- PDF: `@react-pdf/renderer`. Icons: `lucide-react`. Font: Inter.
- No other UI framework, state library or backend unless really needed.

## Environment
- Frontend env vars (Vercel + `.env.local`, never committed): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Commit a `.env.example`.
- Edge Function secrets (already set in Supabase): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

## Non-negotiable rules
1. **API keys never in the frontend.** All calls to Anthropic/OpenAI happen only in Edge Functions.
2. **Privacy:** every electrician sees only their own data. RLS is already enforced in the DB; never use the service role key in the frontend, never bypass RLS. Edge Functions must verify the user's JWT and act only on that user's rows.
3. **The app calculates money, not the AI.** Totals, IVA, tiers are computed in code from quantities and the electrician's prices. The AI returns structured JSON only.
4. **All UI text in Italian.** Code, comments and commits in English. EUR, Italian formatting (1.234,56 €) via `Intl.NumberFormat('it-IT')`.
5. **Responsive:** phone (one hand, touch targets ≥ 48px) and desktop (use the width: two columns where useful).
6. **Design:** white background, dark grey text, accent `#1F5EFF`, amber for "da confermare". Calm and practical. No gradients, no decorative blobs, no cards inside cards. One obvious primary action per screen.
7. Handle errors in plain Italian ("Qualcosa non ha funzionato, riprova"), with loading states for every AI call.

## Database — already exists, do NOT recreate
Managed from outside this repo (via the Supabase connector). Tables in `public`:
- `profiles` (id = auth user id; auto-created on first login — sign-up is open, anyone with an email can log in) — company_name, legal_form, vat_number, address, phone, email, logo_path, accent_color, onboarding_answers jsonb, method_notes, onboarding_completed.
- `default_price_items` (read-only) — starter "a punto" price list.
- RPC `init_my_price_items()` — copies defaults into the user's `price_items`; returns rows inserted.
- `price_items` (user_id, code, name, category, unit, price_eur, includes_material, notes, sort_order).
- `discounts` (user_id, brand, discount_pct, source).
- `catalogue` (read-only, ~24k rows) — marca, codice, ean, serie, descrizione, prezzo_listino_eur, unita, categoria, fonte.
- `quotes` (user_id, quote_year + quote_number — per user per year, set by trigger; client_name, client_address, job_title, status 'bozza'|'inviato', selected_tier 'base'|'media'|'top' (media shown as "Consigliata"), vat_rate 4|10|22, estimated_days, show_unit_prices, job_sheet jsonb "Scheda lavoro", phase 'raccolta'|'pronto_da_generare'|'generato'|'in_revisione', ai_run_started_at = AI run lease, stale after 5 min).
- `quote_messages` (one chat per quote: role electrician|assistant|system, kind text|voice|file|questions|method_proposal|proposal|quote_ready|note, text, audio_file_id, file_ids[], payload jsonb, quote_version_id). RLS + Realtime.
- `quote_versions` (quote_id, user_id, version, status 'processing'|'needs_answers'|'ready'|'error', error_message, run_started_at (step lease), input_text, transcripts jsonb, clarifications jsonb, feedback, ai_output jsonb, totals jsonb, rating -1|1, rating_comment, updated_at). Realtime enabled.
- `series_uplift` (read-only) — marca, serie, tier_hint, uplift_per_point_eur, plate_style, short_description.
- `ai_usage` (server-only) — log of every paid AI call, used to enforce the limits in `app_config`.
- `quote_files` (quote_id, user_id, storage_path, file_name, mime_type, kind).
- `edits_log` (user_id, quote_version_id, line_ref, before, after).
- `app_config` (server-only key/value): `ai_model`, `ai_effort`, `transcription_model`, `system_prompt` (old), `system_prompt_v2` (Task 3b, used now), `limit_generations_per_quote`, `limit_generations_per_user_day`, `limit_generations_total_day`, `limit_audio_files_per_quote`.
- Storage buckets (private): `logos`, `quote-files`, `audio`. Path must start with the user id: `{user_id}/...`.

`user_id` columns default to `auth.uid()` — don't send it from the client.
Write TypeScript types in `src/types/db.ts` matching the above (Gio can provide generated types if needed).
If a schema change is needed: write the SQL in `supabase/migrations/YYYYMMDDHHMM_name.sql`, **don't assume it is applied**, and tell Gio clearly "serve una modifica al database" so it can be applied.

## Edge Functions
- Code lives in `supabase/functions/<name>/index.ts` (+ `deno.json` if needed). Pure logic shared with the app (questions, answers, totals, AI schema) lives in `supabase/functions/_shared/` and is imported by both. Deployment is done outside this repo — tell Gio which function changed.
- Read `app_config` with the service role client; read user data with a client created from the caller's JWT.

## Workflow
- Work one task at a time, as given by Gio. Small, focused commits on `main`.
- Don't build features from later tasks early.

## Working protocol
Work **autonomously**. Gio only wants to be involved in macro decisions, not in every step.

1. **Just start.** At the start of a task, write a short plan (what, which files, risks) and carry on immediately — do not wait for an "ok". Process actions (commit, push, build, dev tooling, reading the DB, screenshots) never need permission.

2. **Stop and ask only for macro decisions:** database schema changes, security/access model, deleting user data or existing features, new paid services, changing the AI flow, or a real product choice the task/SPEC does not answer. Everything else: pick the sensible option, note it in the report, keep going.

3. **Small steps.** Split each task into 2–4 steps. After each step: `npm run build` (includes type-check) and `npm test`. Fix every error before moving on.

4. **Check before you say it's done.** At the end, go through the task's "Done when" list point by point and mark each one ✅ or ❌ with a reason. Re-read your own diff looking for bugs, unhandled errors, API keys or the service role key in the frontend, and missing Italian text.

5. **Raise problems, don't hide them.** If something doesn't work, isn't clear, or you had to simplify, say so plainly in an "⚠️ Problemi aperti" section. Never say "fatto" if something is missing.

6. **One task at a time.** Never start the next task on your own.

7. **Final report in Italian**, always in this format:

   - Cosa ho fatto
   - Come provarlo (telefono e computer, passo per passo)
   - ✅/❌ Checklist "Done when"
   - ⚠️ Problemi aperti e decisioni da prendere
   - Cosa serve da Gio (es. pubblicare una funzione, modifiche al database)
   - Domande per gli elettricisti: anything only a real electrician can answer (prices, habits, how they present quotes) that would improve the output. Short, numbered, ready to forward. Gio collects them and brings the answers back.
