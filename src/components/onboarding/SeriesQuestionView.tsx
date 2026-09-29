import { ALTRO, SERIES, SERIES_DEFAULTS, TIERS, type TierId } from '../../lib/onboarding/questions'
import type { Answer, Pick, SeriesValue } from '../../lib/onboarding/answers'
import { inputClass } from './OptionButton'

type Props = { value: Answer; onChange: (next: Answer) => void }

const brands = [...new Set(SERIES.map((s) => s.marca))]

export function SeriesQuestionView({ value, onChange }: Props) {
  const v = value.value as unknown as SeriesValue

  function setPick(tier: TierId, pick: Pick) {
    onChange({ ...value, value: { ...v, [tier]: pick } as never })
  }

  return (
    <div className="space-y-5">
      {TIERS.map((t) => {
        const pick = v?.[t.id] ?? { choice: SERIES_DEFAULTS[t.id] }
        return (
          <div key={t.id}>
            <label htmlFor={`serie-${t.id}`} className="mb-2 block text-base font-semibold">
              {t.label}
            </label>
            <select
              id={`serie-${t.id}`}
              value={pick.choice}
              onChange={(e) => setPick(t.id, { choice: e.target.value, custom: pick.custom })}
              className={`${inputClass} appearance-auto`}
            >
              {brands.map((b) => (
                <optgroup key={b} label={b}>
                  {SERIES.filter((s) => s.marca === b).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={ALTRO}>Altro…</option>
            </select>
            {pick.choice === ALTRO && (
              <input
                autoFocus
                value={pick.custom ?? ''}
                onChange={(e) => setPick(t.id, { choice: ALTRO, custom: e.target.value })}
                placeholder="Es. Gewiss Chorus"
                aria-label={`Serie ${t.label}, specifica`}
                className={`${inputClass} mt-3`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
