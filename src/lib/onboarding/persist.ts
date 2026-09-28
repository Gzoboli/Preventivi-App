// Side effects of onboarding answers on other tables/storage. RLS scopes everything to the user.
import { supabase } from '../supabase'
import { DISCOUNT_BRANDS, DISCOUNT_RECOMMENDED } from './questions'
import { discountPct, type AnswerSource, type DiscountsValue } from './answers'

/** Copies the default "a punto" list into price_items if the user has none yet. */
export async function ensurePriceItems(): Promise<void> {
  const { count, error } = await supabase.from('price_items').select('id', { count: 'exact', head: true })
  if (error) throw error
  if (!count) {
    const { error: rpcError } = await supabase.rpc('init_my_price_items')
    if (rpcError) throw rpcError
  }
}

/** Writes one `discounts` row per brand from the q6 answer. */
export async function syncDiscounts(value: DiscountsValue, source: AnswerSource): Promise<void> {
  const { data: existing, error } = await supabase.from('discounts').select('id, brand')
  if (error) throw error
  const hasBolla = (value.bolle?.length ?? 0) > 0

  for (const brand of DISCOUNT_BRANDS) {
    const pick = value.brands[brand] ?? { choice: DISCOUNT_RECOMMENDED }
    const pct = discountPct(pick)
    const rowSource =
      pct == null && hasBolla ? 'bolla_pending' : source === 'default' || pick.choice === DISCOUNT_RECOMMENDED ? 'default' : 'user'
    const row = { brand, discount_pct: pct, source: rowSource }
    const current = existing?.find((d) => d.brand === brand)
    const { error: writeError } = current
      ? await supabase.from('discounts').update(row).eq('id', current.id)
      : await supabase.from('discounts').insert(row)
    if (writeError) throw writeError
  }
}

function extensionOf(file: File, fallback: string): string {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  return fromName && /^[a-z0-9]{2,5}$/.test(fromName) ? fromName : fallback
}

/** Uploads a photo of a wholesaler delivery note; returns its storage path. */
export async function uploadBolla(userId: string, file: File): Promise<string> {
  const path = `${userId}/bolle/${Date.now()}.jpg`
  const { error } = await supabase.storage
    .from('quote-files')
    .upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (error) throw error
  return path
}

/** Uploads the company logo; returns its storage path. */
export async function uploadLogo(userId: string, file: File): Promise<string> {
  const path = `${userId}/logo.${extensionOf(file, 'png')}`
  const { error } = await supabase.storage
    .from('logos')
    .upload(path, file, { contentType: file.type || undefined, upsert: true })
  if (error) throw error
  return path
}

export async function signedLogoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('logos').createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}
