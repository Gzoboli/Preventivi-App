// Shared by the app (Vite) and Edge Functions (Deno): pure TypeScript, no imports outside _shared.
// "Il tuo metodo": questions about how the electrician works (see SPEC.md §2).
// Answers are stored in profiles.onboarding_answers, keyed by question id.
// Only the ONBOARDING_SCREENS are asked at sign-up; the others start from the
// usual values and can be changed in "Il mio metodo" ("Altre impostazioni").

export type QuestionId =
  | 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q5m' | 'q6'
  | 'q7' | 'q8' | 'q9' | 'q10' | 'q11' | 'q12' | 'q13'

export type Option = { id: string; label: string }

type Base = { id: QuestionId; title: string; helper?: string }

export type ChoiceQuestion = Base & {
  kind: 'single' | 'multi'
  options: Option[]
  /** Option ids pre-selected and used until the user answers. */
  defaults: string[]
}

export type SpecialQuestion = Base & { kind: 'prices' | 'series' }

export type Question = ChoiceQuestion | SpecialQuestion

/** Value of the "Altro…" option in every choice list. */
export const ALTRO = 'altro'
/** Value of "Non so" in the price rows. */
export const NON_SO = 'non_so'

export const QUESTIONS: Question[] = [
  {
    id: 'q2', kind: 'single',
    title: 'Come fai di solito il prezzo per i privati?',
    options: [
      { id: 'a_punto', label: 'A punto, tutto compreso (materiale + manodopera)' },
      { id: 'a_ore', label: 'A ore + materiale a parte' },
      { id: 'misto', label: "A punto l'impianto, a ore il resto" },
    ],
    defaults: ['a_punto'],
  },
  {
    id: 'q3', kind: 'single',
    title: 'La tua tariffa oraria?',
    options: [
      { id: '30', label: '30 €' },
      { id: '40', label: '40 €' },
      { id: '50', label: '50 €' },
      { id: '60', label: '60 €' },
    ],
    defaults: ['60'],
  },
  {
    id: 'q4', kind: 'single',
    title: "Tariffa oraria dell'aiutante?",
    options: [
      { id: 'nessuno', label: 'Non ho aiutante' },
      { id: '20', label: '20 €' },
      { id: '25', label: '25 €' },
      { id: '30', label: '30 €' },
    ],
    defaults: ['25'],
  },
  {
    id: 'q5', kind: 'prices',
    title: 'Quanto fai pagare di solito?',
    helper: 'Prezzo finale al cliente: materiale e manodopera, IVA esclusa. Il tuo sconto grossista è già dentro. Rispondi solo a quelle che sai: potrai correggere ogni prezzo nei preventivi.',
  },
  {
    id: 'q5m', kind: 'single',
    title: 'Quanto ricarichi sul materiale?',
    helper: 'In percentuale sul prezzo a cui lo compri.',
    options: [
      { id: '0', label: 'Niente' },
      { id: '10', label: '10%' },
      { id: '20', label: '20%' },
      { id: '30', label: '30%' },
    ],
    defaults: ['20'],
  },
  {
    id: 'q6', kind: 'single',
    title: 'Che sconto hai dal grossista sul listino?',
    helper: 'Serve per il materiale fuori dai prezzi a punto (es. lampade, apparecchi particolari). Se non lo sai, usiamo uno sconto medio del 46%.',
    options: [
      { id: 'non_so', label: 'Non so' },
      { id: '40', label: '40%' },
      { id: '45', label: '45%' },
      { id: '50', label: '50%' },
    ],
    defaults: ['non_so'],
  },
  // ---- "Altre impostazioni" (not asked at sign-up) ----
  {
    id: 'q1', kind: 'multi',
    title: 'Che lavori fai più spesso?',
    options: [
      { id: 'civili_nuovi', label: 'Impianti civili nuovi' },
      { id: 'rifacimenti', label: 'Rifacimenti di appartamenti' },
      { id: 'manutenzione_aziende', label: 'Manutenzione aziende' },
      { id: 'piccoli_interventi', label: 'Piccoli interventi da privati' },
    ],
    defaults: ['rifacimenti', 'civili_nuovi'],
  },
  {
    id: 'q7', kind: 'series',
    title: 'Le tue serie per le tre opzioni del preventivo?',
  },
  {
    id: 'q8', kind: 'single',
    title: 'Come distribuisci di solito le linee?',
    options: [
      { id: 'scatole_stanza', label: 'Scatole di derivazione per stanza' },
      { id: 'linee_dedicate', label: 'Linee dedicate dal quadro per le utenze principali' },
      { id: 'entra_esci', label: 'Entra-esci tra i punti' },
      { id: 'dipende', label: 'Dipende dal lavoro' },
    ],
    defaults: ['scatole_stanza'],
  },
  {
    id: 'q9', kind: 'single',
    title: 'Che livello di impianto proponi di solito? (norma CEI 64-8)',
    helper: 'Il livello decide quanti punti minimi mettiamo per stanza.',
    options: [
      { id: 'livello_1', label: 'Livello 1 (minimo di legge)' },
      { id: 'livello_2', label: 'Livello 2 (più comfort)' },
      { id: 'livello_3', label: 'Livello 3 (domotica)' },
      { id: 'chiedo', label: 'Chiedo al cliente' },
    ],
    defaults: ['livello_1'],
  },
  {
    id: 'q10', kind: 'single',
    title: 'IVA che applichi di solito ai privati?',
    helper: 'Potrai cambiarla su ogni preventivo.',
    options: [
      { id: '10', label: '10% (ristrutturazioni in casa)' },
      { id: '22', label: '22%' },
      { id: 'caso_per_caso', label: 'Decido caso per caso' },
    ],
    defaults: ['10'],
  },
  {
    id: 'q11', kind: 'single',
    title: 'Validità del preventivo?',
    options: [
      { id: '30', label: '30 giorni' },
      { id: '60', label: '60 giorni' },
      { id: '90', label: '90 giorni' },
    ],
    defaults: ['60'],
  },
  {
    id: 'q12', kind: 'single',
    title: 'Pagamenti per clienti nuovi?',
    options: [
      { id: 'fine_lavori', label: 'Tutto a fine lavori' },
      { id: 'acconto_30', label: '30% di acconto, saldo a fine lavori' },
      { id: 'sal_20_20', label: '20% a fine tubazioni, 20% a fine cavi, saldo a fine lavori' },
    ],
    defaults: ['sal_20_20'],
  },
  {
    id: 'q13', kind: 'multi',
    title: 'Cosa escludi sempre dal preventivo?',
    options: [
      { id: 'opere_murarie', label: 'Opere murarie e tracce' },
      { id: 'macerie', label: 'Smaltimento macerie' },
      { id: 'lampadari', label: 'Fornitura e montaggio lampadari' },
      { id: 'provvisorio', label: 'Punto luce provvisorio' },
    ],
    defaults: ['opere_murarie', 'macerie', 'lampadari', 'provvisorio'],
  },
]

export function getQuestion(id: QuestionId): Question {
  const q = QUESTIONS.find((x) => x.id === id)
  if (!q) throw new Error(`Unknown question ${id}`)
  return q
}

// ---- onboarding screens ----

/** Pricing method chosen in q2 (effective value). */
export type PricingMethod = 'a_punto' | 'a_ore' | 'misto' | string

/**
 * The 4 sign-up screens. Screen 3 depends on how they price:
 * per point → typical prices (q5), hourly → materials markup (q5m).
 */
export function onboardingScreens(pricing: PricingMethod): QuestionId[][] {
  return [['q2'], ['q3', 'q4'], [pricing === 'a_ore' ? 'q5m' : 'q5'], ['q6']]
}
export const ONBOARDING_SCREEN_COUNT = 4

// ---- q5: typical prices ----

/**
 * One row of "Quanto fai pagare di solito?".
 * - `code`: price_items code set to the chosen price (created if missing).
 * - `scale`: codes moved by the same proportion (price_new = default × chosen / base).
 * - `base`: the starter price the row corresponds to (sum of items for the panel).
 */
export type PriceAnchor = {
  id: string
  label: string
  detail?: string
  options: number[]
  base: number
  code?: string
  scale?: string[]
  /** Item to create when the code isn't in the starter list. */
  create?: { name: string; category: string; unit: string; includes_material: boolean }
}

export const PRICE_ANCHORS: PriceAnchor[] = [
  { id: 'presa', label: 'Presa 10A / bipresa', options: [28, 32, 36, 40], base: 32, code: 'PRESA10', scale: ['PRESAUNI'] },
  { id: 'comando', label: 'Punto comando', detail: 'interruttore, deviatore', options: [25, 29, 33, 37], base: 29.3, code: 'INT', scale: ['INT2P', 'PULS'] },
  { id: 'luce', label: 'Punto luce', detail: 'a soffitto o parete', options: [15, 18, 22, 26], base: 18, code: 'PLUCE' },
  { id: 'tv', label: 'Presa TV', options: [38, 44, 50, 56], base: 44.2, code: 'PRESATV' },
  {
    id: 'dati', label: 'Presa dati (rete)', detail: 'RJ45', options: [38, 44, 50, 56], base: 44, code: 'PRESADATI',
    create: { name: 'Presa dati RJ45', category: 'Prese', unit: 'punto', includes_material: true },
  },
  {
    id: 'clima', label: 'Predisposizione condizionatore', detail: 'linea e presa dedicate', options: [90, 110, 130, 150], base: 110, code: 'CLIMA',
    create: { name: 'Predisposizione condizionatore (linea e presa dedicate)', category: 'Linee dedicate', unit: 'punto', includes_material: true },
  },
  {
    id: 'cucina', label: 'Linea dedicata cucina', detail: 'forno o piano a induzione', options: [80, 100, 120, 150], base: 100, code: 'LINEACUC',
    create: { name: 'Linea dedicata cucina (forno / piano induzione)', category: 'Linee dedicate', unit: 'punto', includes_material: true },
  },
  {
    id: 'quadro', label: 'Quadro appartamento', detail: 'centralino, generale e 4–6 linee', options: [220, 250, 300, 350],
    base: 62 + 84 + 5 * 21, scale: ['CENTR8', 'MTDIFF', 'MT1'],
  },
  {
    id: 'videocitofono', label: 'Videocitofono', detail: 'posto interno, solo installazione', options: [120, 150, 200, 250], base: 150, code: 'VIDEOCIT',
    create: { name: 'Installazione posto interno videocitofono', category: 'Citofonia', unit: 'punto', includes_material: false },
  },
  { id: 'dico', label: 'Dichiarazione di conformità', detail: 'impianto esistente', options: [200, 250, 300, 350], base: 300, code: 'DICO_ESIST' },
]

// ---- q6: discounts (one value for all brands) ----

export const DISCOUNT_BRANDS = ['Vimar', 'BTicino', 'Schneider'] as const
/** Discount assumed when the electrician doesn't know theirs. */
export const DEFAULT_DISCOUNT_PCT = 46

// ---- q7: series ----

export const TIERS = [
  { id: 'base', label: 'Base' },
  { id: 'media', label: 'Media' },
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

export const SERIES_DEFAULTS: Record<TierId, string> = {
  base: 'vimar_plana',
  media: 'vimar_arke',
  top: 'vimar_eikon',
}

// ---- company data ----

export const LEGAL_FORMS = ['Ditta individuale', 'S.n.c.', 'S.a.s.', 'S.r.l.', 'Altro'] as const

export const ACCENT_SWATCHES = ['#1F5EFF', '#0F766E', '#15803D', '#B45309', '#B91C1C', '#374151'] as const
export const DEFAULT_ACCENT = '#1F5EFF'
