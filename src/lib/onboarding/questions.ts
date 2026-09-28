// Onboarding "Il tuo metodo": the 14 questions (see SPEC.md §2).
// Answers are stored in profiles.onboarding_answers, keyed by question id.

export type QuestionId =
  | 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7'
  | 'q8' | 'q9' | 'q10' | 'q11' | 'q12' | 'q13' | 'q14'

export type Option = { id: string; label: string }

type Base = { id: QuestionId; block: number; title: string; helper?: string }

export type ChoiceQuestion = Base & {
  kind: 'single' | 'multi'
  options: Option[]
  /** Option ids pre-selected / used when the question is skipped. */
  recommended: string[]
}

export type SpecialQuestion = Base & { kind: 'prices' | 'discounts' | 'series' | 'company' }

export type Question = ChoiceQuestion | SpecialQuestion

/** Value of the "Altro…" option in every choice list. */
export const ALTRO = 'altro'

export const BLOCKS = [
  'Come lavori',
  'I tuoi prezzi',
  'Materiali',
  "Come realizzi l'impianto",
  'Condizioni',
  'Il tuo preventivo',
] as const

export const QUESTIONS: Question[] = [
  {
    id: 'q1', block: 1, kind: 'multi',
    title: 'Che lavori fai più spesso?',
    options: [
      { id: 'civili_nuovi', label: 'Impianti civili nuovi' },
      { id: 'rifacimenti', label: 'Rifacimenti di appartamenti' },
      { id: 'manutenzione_aziende', label: 'Manutenzione aziende' },
      { id: 'piccoli_interventi', label: 'Piccoli interventi da privati' },
    ],
    recommended: ['rifacimenti', 'civili_nuovi'],
  },
  {
    id: 'q2', block: 1, kind: 'single',
    title: 'Come fai di solito il prezzo per i privati?',
    options: [
      { id: 'a_punto', label: 'A punto, tutto compreso (materiale + manodopera)' },
      { id: 'a_ore', label: 'A ore + materiale a parte' },
      { id: 'misto', label: "A punto l'impianto, a ore il resto" },
    ],
    recommended: ['a_punto'],
  },
  {
    id: 'q3', block: 1, kind: 'single',
    title: 'La tua tariffa oraria?',
    options: [
      { id: '30', label: '30 €' },
      { id: '40', label: '40 €' },
      { id: '50', label: '50 €' },
      { id: '60', label: '60 €' },
    ],
    recommended: ['60'],
  },
  {
    id: 'q4', block: 1, kind: 'single',
    title: "Tariffa oraria dell'aiutante?",
    options: [
      { id: 'nessuno', label: 'Non ho aiutante' },
      { id: '20', label: '20 €' },
      { id: '25', label: '25 €' },
      { id: '30', label: '30 €' },
    ],
    recommended: ['25'],
  },
  {
    id: 'q5', block: 2, kind: 'prices',
    title: 'Ecco un listino "a punto" di partenza. Va bene così?',
  },
  {
    id: 'q6', block: 3, kind: 'discounts',
    title: 'Che sconto hai dal grossista sul listino?',
  },
  {
    id: 'q7', block: 3, kind: 'series',
    title: 'Le tue serie per le tre opzioni del preventivo?',
  },
  {
    id: 'q8', block: 4, kind: 'single',
    title: 'Come distribuisci di solito le linee?',
    options: [
      { id: 'scatole_stanza', label: 'Scatole di derivazione per stanza' },
      { id: 'linee_dedicate', label: 'Linee dedicate dal quadro per le utenze principali' },
      { id: 'entra_esci', label: 'Entra-esci tra i punti' },
      { id: 'dipende', label: 'Dipende dal lavoro' },
    ],
    recommended: ['scatole_stanza'],
  },
  {
    id: 'q9', block: 4, kind: 'single',
    title: 'Che livello di impianto proponi di solito? (norma CEI 64-8)',
    helper: 'Il livello decide quanti punti minimi mettiamo per stanza.',
    options: [
      { id: 'livello_1', label: 'Livello 1 (minimo di legge)' },
      { id: 'livello_2', label: 'Livello 2 (più comfort)' },
      { id: 'livello_3', label: 'Livello 3 (domotica)' },
      { id: 'chiedo', label: 'Chiedo al cliente' },
    ],
    recommended: ['livello_1'],
  },
  {
    id: 'q10', block: 5, kind: 'single',
    title: 'IVA che applichi di solito ai privati?',
    helper: 'Potrai cambiarla su ogni preventivo.',
    options: [
      { id: '10', label: '10% (ristrutturazioni in casa)' },
      { id: '22', label: '22%' },
      { id: 'caso_per_caso', label: 'Decido caso per caso' },
    ],
    recommended: ['10'],
  },
  {
    id: 'q11', block: 5, kind: 'single',
    title: 'Validità del preventivo?',
    options: [
      { id: '30', label: '30 giorni' },
      { id: '60', label: '60 giorni' },
      { id: '90', label: '90 giorni' },
    ],
    recommended: ['60'],
  },
  {
    id: 'q12', block: 5, kind: 'single',
    title: 'Pagamenti per clienti nuovi?',
    options: [
      { id: 'fine_lavori', label: 'Tutto a fine lavori' },
      { id: 'acconto_30', label: '30% di acconto, saldo a fine lavori' },
      { id: 'sal_20_20', label: '20% a fine tubazioni, 20% a fine cavi, saldo a fine lavori' },
    ],
    recommended: ['sal_20_20'],
  },
  {
    id: 'q13', block: 5, kind: 'multi',
    title: 'Cosa escludi sempre dal preventivo?',
    options: [
      { id: 'opere_murarie', label: 'Opere murarie e tracce' },
      { id: 'macerie', label: 'Smaltimento macerie' },
      { id: 'lampadari', label: 'Fornitura e montaggio lampadari' },
      { id: 'provvisorio', label: 'Punto luce provvisorio' },
    ],
    recommended: ['opere_murarie', 'macerie', 'lampadari', 'provvisorio'],
  },
  {
    id: 'q14', block: 6, kind: 'company',
    title: 'I dati per il tuo preventivo',
    helper: 'Servono solo per il PDF. Puoi completarli dopo.',
  },
]

export const TOTAL_QUESTIONS = QUESTIONS.length

export function getQuestion(id: QuestionId): Question {
  const q = QUESTIONS.find((x) => x.id === id)
  if (!q) throw new Error(`Unknown question ${id}`)
  return q
}

// ---- q6: discounts ----

export const DISCOUNT_BRANDS = ['Vimar', 'BTicino', 'Schneider'] as const
export type DiscountBrand = (typeof DISCOUNT_BRANDS)[number]

export const DISCOUNT_OPTIONS: Option[] = [
  { id: 'non_so', label: 'Non so' },
  { id: '40', label: '40%' },
  { id: '45', label: '45%' },
  { id: '50', label: '50%' },
]
export const DISCOUNT_RECOMMENDED = 'non_so'
/** Discount assumed when the electrician doesn't know theirs. */
export const DEFAULT_DISCOUNT_PCT = 46

// ---- q7: series ----

export const TIERS = [
  { id: 'base', label: 'Base' },
  { id: 'consigliata', label: 'Consigliata' },
  { id: 'top', label: 'Top' },
] as const
export type TierId = (typeof TIERS)[number]['id']

/**
 * Civil series (frutti/placche) available in the catalogue.
 * `serie` is the exact value in catalogue.serie; BTicino uses abbreviations there.
 */
export const SERIES: { id: string; marca: string; serie: string; label: string }[] = [
  { id: 'vimar_plana', marca: 'Vimar', serie: 'Plana', label: 'Vimar Plana' },
  { id: 'vimar_arke', marca: 'Vimar', serie: 'Arké', label: 'Vimar Arké' },
  { id: 'vimar_eikon', marca: 'Vimar', serie: 'Eikon', label: 'Vimar Eikon' },
  { id: 'vimar_linea', marca: 'Vimar', serie: 'Linea', label: 'Vimar Linea' },
  { id: 'vimar_idea', marca: 'Vimar', serie: 'Idea', label: 'Vimar Idea' },
  { id: 'bticino_living_now', marca: 'BTicino', serie: 'L.NOW', label: 'BTicino Living Now' },
  { id: 'bticino_living_light', marca: 'BTicino', serie: 'LL', label: 'BTicino Living Light' },
  { id: 'bticino_axolute', marca: 'BTicino', serie: 'AXOLUTE', label: 'BTicino Axolute' },
  { id: 'bticino_matix', marca: 'BTicino', serie: 'MATIX', label: 'BTicino Matix' },
  { id: 'bticino_matix_go', marca: 'BTicino', serie: 'MATIXGO', label: 'BTicino Matix Go' },
  { id: 'bticino_magic', marca: 'BTicino', serie: 'MAGIC', label: 'BTicino Magic' },
]

export const SERIES_RECOMMENDED: Record<TierId, string> = {
  base: 'vimar_plana',
  consigliata: 'vimar_arke',
  top: 'vimar_eikon',
}

// ---- q14: company ----

export const LEGAL_FORMS = ['Ditta individuale', 'S.n.c.', 'S.a.s.', 'S.r.l.', 'Altro'] as const

export const ACCENT_SWATCHES = ['#1F5EFF', '#0F766E', '#15803D', '#B45309', '#B91C1C', '#374151'] as const
export const DEFAULT_ACCENT = '#1F5EFF'
