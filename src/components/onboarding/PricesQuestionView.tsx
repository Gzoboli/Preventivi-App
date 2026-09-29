import { ALTRO, NON_SO, PRICE_ANCHORS } from '../../lib/onboarding/questions'
import type { Answer, Pick, PricesValue } from '../../lib/onboarding/answers'
import { Chip, inputClass } from './OptionButton'

type Props = { value: Answer; onChange: (next: Answer) => void }

/** "Quanto fai pagare di solito?": one row per common item, typical prices + Non so + Altro… */
export function PricesQuestionView({ value, onChange }: Props) {
  const v = value.value as unknown as PricesValue

  function setPick(id: string, pick: Pick) {
    onChange({ ...value, value: { ...v, [id]: pick } as never })
  }

  return (
    <div>
      {PRICE_ANCHORS.map((a) => {
        const pick = v[a.id] ?? { choice: NON_SO }
        return (
          <fieldset key={a.id} className="border-b border-line py-4 first:pt-0 last:border-0">
            <legend className="contents">
              <span className="block text-base font-semibold">{a.label}</span>
              {a.detail && <span className="block text-sm text-muted">{a.detail}</span>}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={a.label}>
              {a.options.map((n) => (
                <Chip key={n} selected={pick.choice === String(n)} onClick={() => setPick(a.id, { choice: String(n) })}>
                  {n} €
                </Chip>
              ))}
              <Chip selected={pick.choice === NON_SO} onClick={() => setPick(a.id, { choice: NON_SO })}>
                Non so
              </Chip>
              <Chip selected={pick.choice === ALTRO} onClick={() => setPick(a.id, { choice: ALTRO, custom: pick.custom })}>
                Altro…
              </Chip>
            </div>
            {pick.choice === ALTRO && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  autoFocus
                  inputMode="decimal"
                  value={pick.custom ?? ''}
                  onChange={(e) => setPick(a.id, { choice: ALTRO, custom: e.target.value })}
                  placeholder="Es. 34,50"
                  aria-label={`${a.label}, prezzo esatto in euro`}
                  className={`${inputClass} max-w-40 text-right tabular-nums`}
                />
                <span className="text-muted">€</span>
              </div>
            )}
          </fieldset>
        )
      })}
    </div>
  )
}
