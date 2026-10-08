// Quote data access for the app. RLS scopes every query to the logged-in electrician.
import { supabase } from './supabase'
import { safeFileName } from './methodDocuments'
import type { Quote, QuoteFile } from '../types/db'
import type { AiQuote, Totals } from '../../supabase/functions/_shared/totals.ts'

/** Format 1 (quotes made before Task 3b), still shown read-only. */
export type { AiQuote as LegacyAiQuote, Totals as LegacyTotals }

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

/** New quotes have no IVA yet (vat_rate null): it is chosen before the client PDF. */
export async function createQuote(): Promise<Quote> {
  const { data, error } = await supabase.from('quotes').insert({}).select().single()
  if (error) throw error
  return data
}

export async function updateQuote(id: string, patch: Partial<Pick<Quote, 'client_name' | 'client_address' | 'job_title' | 'vat_rate' | 'phase'>>) {
  const { error } = await supabase.from('quotes').update(patch).eq('id', id)
  if (error) throw error
}

/** Deletes a quote and its files. Messages and versions go with it (ON DELETE CASCADE). */
export async function deleteQuote(id: string) {
  const { data: files, error: filesError } = await supabase.from('quote_files').select('storage_path, kind').eq('quote_id', id)
  if (filesError) throw filesError
  const audio = (files ?? []).filter((f) => f.kind === 'audio').map((f) => f.storage_path)
  const docs = (files ?? []).filter((f) => f.kind !== 'audio').map((f) => f.storage_path)
  if (audio.length) await supabase.storage.from('audio').remove(audio)
  if (docs.length) await supabase.storage.from('quote-files').remove(docs)
  const { error } = await supabase.from('quotes').delete().eq('id', id)
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
