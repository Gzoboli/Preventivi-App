// Side effects of answers on other tables/storage. RLS scopes everything to the user.
import { supabase } from '../supabase'
import { DISCOUNT_BRANDS } from './questions'
import { discountPct, priceChanges, type Answer, type PricesValue } from './answers'

/** Copies the default "a punto" list into price_items if the user has none yet. */
export async function ensurePriceItems(): Promise<void> {
  const { count, error } = await supabase.from('price_items').select('id', { count: 'exact', head: true })
  if (error) throw error
  if (!count) {
    const { error: rpcError } = await supabase.rpc('init_my_price_items')
    if (rpcError) throw rpcError
  }
}

/** Applies "Quanto fai pagare di solito?" (q5) to the user's price list. */
export async function applyTypicalPrices(prices: PricesValue): Promise<void> {
  await ensurePriceItems()
  const [{ data: starter, error: e1 }, { data: mine, error: e2 }] = await Promise.all([
    supabase.from('default_price_items').select('code, price_eur'),
    supabase.from('price_items').select('id, code, sort_order'),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const changes = priceChanges(
    prices,
    starter.map((s) => ({ code: s.code, price_eur: Number(s.price_eur) })),
  )
  let nextSort = Math.max(0, ...mine.map((m) => m.sort_order)) + 10
  for (const c of changes) {
    const existing = mine.find((m) => m.code === c.code)
    if (existing) {
      const { error } = await supabase.from('price_items').update({ price_eur: c.price_eur }).eq('id', existing.id)
      if (error) throw error
    } else if (c.create) {
      const { error } = await supabase
        .from('price_items')
        .insert({ code: c.code, price_eur: c.price_eur, sort_order: nextSort, ...c.create })
      if (error) throw error
      nextSort += 10
    }
  }
}

/** Writes the q6 discount to the `discounts` table, same value for every brand. */
export async function syncDiscounts(answer: Answer): Promise<void> {
  const { data: existing, error } = await supabase.from('discounts').select('id, brand')
  if (error) throw error
  const pct = discountPct(answer)
  const source = answer.source === 'default' || answer.value === 'non_so' ? 'default' : 'user'

  for (const brand of DISCOUNT_BRANDS) {
    const row = { brand, discount_pct: pct, source }
    const current = existing.find((d) => d.brand === brand)
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
