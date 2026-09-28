import { describe, expect, it } from 'vitest'
import {
  applyPercent,
  discountPct,
  effectiveAnswer,
  firstUnansweredStep,
  formatAnswer,
  parseItalianNumber,
  remainingCount,
  roundTo10Cents,
  skipBlock,
  stepAfterBlock,
  type Answers,
} from './answers'
import { QUESTIONS, TOTAL_QUESTIONS } from './questions'

describe('questions', () => {
  it('has 14 questions with unique ids, and every choice question has a valid recommended option', () => {
    expect(TOTAL_QUESTIONS).toBe(14)
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(14)
    for (const q of QUESTIONS) {
      if (q.kind === 'single' || q.kind === 'multi') {
        const ids = q.options.map((o) => o.id)
        expect(q.recommended.length).toBeGreaterThan(0)
        for (const r of q.recommended) expect(ids).toContain(r)
        expect(ids).not.toContain('altro')
      }
    }
  })
})

describe('prices', () => {
  it('rounds to 0,10 €', () => {
    expect(roundTo10Cents(29.34)).toBe(29.3)
    expect(roundTo10Cents(29.35)).toBe(29.4)
  })
  it('applies percentages and rounds', () => {
    expect(applyPercent(29.3, 5)).toBe(30.8) // 30.765
    expect(applyPercent(29.3, -5)).toBe(27.8) // 27.835
    expect(applyPercent(300, 10)).toBe(330)
  })
  it('parses Italian numbers', () => {
    expect(parseItalianNumber('29,30')).toBe(29.3)
    expect(parseItalianNumber('29.30')).toBe(29.3)
    expect(parseItalianNumber('1.234,5 €')).toBe(1234.5)
    expect(parseItalianNumber('42%')).toBe(42)
    expect(parseItalianNumber('')).toBeNull()
    expect(parseItalianNumber('abc')).toBeNull()
    expect(parseItalianNumber('-3')).toBeNull()
  })
})

describe('progress', () => {
  it('counts remaining questions and finds where to resume', () => {
    const a: Answers = { q1: { value: ['rifacimenti'], source: 'user' } }
    expect(remainingCount({})).toBe(14)
    expect(remainingCount(a)).toBe(13)
    expect(firstUnansweredStep(a)).toBe(2)
  })

  it('falls back to the recommended answer', () => {
    expect(effectiveAnswer({}, 'q3')).toEqual({ value: '60', source: 'default' })
    expect(effectiveAnswer({}, 'q13').value).toHaveLength(4)
  })

  it('"Salta blocco" fills only the unanswered questions of the current block', () => {
    const a: Answers = { q3: { value: '40', source: 'user' } }
    const { answers, filled } = skipBlock(a, 'q2')
    expect(filled).toEqual(['q2', 'q4'])
    expect(answers.q3).toEqual({ value: '40', source: 'user' })
    expect(answers.q2?.source).toBe('default')
    expect(answers.q5).toBeUndefined()
    expect(stepAfterBlock('q2')).toBe(5) // q5 = first of block 2
    expect(stepAfterBlock('q14')).toBe(15) // after the last block: the summary
  })
})

describe('display', () => {
  it('formats "Altro…" text and multi answers', () => {
    expect(formatAnswer('q3', { value: 'altro', source: 'user', custom_text: '55 €' })).toBe('55 €')
    expect(
      formatAnswer('q13', { value: ['macerie', 'altro'], source: 'user', custom_text: 'Citofono' }),
    ).toBe('Smaltimento macerie, Citofono')
    expect(formatAnswer('q6', effectiveAnswer({}, 'q6'))).toContain('Vimar 46% (medio)')
    expect(formatAnswer('q7', effectiveAnswer({}, 'q7'))).toBe('Vimar Plana / Vimar Arké / Vimar Eikon')
  })

  it('computes discount percentages', () => {
    expect(discountPct({ choice: 'non_so' })).toBeNull()
    expect(discountPct({ choice: '45' })).toBe(45)
    expect(discountPct({ choice: 'altro', custom: '42,5' })).toBe(42.5)
    expect(discountPct({ choice: 'altro', custom: 'dipende' })).toBeNull()
  })
})
