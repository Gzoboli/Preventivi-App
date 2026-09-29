import { Link } from 'react-router-dom'
import { ChevronRight, ListChecks } from 'lucide-react'
import { useProfile } from '../profile/ProfileProvider'
import { remainingScreens } from '../lib/onboarding/answers'

/** "Completa il tuo metodo · mancano X domande" → resumes the onboarding. Hidden once completed. */
export function OnboardingBanner() {
  const { profile, answers } = useProfile()
  if (!profile || profile.onboarding_completed) return null
  const left = remainingScreens(answers)
  return (
    <Link
      to="/onboarding"
      className="flex min-h-14 items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-ink hover:bg-accent/10"
    >
      <ListChecks className="size-6 shrink-0 text-accent" aria-hidden />
      <span className="flex-1">
        <span className="font-semibold">Completa il tuo metodo</span>
        <span className="hidden text-muted sm:inline"> · </span>
        <span className="block text-muted sm:inline">
          mancano {left} {left === 1 ? 'domanda' : 'domande'}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-accent" aria-hidden />
    </Link>
  )
}
