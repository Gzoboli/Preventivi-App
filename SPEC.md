# SPEC — Preventivi App (proof of concept)

AI quoting tool for Italian electricians. 3–5 testers. Product spec; see CLAUDE.md for rules and architecture.

## 1. Foundation

**Language:** all UI text in Italian. Currency EUR, Italian number format (1.234,56 €).

**Devices:** fully responsive. Used on phone at the client's home (one hand, big touch targets ≥ 48px) AND on desktop at home in the evening (use the extra width: two columns where useful).

**Design direction:** a practical site tool, calm and professional. White background, dark grey text, one strong accent colour (electric blue #1F5EFF), one warning colour (amber) for items "da confermare". Large readable type (Inter). No gradients, no decorative blobs, no cards inside cards. Every screen has one obvious primary action.

**Backend:** Supabase (already created, see CLAUDE.md).

**Auth:** email magic link only, no passwords. Open sign-up: anyone can enter their email, receive the link and log in.

**Privacy (critical):** every table has Row Level Security. Each electrician can only ever see and edit their own data. Nobody else, not even other testers.

**Database tables:**
- `profiles` — one per electrician: company name, legal form, P.IVA, address, phone, email, logo (storage), accent colour, onboarding answers (jsonb), "il mio metodo" free text, onboarding_completed (bool)
- `price_items` — per electrician: code, name, category, unit, price_eur, includes_material (bool), notes
- `catalogue` — shared, read-only: brand, code, series, description, list_price_eur, unit, category (I will import a CSV of ~24.000 rows)
- `discounts` — per electrician: brand, discount_pct
- `quotes` — per electrician: client name, client address, job title, status (bozza / inviato), created_at
- `quote_versions` — quote_id, version number (1,2,3…), input text, transcripts, feedback text, ai_output (jsonb), totals (jsonb), created_at
- `quote_files` — quote_id, file (storage), file type, uploaded_at
- `edits_log` — every manual change the electrician makes to a line (before / after), for learning
- `app_config` — key/value: ai_model, transcription_model, system_prompt (so I can change AI behaviour without touching code)



---

## 2. Onboarding "Il tuo metodo"

A short onboarding (welcome + 4 screens, ~2 minutes). Everything else starts from the usual values and is editable in "Il mio metodo". Previous 14-question version archived in `docs/archive/onboarding-v1.md`. Implemented in `src/lib/onboarding/questions.ts`.

**Principles:** ask only what an electrician can answer in seconds and what really changes the quote. No "Consigliato" labels: the usual answer is simply pre-selected. **Every question has "Altro…"** with a text field (saved and passed to the AI). Answers saved immediately in `profiles.onboarding_answers[questionId]` as `{ value, source: 'user' | 'default', custom_text? }`; progress in `onboarding_answers._meta` (`postponed`, `step`).

**Flow**
- On login, if `onboarding_completed = false` and never postponed → onboarding; otherwise Home.
- Top: progress bar, "N di 4", **"Finisco dopo"** (saves, goes to Home). Bottom: "Indietro" / "Avanti".
- Home shows "Completa il tuo metodo · mancano X domande" until completed → resumes where they left. Quotes can be created before finishing (unanswered = usual values).
- At the end: `init_my_price_items()` if needed, `onboarding_completed = true`, summary screen.

### Benvenuto
> **Ciao! Prima di iniziare, 2 minuti per conoscerti.** + the privacy (green) and "Cosa sa già l'app?" (grey) boxes. [Iniziamo] · Lo faccio dopo

### Screens (pre-selected value in brackets)
1. `q2` **Come fai di solito il prezzo per i privati?** — A punto, tutto compreso · A ore + materiale a parte · A punto l'impianto, a ore il resto · Altro… [a punto]
2. `q3` **La tua tariffa oraria?** — 30 · 40 · 50 · 60 € · Altro… [60] and `q4` **Tariffa oraria dell'aiutante?** — Non ho aiutante · 20 · 25 · 30 € · Altro… [25] (same screen)
3. If per point / mixed → `q5` **Quanto fai pagare di solito?** ("Materiale compreso, IVA esclusa. Rispondi solo a quelle che sai…"). One row per common civil item, each with 4 specific amounts + **Non so** [pre-selected] + **Altro…** (exact € typed):
   Presa 10A/bipresa 28·32·36·40 · Punto comando 25·29·33·37 · Punto luce 15·18·22·26 · Presa TV 38·44·50·56 · Presa dati (RJ45) 38·44·50·56 · Predisposizione condizionatore 90·110·130·150 · Linea dedicata cucina 80·100·120·150 · Quadro appartamento 220·250·300·350 · Videocitofono (posto interno, installazione) 120·150·200·250 · Dichiarazione di conformità 200·250·300·350.
   The app turns them into the price list: the matching item gets the price, related items scale by the same ratio **from the starter prices** (presa → presa universale; comando → bipolare, pulsante; quadro → centralino, generale, magnetotermici); items missing from the starter list are created (presa dati, condizionatore, linea cucina, videocitofono). "Non so" changes nothing. ⚠️ Amounts to validate with a real electrician.
   If hourly → `q5m` **Quanto ricarichi sul materiale?** — Niente · 10% · 20% · 30% · Altro… [20%]
4. `q6` **Che sconto hai dal grossista sul listino?** — Non so · 40% · 45% · 50% · Altro… [Non so = 46% medio]. Same value written to `discounts` for Vimar, BTicino, Schneider.

### Fine
> **Fatto! Ecco il tuo metodo.** Summary: Prezzo · Tariffa (+ aiutante) · I tuoi prezzi · Sconto. "IVA, pagamenti, validità ed esclusioni sono già impostati con i valori più comuni…" [Crea il primo preventivo]

### "Il mio metodo" (`/metodo`), two columns on desktop
- **Come lavori**: the 4 topics above, each row opens the same screen in edit mode.
- **Altre impostazioni** (not asked at sign-up, usual values): IVA `q10` [10%] · Validità `q11` [60 giorni] · Pagamenti `q12` [20% tubazioni, 20% cavi, saldo] · Esclusi `q13` [all four] · Serie Base/Consigliata/Top `q7` [Vimar Plana/Arké/Eikon] · Linee `q8` [scatole per stanza] · Livello CEI 64-8 `q9` [Livello 1] · Lavori `q1` [rifacimenti, civili nuovi]. All with "Altro…".
- **Il mio listino**: full editable price table (±5/10%, add/remove items).
- **Altro che dovremmo sapere su come lavori**: free text → `profiles.method_notes`, autosave.
- **I tuoi documenti (facoltativo)**: photos/PDFs → `quote-files/{user_id}/metodo/`, list + remove; later passed to the AI.
- **Dati per il preventivo**: company data, logo, colour (also to be asked when the first PDF is created — §5).

**Starter price list (a punto, IVA esclusa)** — table `default_price_items`:
Interruttore / deviatore / invertitore 29,30 · Interruttore bipolare 36,40 · Pulsante 29,30 · Presa 10A / bipresa 32,00 · Presa universale 36,30 · Presa TV 44,20 · Predisposizione punto luce 18,00 · Scatola di derivazione piccola 30,50 · Scatola di derivazione grande 45,20 · Centralino da incasso 8 moduli 62,00 · Interruttore generale magnetotermico differenziale 84,00 · Magnetotermico singola linea 21,00 · Dichiarazione di conformità su impianto esistente 300,00

### Learning from quotes (to build with §3–§4)
The app keeps learning how each electrician works without long questionnaires:
1. **Every edit is recorded** in `edits_log` (price, quantity, added/removed line).
2. **At most one short question per quote**, never blocking, one tap, dismissable (small bar at the bottom). Examples: changed price → "Questo prezzo vale sempre?" [Sì, sempre] [Solo per questo cliente] ("sempre" updates the price list); removed line → "Di solito non la metti?" [Mai] [Solo qui]; added line → "La metti sempre in lavori così?" [Sì] [No]. Never the same question twice; none while sharing/sending.
3. **Context for the AI**: final versions of recent sent quotes, answers to those short questions, "Il mio metodo" (answers, notes, price list), documents.
4. **"Cosa ho imparato di te"** section in "Il mio metodo": list of learned rules, each removable. ⚠️ Needs a small new table — to be proposed in that task.

---

## 3. New quote + AI

Principle (Gio): quality over speed. The AI **always checks its understanding with the electrician before producing a quote**. Built in Task 3.

### Screen "Nuovo preventivo" (`/preventivi/nuovo` → `/preventivi/:id`)
- The `quotes` row is created at the **first input** (text, recording or file) — no empty drafts; header "Preventivo 2026/001 · Bozza salvata". Text draft kept on the device until generation.
- "Cliente e indirizzo (facoltativo)" collapsed row, optional title (the AI proposes one).
- "Descrivi il lavoro" textarea. Tiles: **Registra** (in-app, MediaRecorder, max 5 min, timer, Stop/Elimina), **Carica vocali** (.ogg .opus .m4a .mp3 .wav .webm, incl. WhatsApp), **Documenti** (any file; the AI reads PDF, images JPEG/PNG/GIF/WebP and text — other files stay attached with a warning).
- Uploads go straight to storage (`audio/{user_id}/{quote_id}/…`, `quote-files/{user_id}/{quote_id}/…`) + `quote_files` rows. Limits: audio 24 MB each, documents 20 MB each.
- IVA chips 10 / 22 / 4 %, preset from "Il mio metodo" (`quotes.vat_rate`).
- "Genera preventivo" enabled with text or at least one voice note.
- Onboarding not finished → "Stiamo usando i valori più comuni per le domande che hai saltato. Completa il tuo metodo".

### Quote numbers
Per electrician and per year (`quotes.quote_year` + `quote_number`, set by a DB trigger): 2026/001, 2026/002…

### Generation — Edge Function `generate-quote`
Supabase Free plan stops a function after 150 s, so the job runs **in steps, one function call each**, chaining itself:
1. The app inserts a `quote_versions` row (`status='processing'`) and calls the function with `{ quote_version_id }`. The function checks the JWT and ownership, answers 202 and works in the background.
2. **Transcription step**: voice notes not yet transcribed (OpenAI, `app_config.transcription_model`, Italian), ~70 s max per call, saved in `transcripts`; WhatsApp `.opus` sent as `.ogg` (same format) automatically.
3. **AI step**: one Anthropic call (`app_config.ai_model` = Claude Sonnet 5.5, adaptive thinking, effort `app_config.ai_effort` = medium, **structured outputs** so the reply always matches the JSON schema), hard cutoff 125 s.
4. A lease (`quote_versions.run_started_at`) prevents two steps of the same version at once; a run that hasn't moved for 6 minutes shows "Sembra che si sia bloccato · Riprova".
5. AI context: "Il mio metodo" as readable Italian (every question with the electrician's answer or the usual value, marked as such; "Altro…" texts; notes), the price list, series per tier + `series_uplift`, the job text, transcripts, clarification Q&A, the job's documents and up to 5 "I tuoi documenti" (per-user only; ≤ 20 MB in total), for V2+ the previous version + feedback.
6. Reply rules (enforced by the schema): first version → first call **must** be `clarify` ("Ho capito così…" + 1–4 questions with options; "Altro…" always available); after 1 round quote or one more round; after 2 rounds a quote.
7. Result saved in `ai_output` (+ `totals` for a quote); status `needs_answers` / `ready`; errors → `status='error'` with a plain Italian `error_message`. Input is never lost.

### Cost limits (server-side, in `app_config`, logged in `ai_usage`)
Checked before every paid call: **5 AI runs per quote**, **12 per electrician per day**, **40 per day for all users**; **8 voice notes per quote**. The app can't bypass them. Recommended extra: a monthly spend limit in the Anthropic console.

### Totals — computed in code (`supabase/functions/_shared/totals.ts`, unit-tested)
- Line price: `kind 'ore'` → hourly rate (own / helper) · price-list code → the electrician's price · not in the list → AI estimate, always **da confermare** (materials: list price − wholesaler discount + markup) · nothing → 0, da confermare.
- Base = Σ lines. Media / Top = Base + switch/socket points × `series_uplift` of the electrician's series for that tier (points = codes INT, INT2P, PULS, PRESA10, PRESAUNI, PRESATV, PRESADATI, or lines the AI marks as points). Missing uplift → shown as "da … €" + "Sovrapprezzo della serie da confermare".
- IVA from `quotes.vat_rate`; changeable after generation (the taxable amount doesn't change).
- `totals = { vat_rate, points, lines[], base, media, top }`, each tier `{ imponibile, iva, totale, to_confirm_count, uplift_missing }`.

### Screens during generation
- **Sto preparando il preventivo**: steps (Trascrivo N vocali · Leggo i documenti · Preparo le voci con i tuoi prezzi · Calcolo le tre opzioni), "Può volerci qualche minuto. Puoi chiudere l'app…"; live via Realtime + 5 s polling.
- **Prima di preparare il preventivo**: "Ho capito così" grey box, one card per question (tappable options + "Altro…"), "Continua", "Correggi la descrizione" (back to the form, same version restarts).
- **Ready**: title, summary, three tier cards, IVA switch, lines by room (da confermare in amber), Ipotesi, Esclusioni, Tempi stimati (Task 4 builds the full review).
- **Error**: message + "Riprova".

### Home
List of quotes (title/client, number, date) with chips: In preparazione… · Ti servono risposte · Pronto · Da riprovare · Bozza.

## 4. Quote review, V2, history

**Screen "Preventivo":**
- Top: client, job title, version selector (V1, V2, V3…), status
- Three tabs/cards: **Base · Media · Top**, each with its total. Selected tier drives the detail below.
- Lines grouped by room (collapsible), each line: description, qty, unit price, total. Qty and price editable inline; every edit saved to `edits_log`. Amber badge on "da confermare".
- Sections: Ipotesi (assumptions), Esclusioni, Tempi stimati
- Bottom fixed bar: **"Cosa cambio?"** text box + voice button → creates V2 by sending previous version + feedback to the same Edge Function
- "Anteprima PDF" button

**Home:** list of quotes (client, job, date, total, status), search, newest first.

---

## 5. PDF + sharing

Generate a **very visual, concise, premium** A4 PDF in Italian, branded with the ELECTRICIAN's logo, details and accent colour (not the app's).

- **Page 1 — Colpo d'occhio:** logo + company header, client, date, quote number. One-sentence summary of the job. Room-by-room overview as icon tiles (icon, room name, number of points). The three tiers as side-by-side cards (series name, short description, total IVA inclusa), the recommended one highlighted. Key info strip: validità, tempi stimati, pagamenti.
- **Page 2+ — Dettaglio:** one clean table per room (voce, q.tà, prezzo, totale), room subtotals, then totals block (imponibile, IVA, totale) for the selected tier.
- **Last page — Condizioni:** esclusioni, ipotesi, pagamenti, validità, dichiarazione di conformità, space for client signature "Per accettazione".

Buttons: **Condividi su WhatsApp** (Web Share API with the PDF file; fallback to download + wa.me link), **Invia per email** (mailto with PDF download), **Scarica PDF**. Sharing sets status to "inviato".
