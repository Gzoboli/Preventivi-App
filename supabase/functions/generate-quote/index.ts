// generate-quote: turns a quote_versions row (status 'processing') into questions or a quote.
//
// Supabase Free plan kills a function after 150 s, so the work is split in steps, one per call:
//   1. transcribe the quote's voice notes (as many as fit in ~70 s), then call itself again;
//   2. one AI call (Anthropic, structured JSON) with a hard 125 s cutoff, then save the result.
// A lease (quote_versions.run_started_at) guarantees one step at a time per version.
// Every paid call is logged in ai_usage and checked against the limits in app_config first.
//
// Called by the app with the user's JWT ({ quote_version_id }), or by itself with the service key.

import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { parseAnswers } from '../_shared/answers.ts'
import { methodText, pricingContext, pricingMethod } from '../_shared/method.ts'
import { replyMode, replySchema, type ReplyMode } from '../_shared/aiSchema.ts'
import { computeTotals, type AiClarify, type AiOutput, type AiQuote } from '../_shared/totals.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

const LEASE_SECONDS = 170 // > wall-clock limit: an older lease belongs to a killed run
const TRANSCRIBE_BUDGET_MS = 70_000
const AI_DEADLINE_MS = 125_000
const MAX_AUDIO_BYTES = 24 * 1024 * 1024 // OpenAI limit is 25 MB
const MAX_DOC_BYTES_TOTAL = 20 * 1024 * 1024 // stays under the 32 MB request limit after base64
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_METHOD_DOCS = 5
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

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

Deno.serve(async (req) => {
  const t0 = Date.now()
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  let id: string | undefined
  try {
    id = (await req.json())?.quote_version_id
  } catch {
    /* handled below */
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'quote_version_id' }, 400)

  const db: Db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')

  if (token !== SERVICE_KEY) {
    // Called by the app: the caller must own this version.
    const { data: auth } = await db.auth.getUser(token)
    if (!auth?.user) return json({ error: 'auth' }, 401)
    const { data: v } = await db.from('quote_versions').select('user_id').eq('id', id).maybeSingle()
    if (!v || v.user_id !== auth.user.id) return json({ error: 'not_found' }, 404)
  }

  EdgeRuntime.waitUntil(runStep(db, id, t0))
  return json({ accepted: true }, 202)
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// ---------------------------------------------------------------- step runner

async function runStep(db: Db, versionId: string, t0: number) {
  const cutoff = new Date(Date.now() - LEASE_SECONDS * 1000).toISOString()
  const { data: version } = await db
    .from('quote_versions')
    .update({ run_started_at: new Date().toISOString() })
    .eq('id', versionId)
    .eq('status', 'processing')
    .or(`run_started_at.is.null,run_started_at.lt."${cutoff}"`)
    .select('*')
    .maybeSingle()
  if (!version) return // already running, or nothing to do

  try {
    const next = await step(db, version, t0)
    await db.from('quote_versions').update({ run_started_at: null }).eq('id', versionId)
    if (next === 'continue') await callSelf(versionId)
  } catch (e) {
    console.error('generate-quote', versionId, e)
    await db
      .from('quote_versions')
      .update({ status: 'error', error_message: e instanceof UserError ? e.message : GENERIC_ERROR, run_started_at: null })
      .eq('id', versionId)
  }
}

async function callSelf(versionId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-quote`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quote_version_id: versionId }),
  })
  if (res.status !== 202) throw new Error(`self-call ${res.status}: ${await res.text()}`)
}

async function step(db: Db, version: Row, t0: number): Promise<'continue' | 'done'> {
  const userId = version.user_id as string
  const [quote, files, config] = await Promise.all([
    one(db.from('quotes').select('*').eq('id', version.quote_id).eq('user_id', userId).single()),
    many(db.from('quote_files').select('*').eq('quote_id', version.quote_id).eq('user_id', userId).order('uploaded_at')),
    loadConfig(db),
  ])

  // 1. Transcription
  const audio = files.filter((f) => f.kind === 'audio')
  if (audio.length > config.int('limit_audio_files_per_quote', 8)) {
    throw new UserError(`Troppi vocali per un preventivo (massimo ${config.int('limit_audio_files_per_quote', 8)}). Togline qualcuno e riprova.`)
  }
  const transcripts = (version.transcripts as { file_id: string; text: string }[] | null) ?? []
  const pending = audio.filter((f) => !transcripts.some((t) => t.file_id === f.id))
  if (pending.length) {
    for (const file of pending) {
      if (Date.now() - t0 > TRANSCRIBE_BUDGET_MS) break
      const text = await transcribe(db, file, config.str('transcription_model', 'gpt-4o-transcribe'))
      transcripts.push({ file_id: file.id as string, text })
      await db.from('quote_versions').update({ transcripts }).eq('id', version.id)
      await db.from('ai_usage').insert({
        user_id: userId, quote_id: quote.id, quote_version_id: version.id, kind: 'transcribe',
        model: config.str('transcription_model', 'gpt-4o-transcribe'),
      })
    }
    return 'continue' // the AI step always starts in a fresh call, with the full time budget
  }

  // 2. AI
  await checkLimits(db, userId, quote.id as string, config)
  const { data: usage } = await db
    .from('ai_usage')
    .insert({ user_id: userId, quote_id: quote.id, quote_version_id: version.id, kind: 'generate', model: config.str('ai_model', 'claude-sonnet-5-5') })
    .select('id')
    .single()

  const clarifications = (version.clarifications as Clarification[] | null) ?? []
  const mode = replyMode(version.version as number, clarifications.length)
  const context = await buildContext(db, userId, quote, version, files, transcripts, clarifications, mode)
  const { reply, usage: tokens } = await askAi(config, context, mode, t0)
  if (usage) await db.from('ai_usage').update(tokens).eq('id', usage.id)

  if (reply.type === 'clarify') {
    await db.from('quote_versions').update({ status: 'needs_answers', ai_output: reply, error_message: null }).eq('id', version.id)
    return 'done'
  }

  const totals = computeTotals(reply, context.pricing)
  await db
    .from('quote_versions')
    .update({ status: 'ready', ai_output: reply, totals, error_message: null })
    .eq('id', version.id)
  if (!(quote.job_title as string | null)?.trim() && reply.title) {
    await db.from('quotes').update({ job_title: reply.title }).eq('id', quote.id)
  }
  return 'done'
}

// ---------------------------------------------------------------- limits

async function checkLimits(db: Db, userId: string, quoteId: string, config: Config) {
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const since = dayStart.toISOString()
  // deno-lint-ignore no-explicit-any
  const countGenerations = async (filter: (q: any) => PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await filter(db.from('ai_usage').select('id', { count: 'exact', head: true }).eq('kind', 'generate'))
    if (error) throw error
    return count ?? 0
  }

  if ((await countGenerations((q) => q.eq('quote_id', quoteId))) >= config.int('limit_generations_per_quote', 5)) {
    throw new UserError('Hai raggiunto il numero massimo di tentativi per questo preventivo. Creane uno nuovo con una descrizione più completa.')
  }
  if ((await countGenerations((q) => q.eq('user_id', userId).gte('created_at', since))) >= config.int('limit_generations_per_user_day', 12)) {
    throw new UserError('Hai raggiunto il limite giornaliero di preventivi. Riprova domani.')
  }
  if ((await countGenerations((q) => q.gte('created_at', since))) >= config.int('limit_generations_total_day', 40)) {
    throw new UserError('Il servizio ha raggiunto il limite di oggi. Riprova domani.')
  }
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
  if (error || !blob) throw new UserError(`Non riesco a leggere il vocale "${label}". Toglilo e caricalo di nuovo.`)
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

type Clarification = {
  understanding: string
  questions: { id: string; text: string; options: string[]; multi: boolean }[]
  answers: { id: string; selected: string[]; custom: string | null }[]
}

type Context = {
  system: string
  content: Anthropic.ContentBlockParam[]
  pricing: ReturnType<typeof pricingContext>
}

async function buildContext(
  db: Db,
  userId: string,
  quote: Row,
  version: Row,
  files: Row[],
  transcripts: { file_id: string; text: string }[],
  clarifications: Clarification[],
  mode: ReplyMode,
): Promise<Context> {
  const [profile, priceItems, uplifts, config] = await Promise.all([
    one(db.from('profiles').select('onboarding_answers, method_notes').eq('id', userId).single()),
    many(db.from('price_items').select('code, name, category, unit, price_eur, includes_material').eq('user_id', userId).order('sort_order')),
    many(db.from('series_uplift').select('marca, serie, uplift_per_point_eur, short_description')),
    loadConfig(db),
  ])
  const answers = parseAnswers(profile.onboarding_answers as never)
  const items = priceItems.map((p) => ({ ...p, price_eur: p.price_eur == null ? null : Number(p.price_eur) })) as never[]
  const upl = uplifts.map((u) => ({ ...u, uplift_per_point_eur: u.uplift_per_point_eur == null ? null : Number(u.uplift_per_point_eur) })) as never[]

  const content: Anthropic.ContentBlockParam[] = []
  const skipped: string[] = []
  let budget = MAX_DOC_BYTES_TOTAL

  const addFile = async (bucket: string, path: string, name: string, mime: string) => {
    const { data: blob } = await db.storage.from(bucket).download(path)
    if (!blob) return skipped.push(name)
    const type = mime || blob.type
    const isPdf = type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')
    const isImage = IMAGE_TYPES.includes(type)
    const isText = type.startsWith('text/')
    if ((!isPdf && !isImage && !isText) || blob.size > budget || (isImage && blob.size > MAX_IMAGE_BYTES)) {
      return skipped.push(name)
    }
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

  // Job documents first (most relevant), then the electrician's own documents from "Il mio metodo".
  const docs = files.filter((f) => f.kind !== 'audio')
  if (docs.length) content.push({ type: 'text', text: '# Documenti allegati a questo lavoro' })
  for (const f of docs) await addFile('quote-files', String(f.storage_path), String(f.file_name ?? 'documento'), String(f.mime_type ?? ''))

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

  const parts: string[] = []
  parts.push(methodText(answers, (profile.method_notes as string | null) ?? null, items, upl))
  parts.push(
    '',
    '# Il lavoro',
    `Cliente: ${quote.client_name || 'non indicato'} · Indirizzo: ${quote.client_address || 'non indicato'}`,
    `Titolo: ${quote.job_title || 'non indicato'}`,
    `IVA di questo preventivo: ${quote.vat_rate}%`,
    '',
    '## Descrizione scritta dall’elettricista',
    String(version.input_text || '(nessun testo)'),
  )
  if (transcripts.length) {
    parts.push('', '## Trascrizione dei vocali')
    transcripts.forEach((t, i) => parts.push(`Vocale ${i + 1}: ${t.text || '(vuoto)'}`))
  }
  if (skipped.length) parts.push('', `File che non hai potuto leggere (ignorali): ${skipped.join(', ')}`)

  if ((version.version as number) > 1) {
    const prev = await one(
      db.from('quote_versions').select('ai_output').eq('quote_id', version.quote_id).eq('version', (version.version as number) - 1).single(),
    )
    parts.push('', '## Versione precedente del preventivo (JSON)', JSON.stringify(prev.ai_output))
    parts.push('', '## Cosa vuole cambiare l’elettricista', String(version.feedback || '(nessuna indicazione)'))
  }

  clarifications.forEach((c, i) => {
    parts.push('', `## Chiarimenti, giro ${i + 1}`, `Avevi capito: ${c.understanding}`)
    for (const q of c.questions) {
      const a = c.answers.find((x) => x.id === q.id)
      const answer = [...(a?.selected ?? []), ...(a?.custom ? [a.custom] : [])].join('; ') || '(nessuna risposta)'
      parts.push(`- ${q.text} → ${answer}`)
    }
  })

  parts.push(
    '',
    mode === 'clarify_only'
      ? 'ORA: non preparare ancora il preventivo. Scrivi cosa hai capito e fai le domande che servono (reply.type = "clarify").'
      : mode === 'quote_only'
        ? 'ORA: prepara il preventivo (reply.type = "quote"). Dove resta un dubbio, fai un’ipotesi ragionevole e scrivila in assumptions.'
        : 'ORA: se hai le informazioni essenziali prepara il preventivo; altrimenti fai un ultimo giro di domande.',
  )
  content.push({ type: 'text', text: parts.join('\n') })

  const pricing = pricingContext(answers, items, Number(quote.vat_rate) || 10, upl)
  const system = [config.str('system_prompt', ''), TECHNICAL_RULES(pricingMethod(answers))].filter(Boolean).join('\n\n')
  return { system, content, pricing }
}

const TECHNICAL_RULES = (method: string) => `Regole tecniche (valgono sempre):
- Rispondi solo con l'oggetto JSON richiesto, nel campo "reply". Tutto in italiano.
- Prima di preparare un preventivo verifica sempre di aver capito il lavoro. In "understanding" riassumi in modo semplice cosa hai capito (tipo di intervento, stanze, metrature, cose incerte). Poi fai da 1 a 4 domande brevi, ognuna con 2–5 opzioni corte da toccare; l'elettricista può sempre scrivere una risposta diversa. Chiedi solo ciò che cambia davvero il preventivo.
- Nel preventivo usa le voci del listino dell'elettricista: metti il codice in price_item_code e unit_price = null. Non inventare prezzi per voci che sono nel listino.
- Per voci che non sono nel listino: price_item_code = null, unit_price = tua stima (per il materiale: prezzo di listino prima degli sconti), to_confirm = true.
- ${method === 'a_ore' ? "Questo elettricista lavora a ore: usa righe kind 'ore' (qty = ore stimate, worker 'titolare' o 'aiutante') e righe kind 'materiale' per il materiale." : method === 'misto' ? "Questo elettricista fa l'impianto a punto e il resto a ore: righe 'punto' per i punti, righe 'ore' (worker 'titolare' o 'aiutante') per il resto." : "Questo elettricista lavora a punto: usa righe kind 'punto' con le voci del listino; righe 'ore' solo per lavori che non si fanno a punto."}
- counts_as_point = true solo per interruttori, deviatori, pulsanti e prese (anche TV e dati) che non hanno un codice di listino.
- Non calcolare totali, IVA o sconti: li calcola l'app.
- Esclusioni: parti da quelle abituali dell'elettricista. Ipotesi: tutto ciò che hai supposto; aggiungi sempre che il sovrapprezzo delle opzioni Media e Top è stimato dai listini dei produttori e va confermato.
- tiers: per base, media e top scrivi 3 frasi brevi (what_you_get) su cosa ottiene il cliente con quella serie.
- estimated_days: giorni lavorativi stimati, o null se non stimabile.`

// ---------------------------------------------------------------- AI call (Anthropic)

async function askAi(config: Config, ctx: Context, mode: ReplyMode, t0: number) {
  const remaining = AI_DEADLINE_MS - (Date.now() - t0)
  if (remaining < 30_000) throw new UserError(GENERIC_ERROR)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), remaining)
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 0 })

  try {
    const stream = client.messages.stream(
      {
        model: config.str('ai_model', 'claude-sonnet-5-5'),
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
      throw new UserError('Non sono riuscito a preparare questo preventivo. Prova a descrivere il lavoro in modo diverso.')
    }
    if (msg.stop_reason === 'max_tokens') {
      throw new UserError('Il lavoro è troppo grande da preparare in una volta. Prova a dividerlo in più preventivi.')
    }
    const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    const reply = JSON.parse(text).reply as AiOutput
    if (!reply || (reply.type !== 'clarify' && reply.type !== 'quote')) throw new Error('bad reply')
    if (reply.type === 'clarify' && !(reply as AiClarify).questions.length) throw new Error('no questions')
    if (reply.type === 'quote' && !(reply as AiQuote).rooms.length) throw new Error('empty quote')
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
