// Optional documents the electrician gives us to understand how they work
// (price lists, wholesaler invoices, old quotes). Stored in the private
// `quote-files` bucket under `{user_id}/metodo/`; later passed to the AI.
import { supabase } from './supabase'

const BUCKET = 'quote-files'
export const MAX_DOCUMENT_MB = 20
export const DOCUMENT_ACCEPT = 'image/*,application/pdf'

export type MethodDocument = { path: string; name: string; size: number | null; uploadedAt: string | null }

const folder = (userId: string) => `${userId}/metodo`

/** "1790602565615-Listino Rossi.pdf" → "Listino Rossi.pdf" */
function displayName(objectName: string): string {
  return objectName.replace(/^\d+-/, '')
}

/** Keeps the original name readable but safe as a storage key. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .trim()
  return cleaned || 'documento'
}

export async function listMethodDocuments(userId: string): Promise<MethodDocument[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(folder(userId), { sortBy: { column: 'created_at', order: 'desc' } })
  if (error) throw error
  return data
    .filter((o) => o.id) // skip folder placeholders
    .map((o) => ({
      path: `${folder(userId)}/${o.name}`,
      name: displayName(o.name),
      size: (o.metadata?.size as number | undefined) ?? null,
      uploadedAt: o.created_at ?? null,
    }))
}

export async function uploadMethodDocument(userId: string, file: File): Promise<void> {
  const path = `${folder(userId)}/${Date.now()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (error) throw error
}

export async function removeMethodDocument(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}
