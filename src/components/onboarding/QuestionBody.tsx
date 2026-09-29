import { ALTRO, PRICE_ANCHORS, TIERS, type Question } from '../../lib/onboarding/questions'
import { anchorPrice, type Answer, type PricesValue, type SeriesValue } from '../../lib/onboarding/answers'
import { ChoiceQuestionView } from './ChoiceQuestionView'
import { PricesQuestionView } from './PricesQuestionView'
import { SeriesQuestionView } from './SeriesQuestionView'

type Props = { question: Question; draft: Answer; onChange: (next: Answer) => void; compact?: boolean }

/** Title, helper and input of one question. */
export function QuestionBody({ question, draft, onChange, compact }: Props) {
  return (
    <div>
      <h2 className={compact ? 'text-lg font-semibold' : 'text-xl font-semibold md:text-2xl'}>{question.title}</h2>
      {question.helper && <p className="mt-2 text-muted">{question.helper}</p>}
      <div className="mt-5">
        {(question.kind === 'single' || question.kind === 'multi') && (
          <ChoiceQuestionView question={question} value={draft} onChange={onChange} />
        )}
        {question.kind === 'prices' && <PricesQuestionView value={draft} onChange={onChange} />}
        {question.kind === 'series' && <SeriesQuestionView value={draft} onChange={onChange} />}
      </div>
    </div>
  )
}

/** Returns an Italian error message if the draft can't be saved yet, else null. */
export function validateDraft(question: Question, draft: Answer): string | null {
  switch (question.kind) {
    case 'single':
    case 'multi': {
      const v = draft.value
      const altro = Array.isArray(v) ? v.includes(ALTRO) : v === ALTRO
      return altro && !draft.custom_text?.trim() ? 'Scrivi cosa intendi con "Altro".' : null
    }
    case 'prices': {
      const v = draft.value as unknown as PricesValue
      const bad = PRICE_ANCHORS.find((a) => v[a.id]?.choice === ALTRO && anchorPrice(v[a.id]) == null)
      return bad ? `Scrivi il prezzo di "${bad.label}" in euro, es. 34,50.` : null
    }
    case 'series': {
      const v = draft.value as unknown as SeriesValue
      const bad = TIERS.find((t) => v[t.id]?.choice === ALTRO && !v[t.id]?.custom?.trim())
      return bad ? `Scrivi la serie "${bad.label}".` : null
    }
  }
}
