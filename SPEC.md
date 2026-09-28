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

14 questions in 6 blocks (list decided with Gio in Task 2; implemented in `src/lib/onboarding/questions.ts`).

**Flow**
- On login, if `onboarding_completed = false` and the user never postponed it, show the onboarding; otherwise Home.
- One question per screen. Top: block name, "N di 14", progress bar, **"Salta blocco"** (recommended values for the rest of the block), **"Finisco dopo"** (saves, goes to Home). Bottom: "Indietro" / "Avanti".
- Home shows "Completa il tuo metodo · mancano X domande" until completed → resumes where they left.
- Quotes can be created before finishing: unanswered questions use the recommended values.
- Each answer is saved immediately in `profiles.onboarding_answers[questionId]` as `{ value, source: 'user' | 'default', custom_text? }`. Progress lives in `onboarding_answers._meta` (`postponed`, `step`).
- **Every question:** tappable options, recommended one pre-selected with a "Consigliato" tag, last option **"Altro…"** with a text field (saved and passed to the AI).
- At the end: `init_my_price_items()` if the user has no price items, `onboarding_completed = true`, summary screen.

### Benvenuto
> **Ciao{, Nome}! Prima di iniziare, 8 minuti per conoscerti.**
> Ogni elettricista lavora a modo suo. Queste domande servono solo a far uscire i preventivi **come li faresti tu**, con i tuoi prezzi e il tuo modo di lavorare.
>
> 🔒 (green box) **Le tue risposte sono tue.** Non le vede nessun altro: né altri elettricisti, né i tuoi clienti. Puoi cambiarle quando vuoi da "Il mio metodo".
>
> (grey box) **Cosa sa già l'app?** Conosce i listini Vimar e BTicino 2026, le regole base di un impianto a norma e come si struttura un preventivo per un appartamento. Quello che non sa è **come lavori tu**: per questo ti facciamo qualche domanda.
>
> [Iniziamo] · Lo faccio dopo

(✓ = recommended)

### Blocco 1 — Come lavori
- `q1` (multi) **Che lavori fai più spesso?** — Impianti civili nuovi ✓ · Rifacimenti di appartamenti ✓ · Manutenzione aziende · Piccoli interventi da privati · Altro…
- `q2` **Come fai di solito il prezzo per i privati?** — A punto, tutto compreso (materiale + manodopera) ✓ · A ore + materiale a parte · A punto l'impianto, a ore il resto · Altro…
- `q3` **La tua tariffa oraria?** — 30 € · 40 € · 50 € · 60 € ✓ · Altro…
- `q4` **Tariffa oraria dell'aiutante?** — Non ho aiutante · 20 € · 25 € ✓ · 30 € · Altro…

### Blocco 2 — I tuoi prezzi
- `q5` **Ecco un listino "a punto" di partenza. Va bene così?** — editable table of the user's `price_items` grouped by category (name, price €, unit; inline edit). Chips "−5%", "+5%", "+10%" (all rows, rounded to 0,10 €), "Aggiungi voce". Button "Va bene così". Note: "Prezzi IVA esclusa. Materiale e manodopera inclusi, se non indicato diversamente."

### Blocco 3 — Materiali
- `q6` **Che sconto hai dal grossista sul listino?** — one row per brand (Vimar, BTicino, Schneider): Non so ✓ · 40% · 45% · 50% · Altro… "Se non lo sai, usiamo uno sconto medio del 46%." Button **"Carica la foto di una bolla"** → `quote-files/{user_id}/bolle/{timestamp}.jpg`, then "Grazie! Lo calcoliamo noi entro 24 ore." Saved to `discounts` (brand, discount_pct or null, source 'user' | 'default' | 'bolla_pending').
- `q7` **Le tue serie per le tre opzioni del preventivo?** — Base / Consigliata / Top, each a dropdown of civil series in the catalogue + Altro… Recommended: Vimar Plana / Vimar Arké / Vimar Eikon.

### Blocco 4 — Come realizzi l'impianto
- `q8` **Come distribuisci di solito le linee?** — Scatole di derivazione per stanza ✓ · Linee dedicate dal quadro per le utenze principali · Entra-esci tra i punti · Dipende dal lavoro · Altro…
- `q9` **Che livello di impianto proponi di solito? (norma CEI 64-8)** — "Il livello decide quanti punti minimi mettiamo per stanza." — Livello 1 (minimo di legge) ✓ · Livello 2 (più comfort) · Livello 3 (domotica) · Chiedo al cliente · Altro…

### Blocco 5 — Condizioni
- `q10` **IVA che applichi di solito ai privati?** — "Potrai cambiarla su ogni preventivo." — 10% (ristrutturazioni in casa) ✓ · 22% · Decido caso per caso · Altro…
- `q11` **Validità del preventivo?** — 30 giorni · 60 giorni ✓ · 90 giorni · Altro…
- `q12` **Pagamenti per clienti nuovi?** — Tutto a fine lavori · 30% di acconto, saldo a fine lavori · 20% a fine tubazioni, 20% a fine cavi, saldo a fine lavori ✓ · Altro…
- `q13` (multi) **Cosa escludi sempre dal preventivo?** — Opere murarie e tracce ✓ · Smaltimento macerie ✓ · Fornitura e montaggio lampadari ✓ · Punto luce provvisorio ✓ · Altro…

### Blocco 6 — Il tuo preventivo
- `q14` Company form (all optional, "Servono solo per il PDF. Puoi completarli dopo."): Ragione sociale, Forma giuridica (Ditta individuale · S.n.c. · S.a.s. · S.r.l. · Altro), P.IVA, Indirizzo, Telefono, Email, Logo (`logos/{user_id}/logo.{ext}`, preview), Colore del preventivo (6 swatches + custom hex, default #1F5EFF). Saved to `profiles`.

### Fine
> **Fatto! Ecco il tuo metodo.** Summary, one line each: Prezzo · Tariffa (+ aiutante) · Sconti · Serie (Base / Consigliata / Top) · Linee · Livello · IVA · Validità · Pagamenti · Esclusi. Default values in grey with "(consigliato)".
> Puoi cambiare tutto da "Il mio metodo". L'app impara anche dalle correzioni che fai nei preventivi.
> [Crea il primo preventivo]

**DEFAULT PRICE LIST (a punto, IVA esclusa)** — table `default_price_items`:
Interruttore / deviatore / invertitore 29,30 · Interruttore bipolare 36,40 · Pulsante 29,30 · Presa 10A / bipresa 32,00 · Presa universale 36,30 · Presa TV 44,20 · Predisposizione punto luce 18,00 · Scatola di derivazione piccola 30,50 · Scatola di derivazione grande 45,20 · Centralino da incasso 8 moduli 62,00 · Interruttore generale magnetotermico differenziale 84,00 · Magnetotermico singola linea 21,00 · Dichiarazione di conformità su impianto esistente 300,00

**"Il mio metodo" page (`/metodo`):** the same summary (each row opens that question in edit mode), "Il mio listino" (same price table as q5), "Altro che dovremmo sapere su come lavori" (free text → `profiles.method_notes`, autosave), "Dati per il preventivo" (q14 form). Two columns on desktop.

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
