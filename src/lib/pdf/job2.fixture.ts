// "Job 2" of the visual reference (riferimento-pdf-cliente.html): rewiring, no tiers, 1.650,26 € + IVA 10%.
// It deliberately carries internal information ("mia stima", catalogue codes, things to check) that
// must never reach the client PDF. Used by the tests and to export sample PDFs.
import { EMPTY_JOB_SHEET, priceQuote, type AiLine, type AiQuote, type PricingInputs } from '../../../supabase/functions/_shared/pricing.ts'
import type { ClientQuoteInput } from './clientQuote'

let n = 0
const line = (p: Partial<AiLine>): AiLine => ({
  line_id: `L${++n}`,
  kind: 'materiale',
  worker: null,
  price_item_code: null,
  catalogue_code: null,
  description: '',
  qty: 1,
  unit: 'pz',
  unit_price: null,
  source: 'tuo_listino',
  why: 'Prezzo: mia stima dal listino K4003, sconto 46,6% + ricarico 20%',
  quantity_estimated: false,
  price_missing: false,
  replaces_device: false,
  is_certificate: false,
  ...p,
})

export const JOB2_INTERNAL = ['mia stima', 'K4003', 'Controlla i tubi del bagno', 'Ho calcolato 12 ore', 'ricarico', 'sconto']

export const job2Ai: AiQuote = {
  type: 'quote',
  job_sheet: { ...EMPTY_JOB_SHEET, dico: 'inclusa', squadra: { persone: 2, aiutante: true, giorni: 2, ore_giorno: 8 } },
  title: 'Rifacimento dei cavi elettrici del suo appartamento',
  summary:
    'Sostituiamo tutti i vecchi fili con cavi nuovi, rifacciamo il quadro con salvavita moderni e le rilasciamo la certificazione. Senza rompere i muri.',
  sections: [
    {
      name: 'Cavi nuovi',
      icon: 'other',
      method: 'ore_materiali',
      method_why: 'A ore perché i tubi sono da verificare',
      lines: [
        line({ kind: 'ore', worker: 'titolare', description: 'Ricablaggio titolare', qty: 12, unit: 'h' }),
        line({ kind: 'ore', worker: 'aiutante', description: 'Ricablaggio aiutante', qty: 12, unit: 'h' }),
        line({ description: 'Cavo FS17 1,5/2,5 mm² K4003', qty: 1, unit: 'a corpo', unit_price: 139.2, source: 'detto_da_te' }),
      ],
      client_summary: '10 punti, nei tubi esistenti',
      client_points: [
        'Togliamo i vecchi fili rigidi e passiamo cavi nuovi nei tubi esistenti',
        '10 punti tra luci, prese e interruttori',
        'Materiale e manodopera',
      ],
    },
    {
      name: 'Quadro nuovo',
      icon: 'panel',
      method: 'ore_materiali',
      method_why: '',
      lines: [line({ description: 'Centralino 12 moduli + MTD selettivo VG', unit_price: 328.76, source: 'detto_da_te' })],
      client_summary: 'Salvavita e protezione per ogni linea',
      client_points: [
        'Salvavita generale e salvavita per le prese',
        'Una protezione separata per ogni linea: se una scatta, il resto della casa funziona',
      ],
    },
    {
      name: 'Linea tra i piani',
      icon: 'other',
      method: 'forfait',
      method_why: '',
      lines: [line({ kind: 'forfait', description: 'Linea montante 6 mm² 30 m', unit_price: 314.4, source: 'detto_da_te' })],
      client_summary: 'Collegamento dal piano di sotto',
      client_points: ['Nuovo collegamento dal contatore al piano di sopra'],
    },
    {
      name: '3 interruttori nuovi',
      icon: 'other',
      method: 'punto',
      method_why: '',
      lines: [line({ kind: 'punto', price_item_code: 'INT', description: 'Punto comando', qty: 3, unit: 'punti', replaces_device: true })],
      client_summary: 'Vimar Plana, bianchi',
      client_points: ['Vimar Plana bianca, montaggio compreso'],
    },
    {
      name: 'Dichiarazione di conformità',
      icon: 'other',
      method: 'forfait',
      method_why: '',
      lines: [line({ kind: 'forfait', price_item_code: 'DICO_ESIST', description: 'DiCo', is_certificate: true })],
      client_summary: 'La certificazione dell’impianto',
      client_points: ['Il documento che certifica che l’impianto è a norma'],
    },
  ],
  tiers: null,
  build_notes: ['Ho calcolato 12 ore a testa'],
  assumptions: ['Tubi riutilizzabili'],
  exclusions: ['Opere murarie'],
  to_check: [{ text: 'Controlla i tubi del bagno', line_id: 'L1' }],
  estimated_days: 2,
  team: { persone: 2, giorni: 2, ore_giorno: 8 },
  client_notes: [
    'I tubi esistenti sono in buono stato e i cavi passano senza aprire i muri',
    'Le scatole restano quelle attuali',
    'Lavoriamo in due, in circa 2 giorni',
  ],
  client_exclusions: ['Opere murarie e tracce', 'Lampadari e plafoniere', 'Sostituzione di tubi ostruiti o danneggiati'],
  client_upgrade: {
    text: 'Vuole cambiare anche gli altri 7 interruttori?',
    detail: 'Stessa serie Vimar Plana, tutto coordinato.',
    price_item_code: 'INT',
    qty: 7,
  },
}

export const job2Pricing: PricingInputs = {
  priceItems: [
    { code: 'INT', price_eur: 29.3 },
    { code: 'DICO_ESIST', price_eur: 300 },
  ],
  hourlyRate: 40,
  helperRate: 25,
  markupPct: 20,
  discounts: {},
  defaultDiscountPct: 46.6,
  catalogue: {},
  uplift: { media: 6.5, top: 18 },
  hoursPerDay: 8,
  vatRate: 10,
}

export function job2Input(over: Partial<ClientQuoteInput> = {}): ClientQuoteInput {
  return {
    quote: {
      quote_year: 2026,
      quote_number: 14,
      client_name: 'Sig. Bianchi',
      client_address: 'Via delle Rose 12, Rimini',
      job_title: 'Bianchi ricablaggio',
      estimated_days: 2,
    },
    ai: job2Ai,
    totals: priceQuote(job2Ai, job2Pricing),
    profile: {
      company_name: 'Elettrica Esempio',
      legal_form: 's.a.s.',
      vat_number: '00000000000',
      address: 'Santarcangelo di R.',
      phone: '333 000 0000',
      email: 'info@elettricaesempio.it',
      accent_color: '#0E7C66',
    },
    logo: null,
    answers: { q11: { value: '60', source: 'user' }, q12: { value: 'acconto_30', source: 'user' } },
    vatRate: 10,
    tier: 'media',
    showPrices: false,
    date: new Date(2026, 9, 7),
    ...over,
  }
}

/** The same job with switches replaced in three options (Base / Consigliata / Top). */
export function job2TiersInput(over: Partial<ClientQuoteInput> = {}): ClientQuoteInput {
  const ai: AiQuote = {
    ...job2Ai,
    tiers: {
      base: { series: 'Vimar Plana', what_you_get: ['Placche bianche in tecnopolimero', 'Linee semplici e pulite'] },
      consigliata: { series: 'Vimar Arké', what_you_get: ['Placche colorate con angoli arrotondati', 'Tasti più ampi e morbidi'] },
      top: { series: 'Vimar Eikon', what_you_get: ['Placche in vetro', 'Finiture di pregio'] },
    },
  }
  return job2Input({ ai, totals: priceQuote(ai, job2Pricing), ...over })
}

/** Everything at its maximum (12 sections, long texts): page 1 must still fit on one page. */
export function job2LongestInput(): ClientQuoteInput {
  const base = job2TiersInput()
  const long = 'Testo molto lungo che descrive il lavoro con tante parole per vedere se la pagina regge senza andare a capo troppo'
  const section = { ...base.ai.sections[3], client_summary: long, client_points: [long, long, long] }
  return {
    ...base,
    quote: {
      ...base.quote,
      client_name: 'Condominio Via dei Mille, amministratore Dott. Rossi',
      client_address: 'Via dei Mille 123, scala B, interno 14, 47921 Rimini (RN)',
    },
    ai: {
      ...base.ai,
      title: `${long} ${long}`,
      summary: `${long}. ${long}. ${long}.`,
      sections: Array.from({ length: 12 }, (_, i) => ({ ...section, name: `Sezione con un nome lungo numero ${i + 1}` })),
      client_exclusions: [long, long, long, long, long],
      client_notes: [long, long, long, long, long],
      client_upgrade: { ...base.ai.client_upgrade!, text: long, detail: long },
    },
  }
}
