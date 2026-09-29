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

**Screen "Nuovo preventivo":**
- Client name, address, short job title
- Big text box: "Descrivi il lavoro" (placeholder: "Es. rifacimento impianto appartamento 80 m², 3 camere, cucina, 2 bagni…")
- **Voice:** "Registra" button (records in browser) AND "Carica vocali" (accepts multiple audio files: .ogg, .opus, .m4a, .mp3, .wav — WhatsApp voice notes are .ogg/.opus)
- **Documents:** "Allega documenti" — any file, multiple: planimetrie, visure catastali, foto, capitolati, PDF, immagini. Show thumbnails, allow removal. Store in `quote_files`.
- Primary button: "Genera preventivo"

**Flow when "Genera preventivo" is pressed** (all in a Supabase Edge Function; API keys ONLY in Supabase secrets, never in the frontend):
1. Transcribe each audio file with OpenAI (model from `app_config.transcription_model`), language Italian.
2. Call the Anthropic API (model from `app_config.ai_model`, system prompt from `app_config.system_prompt`). Send: the electrician's onboarding answers + "il mio metodo" text + their price_items + discounts + the text + transcripts + attached documents (images and PDFs as native attachments).
3. The AI must answer with JSON only, in one of two shapes:
   - **Questions first** — `{ "type": "questions", "questions": [ { "id", "text", "options": [..], "allow_custom": true } ] }` → show them as tappable options + "Altro…" text field, then call the function again with the answers.
   - **Quote** — `{ "type": "quote", "summary": "…", "job_type": "…", "rooms": [ { "name": "Cucina", "icon": "kitchen", "lines": [ { "price_item_code" | null, "description", "qty", "unit", "unit_price" | null, "to_confirm": bool, "note" } ] } ], "tiers": { "base": {"series": "…", "delta_per_point": 0}, "media": {...}, "top": {...} }, "assumptions": ["…"], "exclusions": ["…"], "estimated_days": n }`
4. **The app, not the AI, calculates all totals:** line totals, room subtotals, total per tier (base / media / top), IVA, grand total. If `unit_price` is null, use the electrician's price_item price; if still missing, mark "da confermare" (amber).
5. Save as a new `quote_versions` row.

Until the real system prompt is ready, the placeholder already in `app_config.system_prompt` is: "Sei un assistente che prepara preventivi per un elettricista italiano. Rispondi solo con JSON nel formato richiesto. Usa solo le voci del listino fornito; se manca qualcosa, segnala to_confirm = true. Se mancano informazioni essenziali (tipo di lavoro, metratura, numero di stanze), fai prima al massimo 4 domande."

---

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
