import {
  ALTRO,
  DEFAULT_DISCOUNT_PCT,
  DISCOUNT_BRANDS,
  DISCOUNT_OPTIONS,
  DISCOUNT_RECOMMENDED,
  type DiscountBrand,
} from '../../lib/onboarding/questions'
import type { Answer, DiscountsValue, Pick } from '../../lib/onboarding/answers'
import { Chip, inputClass } from './OptionButton'

type Props = { value: Answer; onChange: (next: Answer) => void }

export function DiscountsQuestionView({ value, onChange }: Props) {
  const v = value.value as unknown as DiscountsValue

  function setPick(brand: DiscountBrand, pick: Pick) {
    const next: DiscountsValue = { ...v, brands: { ...v.brands, [brand]: pick } }
    onChange({ ...value, value: next as never })
  }

  return (
    <div className="space-y-5">
      {DISCOUNT_BRANDS.map((brand) => {
        const pick = v.brands?.[brand] ?? { choice: DISCOUNT_RECOMMENDED }
        return (
          <fieldset key={brand} className="border-b border-line pb-5 last:border-0">
            <legend className="mb-2 flex w-full items-baseline justify-between gap-2">
              <span className="text-base font-semibold">{brand}</span>
              <span className="text-sm text-muted">Consigliato: Non so</span>
            </legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Sconto ${brand}`}>
              {DISCOUNT_OPTIONS.map((o) => (
                <Chip key={o.id} selected={pick.choice === o.id} onClick={() => setPick(brand, { choice: o.id })}>
                  {o.label}
                </Chip>
              ))}
              <Chip selected={pick.choice === ALTRO} onClick={() => setPick(brand, { choice: ALTRO, custom: pick.custom })}>
                Altro…
              </Chip>
            </div>
            {pick.choice === ALTRO && (
              <input
                autoFocus
                value={pick.custom ?? ''}
                onChange={(e) => setPick(brand, { choice: ALTRO, custom: e.target.value })}
                placeholder="Es. 42% oppure 50+10"
                aria-label={`Sconto ${brand}, specifica`}
                className={`${inputClass} mt-3`}
              />
            )}
          </fieldset>
        )
      })}

      <p className="text-muted">Se non lo sai, usiamo uno sconto medio del {DEFAULT_DISCOUNT_PCT}%.</p>
    </div>
  )
}
