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
1. `q15` **Come preferisci fare il prezzo?** — Dipende dal lavoro, proponimelo tu · Sempre a punto · Sempre ore + materiali · Altro… [Dipende]. (Replaced `q2` in Task 3b; an old `q2` answer is still read: a punto → Sempre a punto, a ore → Sempre ore + materiali, misto → Dipende.)
2. `q3` **La tua tariffa oraria?** — 30 · 40 · 50 · 60 € · Altro… [60] · `q4` **Tariffa oraria dell'aiutante?** — Non ho aiutante · 20 · 25 · 30 € · Altro… [25] · `q16` **Di solito chi lavora con te?** — Lavoro da solo · Io + un aiutante · Squadra di 3 o più · Altro… [Io + un aiutante] ("Te lo chiederemo comunque per ogni lavoro.") · `q18` **Quante ore dura la tua giornata in cantiere?** — 7 · 8 · 9 · Altro… [8] (same screen)
3. `q5` **Quanto fai pagare di solito?** ("Materiale compreso, IVA esclusa. Rispondi solo a quelle che sai…"). One row per common civil item, each with 4 specific amounts + **Non so** [pre-selected] + **Altro…** (exact € typed):
   Presa 10A/bipresa 28·32·36·40 · Punto comando 25·29·33·37 · Punto luce 15·18·22·26 · Presa TV 38·44·50·56 · Presa dati (RJ45) 38·44·50·56 · Predisposizione condizionatore 90·110·130·150 · Linea dedicata cucina 80·100·120·150 · Quadro appartamento 220·250·300·350 · Videocitofono (posto interno, installazione) 120·150·200·250 · Dichiarazione di conformità 200·250·300·350.
   The app turns them into the price list: the matching item gets the price, related items scale by the same ratio **from the starter prices** (presa → presa universale; comando → bipolare, pulsante; quadro → centralino, generale, magnetotermici); items missing from the starter list are created (presa dati, condizionatore, linea cucina, videocitofono). "Non so" changes nothing. ⚠️ Amounts to validate with a real electrician.
4. `q6` **Che sconto hai dal grossista sul listino?** — Non so · 40% · 45% · 50% · Altro… [Non so = 46,6% medio], same value written to `discounts` for Vimar, BTicino, Schneider · `q17` **Che ricarico metti sul materiale?** — 0% · 10% · 20% · 30% · Altro… [20%] (replaced `q5m`, old answers still read).

### Fine
> **Fatto! Ecco il tuo metodo.** Summary: Prezzo · Tariffe e squadra · I tuoi prezzi · Materiali (sconto, ricarico). "IVA, pagamenti, validità ed esclusioni sono già impostati con i valori più comuni…" [Crea il primo preventivo]

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

## 3. New quote: one conversation per quote (Task 3b)

Principle (Gio): quality over speed. The AI works **with** the electrician like an expert colleague: collects facts, proposes the pricing method, questions numbers that don't add up, and only then prepares the quote, explaining how it built it. The AI never computes money.

### Start (`/preventivi/nuovo`)
"Cliente e indirizzo (facoltativo)" + title (collapsed), **"Descrivi il lavoro"** composer (text + 🎙 record max 5 min + 📎 any files, several). No IVA choice here: every quote starts **senza IVA** (vat_rate 0). "Inizia" creates the `quotes` row (no empty drafts), posts the first message and asks the AI. Onboarding not finished → "Stiamo usando i valori più comuni… Completa il tuo metodo".

### Conversation (`/preventivi/:id`, before the quote exists)
- WhatsApp-like chat (`quote_messages`): electrician on the right, assistant on the left. Every message has a composer: text + 🎙 + 📎. Voice notes are uploaded, transcribed (OpenAI, Italian) and shown as an audio bubble with the transcript underneath (**Correggi la trascrizione**).
- **AI questions** are cards: "Ho capito così", max 3 questions with option chips (multi when needed), and under each question an always-visible **"Altro o dettagli: scrivi qui"** box plus its own **🎙 Vocale** and **📎 Allega**. "Invia risposte" sends all answered cards at once (unanswered allowed). "Altro" options from the AI are hidden.
- **Method proposal** card: one row per section ("Ricablaggio → Ore + materiali — Perché: …") with Conferma / A punto / Ore + materiali / Forfait.
- **Challenges** (sparring): amber note under the question they refer to ("550 m per 10 punti sono 55 m a punto…").
- **Scheda lavoro** (`quotes.job_sheet`): desktop right column, phone collapsible card "Scheda lavoro · 5 di 8 completati". Fields: tipo di lavoro, metodo, squadra e tempi, ambienti, punti, frutti e placche, quadro, dichiarazione di conformità; ✓ / —, plus "Mancano ancora". Tapping a field edits it and posts a note in the chat so the AI knows.
- **"Genera preventivo"** (primary, when phase = pronto_da_generare, also on the AI's "Ho tutto quello che serve" card) and **"Genera ora"** (always; warns "Alcune cose mancano: le metto tra le ipotesi").
- "Sto pensando…" while the AI works; errors and limits appear in the chat in plain Italian with **Riprova**.
- `quotes.phase`: raccolta → pronto_da_generare → generato ⇄ in_revisione.
- Facts the AI must ask (never assume): who works and how many people, how many days (always, per job), type of job, points and rooms, new or existing devices, panel, certificate. Working day: from `q18` if the electrician answered it ("giornata da 8 ore, come nel tuo metodo"), otherwise asked.

### Edge Function `generate-quote`
Body `{ quote_id, mode, proposal_message_id?, force? }`, JWT + ownership checked, 202 then background work.
- Modes: `conversation` → questions | ready_to_generate · `generate` → quote (new `quote_versions` row) · `revise` → proposal | one question · `apply` → quote with the accepted proposal (next version).
- Free plan stops a call after 150 s: voice notes are transcribed first (~70 s budget), then the function calls itself for the AI step (Claude Sonnet 5.5, adaptive thinking, effort `ai_effort`, **structured outputs**, 125 s cutoff).
- **Lease** `quotes.ai_run_started_at`: one run per quote; a lease older than 5 minutes is dead and taken over automatically.
- Context: `app_config.system_prompt_v2` + technical rules, "Il mio metodo" (all answers incl. q15–q18, marked as given or usual, notes, discounts per brand, series + surcharge), price list, a catalogue excerpt for the electrician's series, documents ("I tuoi documenti" + this job's attachments), `job_sheet`, the full conversation (texts + transcripts), the current version and its manual edits (`edits_log`).
- Every assistant reply is a `quote_messages` row; `job_sheet` and `phase` are updated.
- Prompt caching on the system prompt and on the electrician's method.

### Limits (server-side, `app_config`, every call logged in `ai_usage`)
**20 AI replies per quote, 30 per electrician per day, 150 per day for everyone**; 30 voice notes per quote. Requests the API rejects don't count. Clear Italian message in the chat when a limit is reached. Each AI call writes a log line with tokens and running totals for the quote (`event: ai_call`). Spending is also capped by the prepaid Anthropic credit.

### Calculation rules — in code (`supabase/functions/_shared/pricing.ts`, unit-tested)
Lines have `kind: punto | ore | materiale | forfait`, `source`, `why`, `quantity_estimated`, `price_missing`, `replaces_device`, `is_certificate`.
- **ore**: owner rate (`q3`) or helper rate (`q4`); a rate he said wins.
- **materiale**: catalogue list price × (1 − discount for that brand, default 46,6%) × (1 + markup `q17`). Not in the catalogue: the AI's estimated list price gets the same discount and markup (💡 Mia stima). No price → **prezzo mancante**.
- **punto / forfait**: the electrician's `price_items`.
- **Certificate**: when `job_sheet.dico = inclusa` the line is 0 € and labelled "inclusa".
- **Tiers**: only if some line `replaces_device`; then Consigliata/Top = Base + those points × series surcharge (`series_uplift`, difference from the Base series at his discount and markup). Otherwise **one price** (the AI can suggest "Vuoi cambiare tutti i frutti?").
- **Validator** (before showing every version; never fixes silently): section at ore + materiali containing `punto` lines → "Possibile doppio conteggio…" with one-tap **"Togli le voci a punto"**; ore lines vs squadra (persone × giorni × ore al giorno) outside ±25% → "Le ore non tornano con la squadra indicata".
- UI flags: `quantity_estimated` → grey "quantità stimata"; `price_missing` → amber "prezzo mancante" (counts in "N voci da completare"). No generic "da confermare".
- Formatting: "1.590,16 €" (grouping always), units "1 punto / 4 punti", "1 ora / 12 ore", "1 metro / 550 m". Middle tier shown as **Consigliata** (stored as `media`).

### Quote numbers
Per electrician and per year (`quotes.quote_year` + `quote_number`, DB trigger): 2026/001, 2026/002…

### Home
List with chips from the phase: Ti servono risposte · Da generare · Pronto · In revisione · In preparazione… (quotes made before Task 3b keep their old chips and are read-only).

## 4. After generation: "Come l'ho costruito" and revision (Task 3b)

- Price: one **Totale** card, or Base / **Consigliata** / Top cards (series and what the client gets); IVA chips Senza IVA (default) / 10 / 22 / 4 % (taxable amount unchanged).
- **Come l'ho costruito** (open the first time a version is seen): build notes as bullets, then per section "Metodo: … — perché: …".
- **Da controllare**: the AI's most uncertain points; tapping one jumps to its line.
- Lines by section with the method chip and a **source tag**: 🗣 Detto da te · 📋 Tuo listino · 📦 Catalogo (−X% sconto, +Y% ricarico) · 💡 Mia stima · ✅ Inclusa. Tap → sheet with the why, the numbers behind the price ("16 h × 40,00 € (tariffa titolare)", "Listino … − 46,6% sconto + 20% ricarico") and edit fields (description, qty, unit price, kind) + Elimina. Manual edits update the version in place, go to `edits_log` and are posted in the chat as notes.
- The **chat stays available** (desktop: right column; phone: below). Any message → `revise` → **proposal card** (aggiungo / tolgo / cambio with € effect and indicative new total) → **Applica** (next version via `apply`, with "Cosa è cambiato" and changed lines highlighted) · **Modifica** (reply) · **Annulla**.
- Still to build (later task): version selector (V1, V2…), PDF preview.

---

## 5. PDF + sharing

Generate a **very visual, concise, premium** A4 PDF in Italian, branded with the ELECTRICIAN's logo, details and accent colour (not the app's).

- **Page 1 — Colpo d'occhio:** logo + company header, client, date, quote number. One-sentence summary of the job. Room-by-room overview as icon tiles (icon, room name, number of points). The three tiers as side-by-side cards (series name, short description, total IVA inclusa), the recommended one highlighted. Key info strip: validità, tempi stimati, pagamenti.
- **Page 2+ — Dettaglio:** one clean table per room (voce, q.tà, prezzo, totale), room subtotals, then totals block (imponibile, IVA, totale) for the selected tier.
- **Last page — Condizioni:** esclusioni, ipotesi, pagamenti, validità, dichiarazione di conformità, space for client signature "Per accettazione".

Buttons: **Condividi su WhatsApp** (Web Share API with the PDF file; fallback to download + wa.me link), **Invia per email** (mailto with PDF download), **Scarica PDF**. Sharing sets status to "inviato".
