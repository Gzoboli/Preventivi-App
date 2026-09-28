import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { parseAnswers, toJson, type Answers } from '../lib/onboarding/answers'
import type { Profile, TablesUpdate } from '../types/db'

type ProfileState = {
  profile: Profile | null
  answers: Answers
  loading: boolean
  error: boolean
  /** Replace onboarding_answers (optimistic; writes are serialised). */
  saveAnswers: (next: Answers) => Promise<void>
  /** Functional update of onboarding_answers, based on the latest value. */
  updateAnswers: (fn: (current: Answers) => Answers) => Promise<void>
  /** Update other profile columns (optimistic). */
  updateProfile: (patch: Omit<TablesUpdate<'profiles'>, 'id' | 'onboarding_answers'>) => Promise<void>
  reload: () => Promise<void>
}

const ProfileContext = createContext<ProfileState | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // Chain writes so a slow request can't overwrite a newer one.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const reload = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setError(!!error || !data)
    setProfile(data ?? null)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  const write = useCallback(
    (patch: TablesUpdate<'profiles'>) => {
      if (!userId) return Promise.resolve()
      setProfile((p) => (p ? { ...p, ...patch } as Profile : p))
      const run = queue.current.then(async () => {
        const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
        if (error) throw error
      })
      queue.current = run.catch(() => undefined)
      return run
    },
    [userId],
  )

  // Latest answers, so consecutive updates build on each other even within one render.
  const answersRef = useRef<Answers>({})
  useEffect(() => {
    answersRef.current = parseAnswers(profile?.onboarding_answers)
  }, [profile?.onboarding_answers])

  const saveAnswers = useCallback(
    (next: Answers) => {
      answersRef.current = next
      return write({ onboarding_answers: toJson(next) })
    },
    [write],
  )
  const updateAnswers = useCallback(
    (fn: (current: Answers) => Answers) => saveAnswers(fn(answersRef.current)),
    [saveAnswers],
  )
  const updateProfile = useCallback<ProfileState['updateProfile']>((patch) => write(patch), [write])

  return (
    <ProfileContext.Provider
      value={{
        profile,
        answers: parseAnswers(profile?.onboarding_answers),
        loading,
        error,
        saveAnswers,
        updateAnswers,
        updateProfile,
        reload,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider')
  return ctx
}
