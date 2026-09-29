// JSON schemas for the AI reply (Anthropic structured outputs: output_config.format).
// Every object has additionalProperties: false and all properties required; optional values are nullable.

const str = { type: 'string' }
const strArray = { type: 'array', items: str }

const clarify = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'understanding', 'questions'],
  properties: {
    type: { type: 'string', enum: ['clarify'] },
    understanding: str,
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text', 'options', 'multi'],
        properties: { id: str, text: str, options: strArray, multi: { type: 'boolean' } },
      },
    },
  },
}

const line = {
  type: 'object',
  additionalProperties: false,
  required: [
    'price_item_code', 'description', 'qty', 'unit', 'kind', 'worker',
    'unit_price', 'counts_as_point', 'to_confirm', 'note',
  ],
  properties: {
    price_item_code: { type: ['string', 'null'] },
    description: str,
    qty: { type: 'number' },
    unit: str,
    kind: { type: 'string', enum: ['punto', 'ore', 'materiale', 'forfait'] },
    worker: { type: ['string', 'null'], enum: ['titolare', 'aiutante', null] },
    unit_price: { type: ['number', 'null'] },
    counts_as_point: { type: 'boolean' },
    to_confirm: { type: 'boolean' },
    note: { type: ['string', 'null'] },
  },
}

const tier = {
  type: 'object',
  additionalProperties: false,
  required: ['what_you_get'],
  properties: { what_you_get: strArray },
}

const quote = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'summary', 'job_type', 'rooms', 'tiers', 'assumptions', 'exclusions', 'estimated_days'],
  properties: {
    type: { type: 'string', enum: ['quote'] },
    title: str,
    summary: str,
    job_type: str,
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'icon', 'lines'],
        properties: {
          name: str,
          icon: { type: 'string', enum: ['kitchen', 'bathroom', 'bedroom', 'living', 'hallway', 'outdoor', 'panel', 'other'] },
          lines: { type: 'array', items: line },
        },
      },
    },
    tiers: {
      type: 'object',
      additionalProperties: false,
      required: ['base', 'media', 'top'],
      properties: { base: tier, media: tier, top: tier },
    },
    assumptions: strArray,
    exclusions: strArray,
    estimated_days: { type: ['number', 'null'] },
  },
}

/** Which replies are allowed at this point of the conversation. */
export type ReplyMode = 'clarify_only' | 'either' | 'quote_only'

export function replySchema(mode: ReplyMode): Record<string, unknown> {
  const reply = mode === 'clarify_only' ? clarify : mode === 'quote_only' ? quote : { anyOf: [clarify, quote] }
  return { type: 'object', additionalProperties: false, required: ['reply'], properties: { reply } }
}

/**
 * First version: the first call must clarify; after 1 round of answers either; after 2 rounds a quote.
 * Later versions (feedback on an existing quote) may clarify once, then must quote.
 */
export function replyMode(version: number, clarifyRounds: number): ReplyMode {
  if (version === 1) return clarifyRounds === 0 ? 'clarify_only' : clarifyRounds === 1 ? 'either' : 'quote_only'
  return clarifyRounds === 0 ? 'either' : 'quote_only'
}
