// generate-quote: the AI side of the quote conversation (Task 3b).
//
// Modes (body: { quote_id, mode, proposal_message_id?, force? }):
//   conversation → questions | ready_to_generate     generate → quote (new version)
//   revise       → proposal  | questions             apply    → quote (proposal applied, new version)
// Every reply is saved as a quote_messages row; quotes.job_sheet and quotes.phase are updated.
//
// Supabase Free plan kills a function after 150 s, so voice notes are transcribed in a first call,
// which then calls itself for the AI step. quotes.ai_run_started_at is a lease: one run per quote;
// a lease older than 5 minutes belongs to a dead run and is taken over.
// Every paid call is logged in ai_usage and checked against the limits in app_config first.

import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { parseAnswers } from '../_shared/answers.ts'
import { SERIES } from '../_shared/questions.ts'
import { answeredHoursPerDay, methodText, pricingInputs, seriesForTier, type DiscountRow, type PriceRow, type UpliftRow } from '../_shared/method.ts'
import { normalizeReply, replySchema, type Mode, type Reply } from '../_shared/aiSchema.ts'
import { renderTranscript, type ChatMessage } from '../_shared/chat.ts'
import { allLines, priceQuote, type CatalogueItem } from '../_shared/pricing.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

const LEASE_SECONDS = 300 // a run is killed after 150 s: an older lease is stale and taken over
const TRANSCRIBE_BUDGET_MS = 70_000
const AI_DEADLINE_MS = 125_000
const MAX_AUDIO_BYTES = 24 * 1024 * 1024 // OpenAI limit is 25 MB
const MAX_DOC_BYTES_TOTAL = 20 * 1024 * 1024 // stays under the 32 MB request limit after base64
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_METHOD_DOCS = 5
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MODES: Mode[] = ['conversation', 'generate', 'revise', 'apply']

const GENERIC_ERROR = 'Qualcosa non ha funzionato, riprova.'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** An error whose message is shown to the electrician (Italian). */
class UserError extends Error {}

// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, 'public', any>
type Row = Record<string, unknown>
type Job = { quoteId: string; mode: Mode; proposalMessageId: string | null; force: boolean }

Deno.serve(async (req) => {
  const t0 = Date.now()
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) ?? {}
  } catch {
    /* handled below */
  }
  const quoteId = String(body.quote_id ?? '')
  const mode = body.mode as Mode
  if (!/^[0-9a-f-]{36}$/i.test(quoteId) || !MODES.includes(mode)) return json({ error: 'bad_request' }, 400)
  const proposalMessageId = typeof body.proposal_message_id === 'string' ? body.proposal_message_id : null
  if (mode === 'apply' && !proposalMessageId) return json({ error: 'proposal_message_id' }, 400)

  const db: Db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (token !== SERVICE_KEY) {
    // Called by the app: the caller must own this quote.
    const { data: auth } = await db.auth.getUser(token)
    if (!auth?.user) return json({ error: 'auth' }, 401)
    const { data: q } = await db.from('quotes').select('user_id').eq('id', quoteId).maybeSingle()
    if (!q || q.user_id !== auth.user.id) return json({ error: 'not_found' }, 404)
  }

  EdgeRuntime.waitUntil(run(db, { quoteId, mode, proposalMessageId, force: body.force === true }, t0))
  return json({ accepted: true }, 202)
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// ---------------------------------------------------------------- run (lease)

const CLAIM_WAIT_MS = 40_000

/** Takes the quote's lease; if another run holds it, waits for it a little (its reply may not cover this message). */
async function claim(db: Db, quoteId: string): Promise<Row | null> {
  const until = Date.now() + CLAIM_WAIT_MS
  while (true) {
    const cutoff = new Date(Date.now() - LEASE_SECONDS * 1000).toISOString()
    const { data } = await db
      .from('quotes')
      .update({ ai_run_started_at: new Date().toISOString() })
      .eq('id', quoteId)
      .or(`ai_run_started_at.is.null,ai_run_started_at.lt."${cutoff}"`)
      .select('*')
      .maybeSingle()
    if (data || Date.now() > until) return data
    await new Promise((r) => setTimeout(r, 4000))
  }
}

async function run(db: Db, job: Job, t0: number) {
  const quote = await claim(db, job.quoteId)
  if (!quote) return // another run is still working on this quote; its reply covers the conversation
  if (Date.now() - t0 > 15_000) {
    // Waited for another run: start again in a fresh call, with the full time budget.
    await db.from('quotes').update({ ai_run_started_at: null }).eq('id', job.quoteId)
    return await callSelf(job)
  }

  let next: 'continue' | 'done' = 'done'
  try {
    next = await step(db, quote, job, t0)
  } catch (e) {
    console.error('generate-quote', job.quoteId, job.mode, e)
    await db.from('quote_messages').insert({
      quote_id: job.quoteId,
      user_id: quote.user_id,
      role: 'system',
      kind: 'note',
      text: e instanceof UserError ? e.message : GENERIC_ERROR,
      payload: { error: true, mode: job.mode, proposal_message_id: job.proposalMessageId },
    })
  } finally {
    await db.from('quotes').update({ ai_run_started_at: null }).eq('id', job.quoteId)
  }
  if (next === 'continue') await callSelf(job)
}

async function callSelf(job: Job) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-quote`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quote_id: job.quoteId, mode: job.mode, proposal_message_id: job.proposalMessageId, force: job.force }),
  })
  if (res.status !== 202) console.error('self-call', res.status, await res.text())
}

async function step(db: Db, quote: Row, job: Job, t0: number): Promise<'continue' | 'done'> {
  const userId = quote.user_id as string
  const [messages, files, config] = await Promise.all([
    many(db.from('quote_messages').select('*').eq('quote_id', job.quoteId).eq('user_id', userId).order('created_at')),
    many(db.from('quote_files').select('*').eq('quote_id', job.quoteId).eq('user_id', userId).order('uploaded_at')),
    loadConfig(db),
  ])

  // 1. Transcription of voice messages, in this call; the AI always starts in a fresh call.
  const voices = messages.filter((m) => m.kind === 'voice' && m.audio_file_id)
  const maxAudio = config.int('limit_audio_files_per_quote', 30)
  const pending = voices.filter((m) => m.text == null)
  if (pending.length) {
    if (voices.length > maxAudio) throw new UserError(`Troppi vocali per un preventivo (massimo ${maxAudio}). Scrivi il resto a mano.`)
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
    const model = config.str('transcription_model', 'gpt-4o-transcribe')
    for (const m of pending) {
      if (Date.now() - t0 > TRANSCRIBE_BUDGET_MS) break
      const file = files.find((f) => f.id === m.audio_file_id)
      if (!file) throw new UserError('Non trovo un vocale: registralo di nuovo.')
      const text = await transcribe(db, file, model)
      await db.from('quote_messages').update({ text }).eq('id', m.id)
      await db.from('ai_usage').insert({ user_id: userId, quote_id: job.quoteId, kind: 'transcribe', model })
    }
    return 'continue'
  }

  // 2. AI
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set') // before counting an attempt
  await checkLimits(db, userId, job.quoteId, config)
  const model = config.str('ai_model', 'claude-sonnet-5-5')
  const { data: usage } = await db
    .from('ai_usage')
    .insert({ user_id: userId, quote_id: job.quoteId, kind: 'generate', model })
    .select('id')
    .single()

  const ctx = await buildContext(db, userId, quote, job, messages as unknown as ChatMessage[], files, config)
  let answer: Awaited<ReturnType<typeof askAi>>
  try {
    answer = await askAi(config, model, ctx, job.mode, t0)
  } catch (e) {
    // Requests the API rejects (4xx) are not billed: don't count them against the limits.
    if (usage && e instanceof Anthropic.APIError && e.status != null && e.status >= 400 && e.status < 500) {
      await db.from('ai_usage').delete().eq('id', usage.id)
    }
    throw e
  }
  if (usage) await db.from('ai_usage').update(answer.usage).eq('id', usage.id)
  await logQuoteUsage(db, job, answer.usage)

  await save(db, quote, job, ctx, answer.reply)
  return 'done'
}

// ---------------------------------------------------------------- saving replies

async function save(db: Db, quote: Row, job: Job, ctx: Context, reply: Reply) {
  const base = { quote_id: job.quoteId, user_id: quote.user_id, role: 'assistant' }
  const updateQuote = (fields: Row) => db.from('quotes').update({ job_sheet: reply.job_sheet, ...fields }).eq('id', job.quoteId)

  switch (reply.type) {
    case 'questions':
      await db.from('quote_messages').insert({ ...base, kind: 'questions', text: reply.understanding, payload: reply })
      await updateQuote({ phase: job.mode === 'revise' ? 'in_revisione' : 'raccolta' })
      return
    case 'ready_to_generate':
      await db.from('quote_messages').insert({ ...base, kind: 'text', text: reply.summary, payload: { type: 'ready_to_generate', summary: reply.summary } })
      await updateQuote({ phase: 'pronto_da_generare' })
      return
    case 'proposal':
      await db.from('quote_messages').insert({ ...base, kind: 'proposal', text: reply.note, payload: reply })
      await updateQuote({ phase: 'in_revisione' })
      return
    case 'quote': {
      const codes = [...new Set(allLines(reply).flatMap((l) => (l.catalogue_code ? [l.catalogue_code.trim()] : [])))]
      const inputs = { ...ctx.pricing, catalogue: { ...ctx.pricing.catalogue, ...(await lookupCatalogue(db, codes)) } }
      const totals = priceQuote(reply, inputs)
      const { data: last } = await db.from('quote_versions').select('version').eq('quote_id', job.quoteId).order('version', { ascending: false }).limit(1).maybeSingle()
      const version = ((last?.version as number | undefined) ?? 0) + 1
      const { data: saved, error } = await db
        .from('quote_versions')
        .insert({ quote_id: job.quoteId, user_id: quote.user_id, version, status: 'ready', ai_output: reply, totals, input_text: null })
        .select('id')
        .single()
      if (error || !saved) throw error ?? new Error('version not saved')
      await db.from('quote_messages').insert({
        ...base,
        kind: 'quote_ready',
        quote_version_id: saved.id,
        text: reply.summary,
        payload: { version, summary: reply.summary },
      })
      if (job.mode === 'apply' && job.proposalMessageId) {
        const { data: p } = await db.from('quote_messages').select('payload').eq('id', job.proposalMessageId).maybeSingle()
        if (p) await db.from('quote_messages').update({ payload: { ...(p.payload as Row), status: 'applied' } }).eq('id', job.proposalMessageId)
      }
      const fields: Row = { phase: 'generato' }
      if (!(quote.job_title as string | null)?.trim() && reply.title) fields.job_title = reply.title
      if (reply.estimated_days != null) fields.estimated_days = reply.estimated_days
      await updateQuote(fields)
    }
  }
}

async function lookupCatalogue(db: Db, codes: string[]): Promise<Record<string, CatalogueItem>> {
  if (!codes.length) return {}
  const rows = await many(db.from('catalogue').select('codice, marca, descrizione, prezzo_listino_eur, unita').in('codice', codes))
  return Object.fromEntries(
    rows.map((r) => [
      String(r.codice).toUpperCase(),
      { ...r, prezzo_listino_eur: r.prezzo_listino_eur == null ? null : Number(r.prezzo_listino_eur) } as CatalogueItem,
    ]),
  )
}

// ---------------------------------------------------------------- limits and usage log

async function checkLimits(db: Db, userId: string, quoteId: string, config: Config) {
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const since = dayStart.toISOString()
  // deno-lint-ignore no-explicit-any
  const count = async (filter: (q: any) => PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await filter(db.from('ai_usage').select('id', { count: 'exact', head: true }).eq('kind', 'generate'))
    if (error) throw error
    return count ?? 0
  }
  const perQuote = config.int('limit_generations_per_quote', 20)
  if ((await count((q) => q.eq('quote_id', quoteId))) >= perQuote) {
    throw new UserError(
      `Questo preventivo ha raggiunto il massimo di ${perQuote} risposte dell’assistente. Puoi ancora modificare le voci a mano, oppure creare un preventivo nuovo.`,
    )
  }
  const perUser = config.int('limit_generations_per_user_day', 30)
  if ((await count((q) => q.eq('user_id', userId).gte('created_at', since))) >= perUser) {
    throw new UserError(`Hai raggiunto il limite di oggi (${perUser} risposte dell’assistente). Riprova domani: quello che hai scritto resta salvato.`)
  }
  if ((await count((q) => q.gte('created_at', since))) >= config.int('limit_generations_total_day', 150)) {
    throw new UserError('Il servizio ha raggiunto il limite di oggi per tutti gli utenti. Riprova domani: quello che hai scritto resta salvato.')
  }
}

/** One log line per AI call, with the running totals for the quote (for Gio, in the function logs). */
async function logQuoteUsage(db: Db, job: Job, usage: { input_tokens: number; output_tokens: number }) {
  const rows = await many(db.from('ai_usage').select('kind, input_tokens, output_tokens').eq('quote_id', job.quoteId))
  const ai = rows.filter((r) => r.kind === 'generate')
  console.log(
    JSON.stringify({
      event: 'ai_call',
      quote_id: job.quoteId,
      mode: job.mode,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      quote_ai_calls: ai.length,
      quote_transcriptions: rows.length - ai.length,
      quote_input_tokens: ai.reduce((s, r) => s + Number(r.input_tokens ?? 0), 0),
      quote_output_tokens: ai.reduce((s, r) => s + Number(r.output_tokens ?? 0), 0),
    }),
  )
}

// ---------------------------------------------------------------- transcription (OpenAI)

function openAiFileName(file: Row): string {
  const name = String(file.file_name ?? 'vocale')
  const mime = String(file.mime_type ?? '')
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  // WhatsApp voice notes are Ogg/Opus: same format, the ".opus" extension is not accepted.
  if (ext === 'opus' || mime.includes('ogg') || mime.includes('opus')) return 'vocale.ogg'
  if (mime.includes('webm')) return 'vocale.webm'
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'vocale.m4a'
  if (mime.includes('mpeg') || ext === 'mp3') return 'vocale.mp3'
  if (mime.includes('wav') || ext === 'wav') return 'vocale.wav'
  return ext ? `vocale.${ext}` : 'vocale.webm'
}

async function transcribe(db: Db, file: Row, model: string): Promise<string> {
  const label = String(file.file_name ?? 'vocale')
  const { data: blob, error } = await db.storage.from('audio').download(String(file.storage_path))
  if (error || !blob) throw new UserError(`Non riesco a leggere il vocale "${label}". Registralo di nuovo.`)
  if (blob.size > MAX_AUDIO_BYTES) throw new UserError(`Il vocale "${label}" è troppo lungo. Dividilo in vocali più brevi.`)

  const form = new FormData()
  form.append('file', blob, openAiFileName(file))
  form.append('model', model)
  form.append('language', 'it')
  form.append('response_format', 'json')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    console.error('openai', res.status, await res.text())
    throw new UserError(`Non sono riuscito a trascrivere il vocale "${label}". Riprova.`)
  }
  return String((await res.json()).text ?? '').trim()
}

// ---------------------------------------------------------------- AI context

type Context = {
  system: Anthropic.TextBlockParam[]
  content: Anthropic.ContentBlockParam[]
  pricing: ReturnType<typeof pricingInputs>
}

async function buildContext(
  db: Db,
  userId: string,
  quote: Row,
  job: Job,
  messages: ChatMessage[],
  files: Row[],
  config: Config,
): Promise<Context> {
  const [profile, priceItems, uplifts, discounts, versions] = await Promise.all([
    one(db.from('profiles').select('onboarding_answers, method_notes').eq('id', userId).single()),
    many(db.from('price_items').select('code, name, category, unit, price_eur, includes_material').eq('user_id', userId).order('sort_order')),
    many(db.from('series_uplift').select('marca, serie, uplift_per_point_eur, short_description')),
    many(db.from('discounts').select('brand, discount_pct').eq('user_id', userId)),
    many(db.from('quote_versions').select('id, version, ai_output').eq('quote_id', job.quoteId).order('version', { ascending: false }).limit(1)),
  ])
  const answers = parseAnswers(profile.onboarding_answers as never)
  const items = priceItems.map((p) => ({ ...p, price_eur: p.price_eur == null ? null : Number(p.price_eur) })) as unknown as PriceRow[]
  const upl = uplifts.map((u) => ({ ...u, uplift_per_point_eur: u.uplift_per_point_eur == null ? null : Number(u.uplift_per_point_eur) })) as unknown as UpliftRow[]
  const disc = discounts.map((d) => ({ brand: String(d.brand), discount_pct: d.discount_pct == null ? null : Number(d.discount_pct) })) as DiscountRow[]
  const excerpt = await catalogueExcerpt(db, answers)

  const content: Anthropic.ContentBlockParam[] = []
  // Stable per electrician: cached across the turns of a conversation.
  content.push({
    type: 'text',
    text: [
      methodText(answers, (profile.method_notes as string | null) ?? null, items, upl, disc),
      '',
      '## Estratto del catalogo (prezzi di listino, prima dello sconto) per le serie che usa',
      'codice | marca | serie | descrizione | listino',
      ...excerpt.map((c) => `${c.codice} | ${c.marca} | ${c.serie ?? ''} | ${c.descrizione} | ${c.prezzo_listino_eur ?? '—'} €`),
    ].join('\n'),
  })

  const skipped: string[] = []
  let budget = MAX_DOC_BYTES_TOTAL
  const addFile = async (bucket: string, path: string, name: string, mime: string) => {
    const { data: blob } = await db.storage.from(bucket).download(path)
    if (!blob) return skipped.push(name)
    const type = mime || blob.type
    const isPdf = type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')
    const isImage = IMAGE_TYPES.includes(type)
    const isText = type.startsWith('text/')
    if ((!isPdf && !isImage && !isText) || blob.size > budget || (isImage && blob.size > MAX_IMAGE_BYTES)) return skipped.push(name)
    budget -= blob.size
    content.push({ type: 'text', text: `File: ${name}` })
    if (isText) {
      content.push({ type: 'text', text: (await blob.text()).slice(0, 50_000) })
    } else {
      const data = encodeBase64(new Uint8Array(await blob.arrayBuffer()))
      content.push(
        isPdf
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
          : { type: 'image', source: { type: 'base64', media_type: type as 'image/jpeg', data } },
      )
    }
  }

  const { data: methodDocs } = await db.storage
    .from('quote-files')
    .list(`${userId}/metodo`, { sortBy: { column: 'created_at', order: 'desc' }, limit: MAX_METHOD_DOCS })
  const realMethodDocs = (methodDocs ?? []).filter((d) => d.id)
  if (realMethodDocs.length) {
    content.push({ type: 'text', text: '# Documenti dell’elettricista (listini, fatture, vecchi preventivi): servono a capire come lavora' })
    for (const d of realMethodDocs) {
      await addFile('quote-files', `${userId}/metodo/${d.name}`, d.name.replace(/^\d+-/, ''), String(d.metadata?.mimetype ?? ''))
    }
  }
  ;(content[content.length - 1] as { cache_control?: unknown }).cache_control = { type: 'ephemeral' }

  // This job: attachments in the order they were sent (older ones stay a stable, cacheable prefix).
  const docs = files.filter((f) => f.kind !== 'audio')
  if (docs.length) content.push({ type: 'text', text: '# Allegati di questo lavoro' })
  for (const f of docs) await addFile('quote-files', String(f.storage_path), String(f.file_name ?? 'documento'), String(f.mime_type ?? ''))

  const fileNames = Object.fromEntries(files.map((f) => [String(f.id), String(f.file_name ?? 'file')]))
  const parts: string[] = [
    '# Il lavoro',
    `Cliente: ${quote.client_name || 'non indicato'} · Indirizzo: ${quote.client_address || 'non indicato'} · Titolo: ${quote.job_title || 'non indicato'}`,
    `IVA di questo preventivo: ${quote.vat_rate}%`,
    '',
    '## Scheda lavoro attuale (JSON)',
    JSON.stringify(quote.job_sheet ?? {}),
    '',
    '## Conversazione',
    renderTranscript(messages, fileNames) || '(vuota)',
  ]
  if (skipped.length) parts.push('', `File che non hai potuto leggere (ignorali): ${skipped.join(', ')}`)

  const prev = versions[0]
  if (prev && job.mode !== 'conversation' && (prev.ai_output as Row | null)?.sections) {
    parts.push('', `## Preventivo attuale (versione ${prev.version}, JSON)`, JSON.stringify(prev.ai_output))
    const mine = await many(db.from('edits_log').select('line_ref, before, after').eq('quote_version_id', prev.id).order('created_at'))
    if (mine.length) {
      parts.push('', '## Correzioni manuali dell’elettricista su questa versione (valgono più delle tue stime)')
      for (const e of mine) parts.push(`- ${e.line_ref}: ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`)
    }
  }
  if (job.mode === 'apply') {
    const p = messages.find((m) => m.id === job.proposalMessageId)
    parts.push('', '## Proposta accettata dall’elettricista (JSON)', JSON.stringify(p?.payload ?? {}))
  }
  parts.push('', modeInstruction(job, answeredHoursPerDay(answers)))
  content.push({ type: 'text', text: parts.join('\n') })

  const pricing = pricingInputs(answers, items, disc, upl, Number(quote.vat_rate) || 10)
  pricing.catalogue = Object.fromEntries(excerpt.map((c) => [c.codice.toUpperCase(), c]))
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: config.str('system_prompt_v2', config.str('system_prompt', '')) },
    { type: 'text', text: TECHNICAL_RULES, cache_control: { type: 'ephemeral' } },
  ]
  return { system, content, pricing }
}

/** A few common items per series the electrician uses, so the AI can cite real codes and prices. */
async function catalogueExcerpt(db: Db, answers: ReturnType<typeof parseAnswers>): Promise<(CatalogueItem & { serie: string | null })[]> {
  const series = (['base', 'media', 'top'] as const)
    .map((t) => seriesForTier(answers, t))
    .flatMap((s) => ('marca' in s ? [s] : []))
  const unique = [...new Map(series.map((s) => [`${s.marca}|${s.serie}`, s])).values()]
  if (!unique.length) unique.push(SERIES[0])
  const keywords = ['deviatore', 'invertitore', 'interruttore', 'pulsante', 'presa', 'placca', 'supporto']
  const queries = unique.flatMap((s) =>
    keywords.map((k) =>
      db
        .from('catalogue')
        .select('codice, marca, serie, descrizione, prezzo_listino_eur, unita')
        .eq('marca', s.marca)
        .eq('serie', s.serie)
        .ilike('descrizione', `%${k}%`)
        .not('descrizione', 'ilike', '%connesso%')
        .not('descrizione', 'ilike', '%iot%')
        .not('prezzo_listino_eur', 'is', null)
        .order('prezzo_listino_eur')
        .limit(k === 'presa' ? 3 : 2),
    ),
  )
  const results = await Promise.all(queries)
  const rows = results.flatMap((r) => (r.data ?? []) as Row[])
  return [...new Map(rows.map((r) => [String(r.codice), r])).values()].map((r) => ({
    codice: String(r.codice),
    marca: String(r.marca),
    serie: (r.serie as string | null) ?? null,
    descrizione: String(r.descrizione),
    prezzo_listino_eur: r.prezzo_listino_eur == null ? null : Number(r.prezzo_listino_eur),
    unita: (r.unita as string | null) ?? null,
  }))
}

function modeInstruction(job: Job, hoursPerDay: number | null): string {
  const day = hoursPerDay
    ? `La giornata di lavoro è di ${hoursPerDay} ore (risposta dell’elettricista nel suo metodo): usala senza chiederla e scrivila nel riepilogo ("giornata da ${hoursPerDay} ore, come nel tuo metodo").`
    : 'Le ore di una giornata di lavoro non sono nel suo metodo: chiedile.'
  switch (job.mode) {
    case 'conversation':
      return `ORA (raccolta): aggiorna la scheda lavoro e rispondi con type "questions" oppure, se i fatti obbligatori sono confermati, "ready_to_generate". ${day} Persone e giorni vanno sempre chiesti per questo lavoro.`
    case 'generate':
      return `ORA: prepara il preventivo completo (type "quote"). ${day}${
        job.force ? ' L’elettricista ha chiesto di generare subito: dove mancano fatti fai un’ipotesi ragionevole e scrivila in assumptions e in to_check.' : ''
      }`
    case 'revise':
      return 'ORA (revisione): l’elettricista commenta il preventivo attuale. Rispondi con type "proposal" (modifiche chiare con effetto indicativo in euro) oppure, se la richiesta è ambigua, con una sola domanda (type "questions").'
    case 'apply':
      return 'ORA: applica la proposta accettata al preventivo attuale e restituisci il preventivo completo aggiornato (type "quote"). Mantieni il line_id delle righe che non cambiano; righe nuove con line_id nuovi.'
  }
}

const TECHNICAL_RULES = `Regole tecniche dell’app (valgono sempre e prevalgono sul formato descritto sopra):
- Rispondi solo con l’oggetto JSON richiesto: { job_sheet, reply }. Tutto in italiano.
- Valori sconosciuti: testo "" (stringa vuota), numeri 0, scelte "non_so"/"nessuno", elenchi vuoti. Non inventare valori per riempire i campi.
- job_sheet.metodo è un elenco di {sezione, metodo}. squadra.ore_giorno: le ore di una giornata.
- Domande: al massimo 3, le più importanti prima; l’app le mostra una alla volta. Per ognuna:
  · text: la domanda, chiara e completa anche letta da sola (es. "Quante persone lavorano a questo ricablaggio e per quanti giorni?", non "Squadra?").
  · why: una frase che spiega perché lo chiedi e cosa cambia nel prezzo (es. "Il ricablaggio lo calcolo a ore: persone e giorni decidono la manodopera.").
  · options: 2–5 risposte corte e concrete. Non mettere "Altro" o "Scrivo io": l’elettricista può sempre scrivere o rispondere a voce.
  · Un dubbio (challenges) va collegato con question_id alla domanda a cui si riferisce ("" se generale).
- method_proposal: una riga per sezione con il metodo e il perché; elenco vuoto se l’hai già proposto o non serve.
- Righe del preventivo: line_id brevi e univoci ("L1", "L2", …). kind "ore": qty = ore totali di quella persona, worker "titolare" o "aiutante", unit_price 0 (salvo che lui abbia detto una tariffa diversa: allora unit_price e source "detto_da_te"). kind "punto"/"forfait": price_item_code dal suo listino, unit_price 0, worker "nessuno".
- Materiali: catalogue_code solo con un codice dell’estratto del catalogo (o detto da lui), unit_price 0. Per materiali non presenti nel catalogo (cavi, tubi, scatole, apparecchi…) metti in unit_price la tua stima del prezzo di listino prima dello sconto, con source "mia_stima": l’app applica il suo sconto e il suo ricarico. Se un prezzo te l’ha detto lui, è il prezzo finale: source "detto_da_te". price_missing = true solo se non hai nessun prezzo.
- is_certificate = true sulla riga della dichiarazione di conformità; l’app la mette a 0 € ("inclusa") quando job_sheet.dico = "inclusa".
- replaces_device = true solo sulle righe dove il frutto (interruttore, presa…) viene cambiato: solo lì si applica il sovrapprezzo della serie. tiers.offered = false se non si cambia nessun frutto (riempi comunque base, consigliata e top con testi brevi).
- to_check: ogni voce con il line_id della riga a cui si riferisce ("" se generale).
- why delle righe: una frase breve con la fonte dei numeri (es. "2 persone × 1,5 giorni × 8 h, detto da te").
- I totali, l’IVA, gli sconti e i ricarichi li calcola l’app: non scriverli.`

// ---------------------------------------------------------------- AI call (Anthropic)

async function askAi(config: Config, model: string, ctx: Context, mode: Mode, t0: number) {
  const remaining = AI_DEADLINE_MS - (Date.now() - t0)
  if (remaining < 30_000) throw new UserError(GENERIC_ERROR)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), remaining)
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 0 })

  try {
    const stream = client.messages.stream(
      {
        model,
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: config.str('ai_effort', 'medium') as 'low' | 'medium' | 'high',
          format: { type: 'json_schema', schema: replySchema(mode) },
        },
        system: ctx.system,
        messages: [{ role: 'user', content: ctx.content }],
      },
      { signal: controller.signal },
    )
    const msg = await stream.finalMessage()
    const usage = { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens }

    if (msg.stop_reason === 'refusal') {
      throw new UserError('Non sono riuscito a rispondere a questo messaggio. Prova a scriverlo in modo diverso.')
    }
    if (msg.stop_reason === 'max_tokens') {
      throw new UserError('Il lavoro è troppo grande da preparare in una volta. Prova a dividerlo in più preventivi.')
    }
    const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    const reply = normalizeReply(JSON.parse(text))
    if (reply.type === 'questions' && !reply.questions.length && !reply.method_proposal) throw new Error('no questions')
    if (reply.type === 'quote' && !reply.sections.length) throw new Error('empty quote')
    return { reply, usage }
  } catch (e) {
    if (controller.signal.aborted) {
      throw new UserError('Ci sta mettendo troppo. Riprova: spesso la seconda volta è più veloce.')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------- helpers

type Config = { str(key: string, fallback: string): string; int(key: string, fallback: number): number }

async function loadConfig(db: Db): Promise<Config> {
  const rows = await many(db.from('app_config').select('key, value'))
  const map = new Map(rows.map((r) => [String(r.key), String(r.value)]))
  return {
    str: (k, f) => map.get(k) || f,
    int: (k, f) => {
      const n = Number(map.get(k))
      return Number.isFinite(n) && n > 0 ? n : f
    },
  }
}

async function one(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row> {
  const { data, error } = await q
  if (error || !data) throw error ?? new Error('not found')
  return data as Row
}

async function many(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const { data, error } = await q
  if (error) throw error
  return (data as Row[]) ?? []
}
