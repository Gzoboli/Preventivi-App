# SPEC — Preventivi App (proof of concept)

AI quoting tool for Italian electricians. 3–5 testers. Product spec; see CLAUDE.md for rules and architecture.

## 1. Foundation

**Language:** all UI text in Italian. Currency EUR, Italian number format (1.234,56 €).

**Devices:** fully responsive. Used on phone at the client's home (one hand, big touch targets ≥ 48px) AND on desktop at home in the evening (use the extra width: two columns where useful).

**Design direction:** a practical site tool, calm and professional. White background, dark grey text, one strong accent colour (electric blue #1F5EFF), one warning colour (amber) for items "da confermare". Large readable type (Inter). No gradients, no decorative blobs, no cards inside cards. Every screen has one obvious primary action.

**Backend:** Supabase (already created, see CLAUDE.md).

**Auth:** email magic link only, no passwords. No public sign-up: only emails I add to an `allowed_emails` table can log in.

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

On first login (onboarding_completed = false) show a step-by-step onboarding. One question per screen, progress bar, "Indietro" / "Avanti", can be resumed later. At the end, save everything to `profiles.onboarding_answers` and create the electrician's `price_items` from the default list (see Q5), then set onboarding_completed = true.

**Every question:** 3–5 tappable options + a last option **"Altro…"** that opens a text field. Multi-select where marked. Pre-select the recommended option.

Use exactly these texts:

### Schermata di benvenuto
> **Ciao! Prima di iniziare, 10 minuti per conoscerti.**
> Ogni elettricista lavora a modo suo. Queste domande servono solo a una cosa: fare in modo che i preventivi escano **come li faresti tu**, con i tuoi prezzi e il tuo modo di lavorare.
>
> 🔒 **Le tue risposte sono tue.** Non le vede nessun altro: né altri elettricisti, né i tuoi clienti. Puoi cambiarle quando vuoi da "Il mio metodo".
>
> **Cosa sa già l'app?** Conosce i listini Vimar e BTicino aggiornati al 2026, le regole base di un impianto a norma e come si struttura un preventivo per un appartamento. Quello che non sa è **come lavori tu**: per questo ti facciamo qualche domanda.
>
> [Iniziamo]

### Blocco 1 — Come lavori
1. **Che lavori fai più spesso?** (multi) — Impianti civili nuovi · Rifacimenti di appartamenti · Manutenzione aziende · Piccoli interventi da privati · Altro…
2. **Come fai di solito il prezzo nei preventivi per privati?** — A punto, tutto compreso (materiale + manodopera) · A ore + materiale a parte · Un misto: a punto per l'impianto, a ore per il resto · Altro…
3. **Tariffa oraria (privati)?** — 30 € · 35 € · 40 € · 45 € · Altro…
4. **Tariffa oraria aiutante?** — Non ho aiutante · 20 € · 25 € · 30 € · Altro…

### Blocco 2 — I tuoi prezzi
5. **Ecco un listino "a punto" di partenza. Va bene così?** Show an editable table pre-filled with the DEFAULT PRICE LIST below. Buttons: "Va bene così" · "Aumenta tutto del __%" · "Diminuisci tutto del __%" · edit single cells · "Aggiungi voce".
6. **Uscita minima per piccoli interventi?** — Nessuna · 30 € · 50 € · 1 ora di lavoro · Altro…
7. **Trasferta fuori zona?** — Non la faccio pagare · 0,50 €/km · Forfait fisso · Altro…

### Blocco 3 — Materiali
8. **Da che grossista compri principalmente?** — ELFI · Sonepar · Rexel · Comet · Altro…
9. **Che sconto hai sul listino?** One row per brand (Vimar, BTicino, Schneider, Gewiss, Altro) with options: Non so · 30% · 40% · 45% · 50% · Altro… Plus a button **"Carica la foto di una bolla e lo calcoliamo noi"** (just uploads the photo to storage for now).
10. **Marche che usi per i frutti?** (multi) — Vimar · BTicino · Gewiss · Schneider · Altro…
11. **Le tue serie base / media / top?** Three dropdowns fed from the catalogue series (Vimar: Plana, Arké, Eikon, Linea… BTicino: Living Now, Living Light, Axolute, Matix…) + Altro…

### Blocco 4 — Come realizzi l'impianto
12. **Come distribuisci di solito le linee?** — Scatole di derivazione per stanza (consigliato) · Linee dedicate dal quadro per le utenze principali · Entra-esci tra i punti · Dipende dal lavoro · Altro…
13. **Differenziali nel quadro?** — Uno generale · Uno per zona (luci / prese / cucina) · Dipende dalla casa · Altro…
14. **Che livello di impianto proponi di solito (CEI 64-8)?** — Livello 1 (minimo di legge) · Livello 2 (più comfort) · Livello 3 (domotica) · Chiedo al cliente · Altro…

### Blocco 5 — Condizioni commerciali
15. **IVA che applichi di solito?** — 10% (ristrutturazioni in casa) · 22% · Decido caso per caso · Altro…
16. **Validità del preventivo?** — 30 giorni · 60 giorni · 90 giorni · Altro…
17. **Pagamenti per clienti nuovi?** — Tutto a fine lavori · 30% acconto, saldo a fine lavori · 20% a fine tubazioni, 20% a fine cavi, saldo a fine lavori · Altro…
18. **Cosa escludi sempre?** (multi, all pre-selected) — Opere murarie e tracce · Smaltimento macerie · Fornitura e montaggio lampadari · Punto luce provvisorio · Altro…
19. **Dichiarazione di conformità?** — Inclusa se faccio io i lavori · Sempre a parte · Altro…

### Blocco 6 — Il tuo preventivo
20. Company details (ragione sociale, forma giuridica, P.IVA, indirizzo, telefono, email), logo upload, accent colour picker.

### Fine
> **Fatto! 🎉** Da ora ogni preventivo userà il tuo metodo. Se qualcosa non torna, cambialo in "Il mio metodo" o correggilo direttamente nel preventivo: l'app impara dalle tue correzioni.

**DEFAULT PRICE LIST (a punto, IVA esclusa):**
Interruttore / deviatore / invertitore 29,30 · Interruttore bipolare 36,40 · Pulsante 29,30 · Presa 10A / bipresa 32,00 · Presa universale 36,30 · Presa TV 44,20 · Predisposizione punto luce 18,00 · Scatola di derivazione piccola 30,50 · Scatola di derivazione grande 45,20 · Centralino da incasso 8 moduli 62,00 · Interruttore generale magnetotermico differenziale 84,00 · Magnetotermico singola linea 21,00 · Dichiarazione di conformità su impianto esistente 300,00

**"Il mio metodo" page:** shows all answers in the same format, editable anytime, plus the price list table and a free-text box "Altro che dovremmo sapere su come lavori".

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
