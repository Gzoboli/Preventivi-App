import { describe, expect, it } from 'vitest'
import { formatEur, formatEurShort, formatQty } from '../../supabase/functions/_shared/format.ts'

const plain = (s: string) => s.replace(/ | /g, ' ')

describe('formatting', () => {
  it('groups thousands also for 4-digit amounts', () => {
    expect(plain(formatEur(1590.16))).toBe('1.590,16 €')
    expect(plain(formatEur(12345.5))).toBe('12.345,50 €')
    expect(plain(formatEurShort(1200))).toBe('1.200 €')
    expect(plain(formatEurShort(34.5))).toBe('34,50 €')
  })

  it('uses singular and plural units', () => {
    expect(plain(formatQty(1, 'punti'))).toBe('1 punto')
    expect(plain(formatQty(4, 'punto'))).toBe('4 punti')
    expect(plain(formatQty(1, 'h'))).toBe('1 ora')
    expect(plain(formatQty(12, 'ore'))).toBe('12 ore')
    expect(plain(formatQty(1, 'm'))).toBe('1 metro')
    expect(plain(formatQty(550, 'metri'))).toBe('550 m')
    expect(plain(formatQty(1500, 'm'))).toBe('1.500 m')
    expect(plain(formatQty(2, 'confezioni'))).toBe('2 confezioni')
  })
})
