import { useCallback } from 'react'
import { useProfile } from '../../profile/ProfileProvider'
import { applyTypicalPrices, ensurePriceItems, syncDiscounts } from './persist'
import type { Answer, Answers, OnboardingMeta, PricesValue } from './answers'
import type { QuestionId } from './questions'

const withMeta = (a: Answers, meta?: OnboardingMeta): Answers =>
  meta ? { ...a, _meta: { ...a._meta, ...meta } } : a

/** Saving answers + their side effects (price list, discounts table). */
export function useOnboardingActions() {
  const { updateAnswers, updateProfile } = useProfile()

  /** Saves answers (and optionally the progress meta) in a single write, then their side effects. */
  const commit = useCallback(
    async (entries: [QuestionId, Answer][], meta?: OnboardingMeta) => {
      await updateAnswers((a) => withMeta({ ...a, ...Object.fromEntries(entries) }, meta))
      for (const [id, answer] of entries) {
        if (id === 'q5') await applyTypicalPrices(answer.value as unknown as PricesValue)
        if (id === 'q6') await syncDiscounts(answer)
      }
    },
    [updateAnswers],
  )

  const setMeta = useCallback((meta: OnboardingMeta) => updateAnswers((a) => withMeta(a, meta)), [updateAnswers])

  const finish = useCallback(async () => {
    await ensurePriceItems()
    await updateProfile({ onboarding_completed: true })
  }, [updateProfile])

  return { commit, setMeta, finish }
}
