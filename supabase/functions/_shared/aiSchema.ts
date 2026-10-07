// JSON schemas for the AI replies (Anthropic structured outputs: output_config.format), quote format 2.
// Every object has additionalProperties: false and all properties required.
//
// The API allows at most 16 union-typed parameters (anyOf or type lists) per schema, so the schema
// has no nullable fields: "unknown" is "" for text, 0 for numbers, "non_so"/"nessuno" for choices,
// and an empty list for optional lists. `normalizeReply` turns that back into the app's types (null).
// The only union is the choice between reply types.
//
// The API also caps the size of the compiled grammar. The quote is the biggest reply (sections → lines),
// so its schema has no job_sheet (the facts are already collected) and no enums: the allowed values
// are in the descriptions and `normalizeLine`/`normalizeSection` map anything else to a safe default.
import type { AiLine, AiProposal, AiQuestions, AiQuote, AiReady, JobSheet, MethodProposal } from './pricing.ts'

type Schema = Record<string, unknown>

const str: Schema = { type: 'string' }
const num: Schema = { type: 'number' }
const bool: Schema = { type: 'boolean' }
const strArray: Schema = { type: 'array', items: str }
const enumOf = (...values: string[]): Schema => ({ type: 'string', enum: values })
const list = (items: Schema): Schema => ({ type: 'array', items })

function obj(properties: Record<string, Schema>): Schema {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties }
}

const method = enumOf('punto', 'ore_materiali', 'forfait')
/** A plain string whose allowed values are only described (keeps the quote grammar small). */
const oneOf = (...values: string[]): Schema => ({ type: 'string', description: `Uno tra: ${values.join(', ')}` })

const KINDS = ['punto', 'ore', 'materiale', 'forfait'] as const
const WORKERS = ['titolare', 'aiutante', 'nessuno'] as const
const SOURCES = ['detto_da_te', 'tuo_listino', 'catalogo', 'mia_stima'] as const
const ICONS = ['kitchen', 'bathroom', 'bedroom', 'living', 'hallway', 'outdoor', 'panel', 'other'] as const
const METHODS = ['punto', 'ore_materiali', 'forfait'] as const

const jobSheet = obj({
  tipo_lavoro: str,
  metodo: list(obj({ sezione: str, metodo: method })),
  squadra: obj({ persone: num, aiutante: enumOf('si', 'no', 'non_so'), giorni: num, ore_giorno: num }),
  ambienti: strArray,
  punti: num,
  frutti: enumOf('nuovi', 'esistenti', 'misto', 'non_so'),
  quadro: str,
  dico: enumOf('inclusa', 'forfait', 'non richiesta', 'non_so'),
  altro: strArray,
  mancanti: strArray,
})

const questionsFields = {
  understanding: str,
  method_proposal: list(obj({ name: str, method, why: str })),
  questions: list(obj({ id: str, text: str, why: str, options: strArray, multi: bool })),
  challenges: list(obj({ text: str, question_id: str })),
}

const line = obj({
  line_id: str,
  kind: oneOf(...KINDS),
  worker: oneOf(...WORKERS),
  price_item_code: str,
  catalogue_code: str,
  description: str,
  qty: num,
  unit: str,
  unit_price: num,
  source: oneOf(...SOURCES),
  why: str,
  quantity_estimated: bool,
  price_missing: bool,
  replaces_device: bool,
  is_certificate: bool,
})

const tier = obj({ series: str, what_you_get: strArray })

const quoteFields = {
  title: str,
  summary: str,
  sections: list(
    obj({
      name: str,
      icon: oneOf(...ICONS),
      method: oneOf(...METHODS),
      method_why: str,
      lines: list(line),
    }),
  ),
  tiers: obj({ offered: bool, base: tier, consigliata: tier, top: tier }),
  build_notes: strArray,
  assumptions: strArray,
  exclusions: strArray,
  to_check: list(obj({ text: str, line_id: str })),
  estimated_days: num,
  team: obj({ persone: num, giorni: num, ore_giorno: num }),
}

const proposalFields = {
  changes: list(obj({ action: enumOf('aggiungo', 'tolgo', 'cambio'), line_id: str, description: str, effect_eur: num })),
  total_effect_eur: num,
  note: str,
}

/** What the edge function asks the AI for. */
export type Mode = 'conversation' | 'generate' | 'revise' | 'apply'

export function replySchema(mode: Mode): Schema {
  const variant = (type: string, fields: Record<string, Schema>) => obj({ type: enumOf(type), ...fields })
  const reply =
    mode === 'conversation'
      ? { anyOf: [variant('questions', questionsFields), variant('ready_to_generate', { summary: str })] }
      : mode === 'revise'
        ? { anyOf: [variant('proposal', proposalFields), variant('questions', questionsFields)] }
        : null
  // The quote alone (no job_sheet): see the note at the top.
  if (!reply) return obj({ reply: variant('quote', quoteFields) })
  // job_sheet once, outside the union (it is the same for every reply type).
  return obj({ job_sheet: jobSheet, reply })
}

// ---------------------------------------------------------------- back to the app's types

type Raw = Record<string, unknown>

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const positive = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const known = <T extends string>(v: unknown, unknown: string): T | null => (typeof v === 'string' && v !== unknown ? (v as T) : null)
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export function normalizeJobSheetReply(j: Raw): JobSheet {
  const sq = (j.squadra ?? {}) as Raw
  return {
    tipo_lavoro: text(j.tipo_lavoro),
    metodo: arr(j.metodo),
    squadra: {
      persone: positive(sq.persone),
      aiutante: sq.aiutante === 'si' ? true : sq.aiutante === 'no' ? false : null,
      giorni: positive(sq.giorni),
      ore_giorno: positive(sq.ore_giorno),
    },
    ambienti: arr(j.ambienti),
    punti: positive(j.punti),
    frutti: known(j.frutti, 'non_so'),
    quadro: text(j.quadro),
    dico: known(j.dico, 'non_so'),
    altro: arr(j.altro),
    mancanti: arr(j.mancanti),
  }
}

export type Reply = AiQuestions | AiReady | AiQuote | AiProposal

/**
 * The raw structured output ({ job_sheet, reply }) → the app's reply types.
 * Without job_sheet (quote replies) the current one is kept.
 */
export function normalizeReply(raw: Raw, current: JobSheet): Reply {
  const job_sheet = raw.job_sheet ? normalizeJobSheetReply(raw.job_sheet as Raw) : current
  const r = (raw.reply ?? {}) as Raw
  switch (r.type) {
    case 'questions': {
      const proposal = arr<MethodProposal['sections'][number]>(r.method_proposal)
      return {
        type: 'questions',
        job_sheet,
        understanding: String(r.understanding ?? ''),
        method_proposal: proposal.length ? { sections: proposal } : null,
        questions: arr<AiQuestions['questions'][number]>(r.questions),
        challenges: arr<{ text: string; question_id: string }>(r.challenges).map((c) => ({ text: c.text, question_id: text(c.question_id) })),
      }
    }
    case 'ready_to_generate':
      return { type: 'ready_to_generate', job_sheet, summary: String(r.summary ?? '') }
    case 'proposal':
      return {
        type: 'proposal',
        job_sheet,
        changes: arr<Raw>(r.changes).map((c) => ({
          action: c.action as AiProposal['changes'][number]['action'],
          line_id: text(c.line_id),
          description: String(c.description ?? ''),
          effect_eur: typeof c.effect_eur === 'number' && c.effect_eur !== 0 ? c.effect_eur : null,
        })),
        total_effect_eur: typeof r.total_effect_eur === 'number' && r.total_effect_eur !== 0 ? r.total_effect_eur : null,
        note: String(r.note ?? ''),
      }
    case 'quote': {
      const tiers = (r.tiers ?? {}) as Raw
      const team = (r.team ?? {}) as Raw
      const hasTeam = positive(team.persone) || positive(team.giorni) || positive(team.ore_giorno)
      return {
        type: 'quote',
        job_sheet,
        title: String(r.title ?? ''),
        summary: String(r.summary ?? ''),
        sections: arr<Raw>(r.sections).map((s) => ({
          name: String(s.name ?? ''),
          icon: pick(s.icon, ICONS, 'other'),
          method: pick(s.method, METHODS, 'ore_materiali'),
          method_why: String(s.method_why ?? ''),
          lines: arr<Raw>(s.lines).map(normalizeLine),
        })),
        tiers: tiers.offered === true ? (tiers as unknown as NonNullable<AiQuote['tiers']>) : null,
        build_notes: arr(r.build_notes),
        assumptions: arr(r.assumptions),
        exclusions: arr(r.exclusions),
        to_check: arr<Raw>(r.to_check).map((c) => ({ text: String(c.text ?? ''), line_id: text(c.line_id) })),
        estimated_days: positive(r.estimated_days),
        team: hasTeam ? { persone: positive(team.persone), giorni: positive(team.giorni), ore_giorno: positive(team.ore_giorno) } : null,
      }
    }
    default:
      throw new Error(`unknown reply type ${String(r.type)}`)
  }
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback

function normalizeLine(l: Raw): AiLine {
  return {
    ...(l as unknown as AiLine),
    kind: pick(l.kind, KINDS, 'materiale'),
    source: pick(l.source, SOURCES, 'mia_stima'),
    worker: l.worker === 'titolare' || l.worker === 'aiutante' ? l.worker : null,
    price_item_code: text(l.price_item_code),
    catalogue_code: text(l.catalogue_code),
    unit_price: positive(l.unit_price),
  }
}
