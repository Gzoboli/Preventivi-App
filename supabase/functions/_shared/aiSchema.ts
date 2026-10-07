// JSON schemas for the AI replies (Anthropic structured outputs: output_config.format), quote format 2.
// Every object has additionalProperties: false and all properties required; optional values are nullable.
// The API rejects an enum next to a list of types: nullable enums use anyOf (see `nullable`).

type Schema = Record<string, unknown>

const str: Schema = { type: 'string' }
const num: Schema = { type: 'number' }
const bool: Schema = { type: 'boolean' }
const strArray: Schema = { type: 'array', items: str }
/** Primitive → type list (cheapest for the schema compiler); enums and objects → anyOf. */
const nullable = (s: Schema): Schema =>
  typeof s.type === 'string' && !s.enum && s.type !== 'object' ? { ...s, type: [s.type, 'null'] } : { anyOf: [s, { type: 'null' }] }
const enumOf = (...values: string[]): Schema => ({ type: 'string', enum: values })

function obj(properties: Record<string, Schema>): Schema {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties }
}

const method = enumOf('punto', 'ore_materiali', 'forfait')

const jobSheet = obj({
  tipo_lavoro: nullable(str),
  metodo: { type: 'array', items: obj({ sezione: str, metodo: method }) },
  squadra: obj({ persone: nullable(num), aiutante: nullable(bool), giorni: nullable(num), ore_giorno: nullable(num) }),
  ambienti: strArray,
  punti: nullable(num),
  frutti: nullable(enumOf('nuovi', 'esistenti', 'misto')),
  quadro: nullable(str),
  dico: nullable(enumOf('inclusa', 'forfait', 'non richiesta')),
  altro: strArray,
  mancanti: strArray,
})

const questions = obj({
  type: enumOf('questions'),
  job_sheet: jobSheet,
  understanding: str,
  method_proposal: nullable(obj({ sections: { type: 'array', items: obj({ name: str, method, why: str }) } })),
  questions: { type: 'array', items: obj({ id: str, text: str, options: strArray, multi: bool }) },
  challenges: { type: 'array', items: obj({ text: str, question_id: nullable(str) }) },
})

const ready = obj({ type: enumOf('ready_to_generate'), job_sheet: jobSheet, summary: str })

const line = obj({
  line_id: str,
  kind: enumOf('punto', 'ore', 'materiale', 'forfait'),
  worker: nullable(enumOf('titolare', 'aiutante')),
  price_item_code: nullable(str),
  catalogue_code: nullable(str),
  description: str,
  qty: num,
  unit: str,
  unit_price: nullable(num),
  source: enumOf('detto_da_te', 'tuo_listino', 'catalogo', 'mia_stima'),
  why: str,
  quantity_estimated: bool,
  price_missing: bool,
  replaces_device: bool,
  is_certificate: bool,
})

const tier = obj({ series: str, what_you_get: strArray })

const quote = obj({
  type: enumOf('quote'),
  job_sheet: jobSheet,
  title: str,
  summary: str,
  sections: {
    type: 'array',
    items: obj({
      name: str,
      icon: enumOf('kitchen', 'bathroom', 'bedroom', 'living', 'hallway', 'outdoor', 'panel', 'other'),
      method,
      method_why: str,
      lines: { type: 'array', items: line },
    }),
  },
  tiers: nullable(obj({ base: tier, consigliata: tier, top: tier })),
  build_notes: strArray,
  assumptions: strArray,
  exclusions: strArray,
  to_check: { type: 'array', items: obj({ text: str, line_id: nullable(str) }) },
  estimated_days: nullable(num),
  team: nullable(obj({ persone: nullable(num), giorni: nullable(num), ore_giorno: nullable(num) })),
})

const proposal = obj({
  type: enumOf('proposal'),
  job_sheet: jobSheet,
  changes: {
    type: 'array',
    items: obj({ action: enumOf('aggiungo', 'tolgo', 'cambio'), line_id: nullable(str), description: str, effect_eur: nullable(num) }),
  },
  total_effect_eur: nullable(num),
  note: str,
})

/** What the edge function asks the AI for. */
export type Mode = 'conversation' | 'generate' | 'revise' | 'apply'

export function replySchema(mode: Mode): Schema {
  const reply =
    mode === 'conversation'
      ? { anyOf: [questions, ready] }
      : mode === 'revise'
        ? { anyOf: [proposal, questions] }
        : quote
  return obj({ reply })
}
