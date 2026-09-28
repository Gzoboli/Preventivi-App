import { useCallback } from 'react'
import { useProfile } from '../../profile/ProfileProvider'
import { ensurePriceItems, syncDiscounts } from './persist'
import {
  defaultValue,
  skipBlock,
  type Answer,
  type Answers,
  type DiscountsValue,
  type OnboardingMeta,
} from './answers'
import { getQuestion, type QuestionId } from './questions'

/** Saving answers + their side effects (discounts table, price list). */
export function useOnboardingActions() {
  const { updateAnswers, updateProfile } = useProfile()

  const withMeta = (a: Answers, meta?: OnboardingMeta): Answers => (meta ? { ...a, _meta: { ...a._meta, ...meta } } : a)

  /** Saves one answer (and optionally the progress meta) in a single write. */
  const commit = useCallback(
    async (id: QuestionId, answer: Answer, meta?: OnboardingMeta) => {
      await updateAnswers((a) => withMeta({ ...a, [id]: answer }, meta))
      if (id === 'q6') await syncDiscounts(answer.value as unknown as DiscountsValue, answer.source)
    },
    [updateAnswers],
  )

  /** "Salta blocco": recommended values for the rest of the block. */
  const skip = useCallback(
    async (fromId: QuestionId, meta?: OnboardingMeta) => {
      let filled: QuestionId[] = []
      await updateAnswers((a) => {
        const r = skipBlock(a, fromId)
        filled = r.filled
        return withMeta(r.answers, meta)
      })
      if (filled.includes('q5')) await ensurePriceItems()
      if (filled.includes('q6')) {
        await syncDiscounts(defaultValue(getQuestion('q6')) as unknown as DiscountsValue, 'default')
      }
    },
    [updateAnswers],
  )

  const setMeta = useCallback((meta: OnboardingMeta) => updateAnswers((a) => withMeta(a, meta)), [updateAnswers])

  const finish = useCallback(async () => {
    await ensurePriceItems()
    await updateProfile({ onboarding_completed: true })
  }, [updateProfile])

  return { commit, skip, setMeta, finish }
}
