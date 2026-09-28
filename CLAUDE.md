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
- `allowed_emails` (server-only) — sign-up is blocked by a DB trigger unless the email is listed.
- `profiles` (id = auth user id; auto-created on first login) — company_name, legal_form, vat_number, address, phone, email, logo_path, accent_color, onboarding_answers jsonb, method_notes, onboarding_completed.
- `default_price_items` (read-only) — starter "a punto" price list.
- RPC `init_my_price_items()` — copies defaults into the user's `price_items`; returns rows inserted.
- `price_items` (user_id, code, name, category, unit, price_eur, includes_material, notes, sort_order).
- `discounts` (user_id, brand, discount_pct, source).
- `catalogue` (read-only, ~24k rows) — marca, codice, ean, serie, descrizione, prezzo_listino_eur, unita, categoria, fonte.
- `quotes` (user_id, quote_number, client_name, client_address, job_title, status 'bozza'|'inviato', selected_tier 'base'|'media'|'top').
- `quote_versions` (quote_id, user_id, version, input_text, transcripts jsonb, clarifications jsonb, feedback, ai_output jsonb, totals jsonb, rating -1|1, rating_comment).
- `quote_files` (quote_id, user_id, storage_path, file_name, mime_type, kind).
- `edits_log` (user_id, quote_version_id, line_ref, before, after).
- `app_config` (server-only key/value): `ai_model`, `transcription_model`, `system_prompt`.
- Storage buckets (private): `logos`, `quote-files`, `audio`. Path must start with the user id: `{user_id}/...`.

`user_id` columns default to `auth.uid()` — don't send it from the client.
Write TypeScript types in `src/types/db.ts` matching the above (Gio can provide generated types if needed).
If a schema change is needed: write the SQL in `supabase/migrations/YYYYMMDDHHMM_name.sql`, **don't assume it is applied**, and tell Gio clearly "serve una modifica al database" so it can be applied.

## Edge Functions
- Code lives in `supabase/functions/<name>/index.ts` (+ `deno.json` if needed). Deployment is done outside this repo — tell Gio which function changed.
- Read `app_config` with the service role client; read user data with a client created from the caller's JWT.

## Workflow
- Work one task at a time, as given by Gio. Small, focused commits on `main`.
- Don't build features from later tasks early.
