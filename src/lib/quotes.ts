// Quote data access for the app. RLS scopes every query to the logged-in electrician.
import { supabase } from './supabase'
import { safeFileName } from './methodDocuments'
import type { Json, Quote, QuoteFile, QuoteVersion, VatRate } from '../types/db'
import type { AiClarify, AiQuote, Totals } from '../../supabase/functions/_shared/totals.ts'

export type { AiClarify, AiQuote, Totals }

export const MAX_AUDIO_MB = 24
export const MAX_DOCUMENT_MB = 20
export const MAX_RECORDING_SECONDS = 5 * 60
export const AUDIO_ACCEPT = '.ogg,.opus,.m4a,.mp3,.wav,.webm,audio/*'

/** Types the AI can read (others are kept with the quote but ignored by the AI). */
export function aiCanRead(mime: string | null, name: string | null): boolean {
  const m = (mime ?? '').toLowerCase()
  return (
    m === 'application/pdf' ||
    (name ?? '').toLowerCase().endsWith('.pdf') ||
    ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(m) ||
    m.startsWith('text/')
  )
}

export function quoteNumber(q: Pick<Quote, 'quote_year' | 'quote_number'>): string {
  return `${q.quote_year}/${String(q.quote_number).padStart(3, '0')}`
}

export async function createQuote(vatRate: VatRate): Promise<Quote> {
  const { data, error } = await supabase.from('quotes').insert({ vat_rate: vatRate }).select().single()
  if (error) throw error
  return data
}

export async function updateQuote(id: string, patch: Partial<Pick<Quote, 'client_name' | 'client_address' | 'job_title' | 'vat_rate'>>) {
  const { error } = await supabase.from('quotes').update(patch).eq('id', id)
  if (error) throw error
}

export async function uploadQuoteFile(userId: string, quoteId: string, file: File | Blob, name: string, kind: 'audio' | 'document'): Promise<QuoteFile> {
  const bucket = kind === 'audio' ? 'audio' : 'quote-files'
  const path = `${userId}/${quoteId}/${Date.now()}-${safeFileName(name)}`
  const mime = file.type || null
  const up = await supabase.storage.from(bucket).upload(path, file, { contentType: mime ?? undefined })
  if (up.error) throw up.error
  const { data, error } = await supabase
    .from('quote_files')
    .insert({ quote_id: quoteId, storage_path: path, file_name: name, mime_type: mime, kind })
    .select()
    .single()
  if (error) {
    await supabase.storage.from(bucket).remove([path])
    throw error
  }
  return data
}

export async function removeQuoteFile(file: QuoteFile) {
  await supabase.storage.from(file.kind === 'audio' ? 'audio' : 'quote-files').remove([file.storage_path])
  const { error } = await supabase.from('quote_files').delete().eq('id', file.id)
  if (error) throw error
}

async function runGeneration(versionId: string) {
  const { error } = await supabase.functions.invoke('generate-quote', { body: { quote_version_id: versionId } })
  if (error) throw error
}

/** Starts a new version (or restarts `existing` with a corrected description) and calls the AI. */
export async function startGeneration(quoteId: string, inputText: string, existing?: QuoteVersion): Promise<QuoteVersion> {
  let version: QuoteVersion
  if (existing) {
    const { data, error } = await supabase
      .from('quote_versions')
      .update({ input_text: inputText, clarifications: [], ai_output: null, totals: null, status: 'processing', error_message: null })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    version = data
  } else {
    const { data: last } = await supabase
      .from('quote_versions')
      .select('version')
      .eq('quote_id', quoteId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { data, error } = await supabase
      .from('quote_versions')
      .insert({ quote_id: quoteId, version: (last?.version ?? 0) + 1, input_text: inputText, status: 'processing' })
      .select()
      .single()
    if (error) throw error
    version = data
  }
  await runGeneration(version.id)
  return version
}

export type ClarifyAnswer = { id: string; selected: string[]; custom: string | null }

/** Saves the answers to the AI's questions and continues the generation. */
export async function answerClarify(version: QuoteVersion, clarify: AiClarify, answers: ClarifyAnswer[]) {
  const previous = Array.isArray(version.clarifications) ? version.clarifications : []
  const round = { understanding: clarify.understanding, questions: clarify.questions, answers }
  const { error } = await supabase
    .from('quote_versions')
    .update({ clarifications: [...previous, round] as unknown as Json, status: 'processing', error_message: null })
    .eq('id', version.id)
  if (error) throw error
  await runGeneration(version.id)
}

/** "Riprova" after an error or a stuck run. */
export async function retryGeneration(version: QuoteVersion) {
  const { error } = await supabase
    .from('quote_versions')
    .update({ status: 'processing', error_message: null })
    .eq('id', version.id)
  if (error) throw error
  await runGeneration(version.id)
}
