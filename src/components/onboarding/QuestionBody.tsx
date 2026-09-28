import type { Question } from '../../lib/onboarding/questions'
import type { Answer } from '../../lib/onboarding/answers'
import { ChoiceQuestionView } from './ChoiceQuestionView'
import { DiscountsQuestionView } from './DiscountsQuestionView'
import { SeriesQuestionView } from './SeriesQuestionView'
import { PriceListEditor } from '../PriceListEditor'
import { CompanyForm } from '../CompanyForm'

type Props = { question: Question; draft: Answer; onChange: (next: Answer) => void }

/** Title, helper and input of one question. Price list and company form save directly. */
export function QuestionBody({ question, draft, onChange }: Props) {
  return (
    <div>
      <h2 className="text-xl font-semibold md:text-2xl">{question.title}</h2>
      {question.helper && <p className="mt-2 text-muted">{question.helper}</p>}
      <div className="mt-5">
        {(question.kind === 'single' || question.kind === 'multi') && (
          <ChoiceQuestionView question={question} value={draft} onChange={onChange} />
        )}
        {question.kind === 'discounts' && <DiscountsQuestionView value={draft} onChange={onChange} />}
        {question.kind === 'series' && <SeriesQuestionView value={draft} onChange={onChange} />}
        {question.kind === 'prices' && <PriceListEditor />}
        {question.kind === 'company' && <CompanyForm />}
      </div>
    </div>
  )
}

/** Returns an Italian error message if the draft can't be saved yet, else null. */
export function validateDraft(question: Question, draft: Answer): string | null {
  if (question.kind === 'single' || question.kind === 'multi') {
    const v = draft.value
    const altro = Array.isArray(v) ? v.includes('altro') : v === 'altro'
    if (altro && !draft.custom_text?.trim()) return 'Scrivi cosa intendi con "Altro".'
  }
  return null
}
