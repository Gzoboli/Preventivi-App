import { describe, expect, it } from 'vitest'
import { safeFileName } from './methodDocuments'

describe('safeFileName', () => {
  it('keeps names readable and storage-safe', () => {
    expect(safeFileName('Listino Rossi.pdf')).toBe('Listino Rossi.pdf')
    expect(safeFileName('Fattura n°12 (Sonepar).PDF')).toBe('Fattura n_12 _Sonepar_.PDF')
    expect(safeFileName('Arké è però.jpg')).toBe('Arke e pero.jpg')
    expect(safeFileName('  ')).toBe('documento')
  })
})
