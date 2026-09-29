import { ALTRO, type ChoiceQuestion } from '../../lib/onboarding/questions'
import type { Answer } from '../../lib/onboarding/answers'
import { OptionButton, inputClass } from './OptionButton'

type Props = {
  question: ChoiceQuestion
  value: Answer
  onChange: (next: Answer) => void
}

export function ChoiceQuestionView({ question, value, onChange }: Props) {
  const multi = question.kind === 'multi'
  const selected: string[] = multi ? ((value.value as string[]) ?? []) : [value.value as string]
  const altroOn = selected.includes(ALTRO)

  function toggle(id: string) {
    if (multi) {
      const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
      onChange({ ...value, value: next })
    } else {
      onChange({ ...value, value: id })
    }
  }

  return (
    <div className="space-y-3" role={multi ? 'group' : 'radiogroup'} aria-label={question.title}>
      {question.options.map((o) => (
        <OptionButton
          key={o.id}
          multi={multi}
          selected={selected.includes(o.id)}
          onClick={() => toggle(o.id)}
        >
          {o.label}
        </OptionButton>
      ))}
      <OptionButton multi={multi} selected={altroOn} onClick={() => toggle(ALTRO)}>
        Altro…
      </OptionButton>
      {altroOn && (
        <textarea
          autoFocus
          rows={2}
          value={value.custom_text ?? ''}
          onChange={(e) => onChange({ ...value, custom_text: e.target.value })}
          placeholder="Scrivi qui come fai tu"
          aria-label="Altro, specifica"
          className={`${inputClass} h-auto min-h-12 py-3`}
        />
      )}
    </div>
  )
}
