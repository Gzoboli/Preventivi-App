// The quote conversation (Task 3b): messages, AI runs, manual edits. RLS scopes everything to the user.
import { supabase } from './supabase'
import { uploadQuoteFile } from './quotes'
import type { Json, QuoteMessage, QuoteVersion } from '../types/db'
import type { Mode } from '../../supabase/functions/_shared/aiSchema.ts'
import type { AnswersPayload, ChatMessage, ProposalPayload, QuestionRef } from '../../supabase/functions/_shared/chat.ts'
import { aggregate, type AiLine, type AiQuote, type PricedLine, type Totals } from '../../supabase/functions/_shared/pricing.ts'

export type { ChatMessage }

/** What the electrician attaches to one message (or to one question card). */
export type Outgoing = {
  text: string
  audio: { blob: Blob; name: string } | null
  files: File[]
}

export const EMPTY_OUTGOING: Outgoing = { text: '', audio: null, files: [] }
export const isEmpty = (o: Outgoing) => !o.text.trim() && !o.audio && !o.files.length

export function asChat(m: QuoteMessage): ChatMessage {
  return {
    ...m,
    role: m.role as ChatMessage['role'],
    kind: m.kind as ChatMessage['kind'],
    file_ids: m.file_ids ?? [],
    payload: (m.payload && typeof m.payload === 'object' && !Array.isArray(m.payload) ? m.payload : {}) as Record<string, unknown>,
  }
}

async function insertMessage(row: {
  quote_id: string
  kind: ChatMessage['kind']
  text?: string | null
  audio_file_id?: string | null
  file_ids?: string[]
  payload?: Record<string, unknown>
}) {
  const { error } = await supabase.from('quote_messages').insert({ role: 'electrician', ...row, payload: (row.payload ?? {}) as Json })
  if (error) throw error
}

/** Uploads and posts what was typed, recorded and attached, in that order. Returns true if anything was sent. */
export async function postOutgoing(userId: string, quoteId: string, out: Outgoing, ref: QuestionRef = {}): Promise<boolean> {
  let sent = false
  if (out.text.trim() && !ref.question_id) {
    await insertMessage({ quote_id: quoteId, kind: 'text', text: out.text.trim() })
    sent = true
  }
  if (out.audio) {
    const file = await uploadQuoteFile(userId, quoteId, out.audio.blob, out.audio.name, 'audio')
    await insertMessage({ quote_id: quoteId, kind: 'voice', audio_file_id: file.id, text: null, payload: ref })
    sent = true
  }
  if (out.files.length) {
    const ids: string[] = []
    for (const f of out.files) ids.push((await uploadQuoteFile(userId, quoteId, f, f.name, 'document')).id)
    await insertMessage({ quote_id: quoteId, kind: 'file', file_ids: ids, payload: ref })
    sent = true
  }
  return sent
}

/** Asks the edge function to work on the quote (it answers in the chat). */
export async function runAi(quoteId: string, mode: Mode, opts: { proposalMessageId?: string; force?: boolean } = {}) {
  const { error } = await supabase.functions.invoke('generate-quote', {
    body: { quote_id: quoteId, mode, proposal_message_id: opts.proposalMessageId ?? null, force: !!opts.force },
  })
  if (error) throw error
}

/** "Invia risposte": one message with the tapped/typed answers, then each card's voice and files. */
export async function sendAnswers(
  userId: string,
  quoteId: string,
  payload: AnswersPayload,
  perQuestion: { question_id: string; question: string; out: Outgoing }[],
) {
  const summary = payload.answers
    .map((a) => `${a.question} → ${[...a.selected, ...(a.custom ? [a.custom] : [])].join('; ') || '—'}`)
    .join('\n')
  if (payload.answers.some((a) => a.selected.length || a.custom) || payload.method_choices?.length) {
    await insertMessage({ quote_id: quoteId, kind: 'text', text: summary, payload: payload as unknown as Record<string, unknown> })
  }
  for (const q of perQuestion) {
    await postOutgoing(userId, quoteId, { ...q.out, text: '' }, { question_id: q.question_id, question: q.question })
  }
}

export async function addNote(quoteId: string, text: string) {
  await insertMessage({ quote_id: quoteId, kind: 'note', text })
}

/** Corrects the transcript of a voice message. */
export async function updateMessageText(id: string, text: string) {
  const { error } = await supabase.from('quote_messages').update({ text }).eq('id', id)
  if (error) throw error
}

export async function cancelProposal(quoteId: string, message: ChatMessage) {
  const payload = { ...(message.payload as unknown as ProposalPayload), status: 'cancelled' }
  const { error } = await supabase.from('quote_messages').update({ payload: payload as unknown as Json }).eq('id', message.id)
  if (error) throw error
  await addNote(quoteId, 'Ho annullato la proposta di modifica.')
  await supabase.from('quotes').update({ phase: 'generato' }).eq('id', quoteId)
}

export async function signedUrl(bucket: 'audio' | 'quote-files', path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}

// ---------------------------------------------------------------- manual edits on a generated quote

export type LineEdit = { description: string; qty: number; unit_price: number | null; kind: AiLine['kind'] }

function withLine(quote: AiQuote, id: string, fn: (l: AiLine) => AiLine | null): AiQuote {
  return {
    ...quote,
    sections: quote.sections.map((s) => ({
      ...s,
      lines: s.lines.flatMap((l) => {
        if (l.line_id !== id) return [l]
        const next = fn(l)
        return next ? [next] : []
      }),
    })),
  }
}

/** Saves a manual change in place on the current version, logs it, and tells the AI in the chat. */
async function saveVersion(version: QuoteVersion, quote: AiQuote, lines: PricedLine[], log: { line_ref: string; before: unknown; after: unknown }[], note: string) {
  const prev = version.totals as unknown as Totals
  const totals = aggregate(quote, lines, { vatRate: prev.vat_rate, uplift: prev.uplift, hoursPerDay: prev.hours_per_day, upgrade: prev.upgrade })
  const { error } = await supabase
    .from('quote_versions')
    .update({ ai_output: quote as unknown as Json, totals: totals as unknown as Json })
    .eq('id', version.id)
  if (error) throw error
  if (log.length) {
    await supabase.from('edits_log').insert(
      log.map((l) => ({ quote_version_id: version.id, line_ref: l.line_ref, before: l.before as Json, after: l.after as Json })),
    )
  }
  await addNote(version.quote_id, note)
}

export async function editLine(version: QuoteVersion, line: AiLine, edit: LineEdit) {
  const quote = withLine(version.ai_output as unknown as AiQuote, line.line_id, (l) => ({
    ...l,
    description: edit.description,
    qty: edit.qty,
    kind: edit.kind,
    unit_price: edit.unit_price ?? l.unit_price,
    source: edit.unit_price != null && edit.unit_price !== l.unit_price ? 'detto_da_te' : l.source,
    quantity_estimated: edit.qty !== l.qty ? false : l.quantity_estimated,
    price_missing: edit.unit_price != null ? false : l.price_missing,
  }))
  const prev = (version.totals as unknown as Totals).lines
  const lines = prev.map((p) => {
    if (p.line_id !== line.line_id || edit.unit_price == null || edit.unit_price === p.unit_price) return p
    return { ...p, unit_price: edit.unit_price, price_source: 'detto' as const, breakdown: 'Prezzo inserito da te', price_missing: false, catalogue: null }
  })
  const before = { description: line.description, qty: line.qty, unit_price: prev.find((p) => p.line_id === line.line_id)?.unit_price ?? null, kind: line.kind }
  const changes: string[] = []
  if (before.qty !== edit.qty) changes.push(`quantità ${before.qty} → ${edit.qty}`)
  if (edit.unit_price != null && before.unit_price !== edit.unit_price) changes.push(`prezzo ${before.unit_price ?? '—'} → ${edit.unit_price} €`)
  if (before.kind !== edit.kind) changes.push(`tipo ${before.kind} → ${edit.kind}`)
  if (before.description !== edit.description) changes.push(`descrizione «${edit.description}»`)
  await saveVersion(version, quote, lines, [{ line_ref: line.line_id, before, after: edit }], `Ho modificato a mano «${line.description}»: ${changes.join(', ') || 'nessun cambiamento'}.`)
}

export async function deleteLines(version: QuoteVersion, ids: string[], reason: string) {
  let quote = version.ai_output as unknown as AiQuote
  const removed: AiLine[] = []
  for (const id of ids) {
    quote = withLine(quote, id, (l) => {
      removed.push(l)
      return null
    })
  }
  const lines = (version.totals as unknown as Totals).lines.filter((l) => !ids.includes(l.line_id))
  await saveVersion(
    version,
    quote,
    lines,
    removed.map((l) => ({ line_ref: l.line_id, before: { description: l.description, qty: l.qty }, after: null })),
    `${reason}: ${removed.map((l) => `«${l.description}»`).join(', ')}.`,
  )
}
