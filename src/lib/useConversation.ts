import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { asChat, type ChatMessage } from './conversation'
import type { Quote, QuoteFile, QuoteVersion } from '../types/db'

/** A run older than this is dead (the function stops after 150 s); same value as the edge function. */
export const LEASE_MS = 5 * 60 * 1000
/** Without any reply for this long after sending, offer "Riprova". */
const NO_REPLY_MS = 3 * 60 * 1000

type State = {
  quote: Quote | null
  messages: ChatMessage[]
  files: QuoteFile[]
  version: QuoteVersion | null
  previous: QuoteVersion | null
  loading: boolean
  error: boolean
}

/**
 * A quote with its conversation, files and latest two versions.
 * Live via Realtime on messages and versions, with a 3 s poll while the AI is working.
 */
export function useConversation(quoteId: string | null) {
  const [state, setState] = useState<State>({ quote: null, messages: [], files: [], version: null, previous: null, loading: !!quoteId, error: false })
  // When the electrician sent something: time, and how many AI/system messages existed then.
  const [sent, setSent] = useState<{ at: number; replies: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const reload = useCallback(async () => {
    if (!quoteId) return
    const [q, m, f, v] = await Promise.all([
      supabase.from('quotes').select('*').eq('id', quoteId).maybeSingle(),
      supabase.from('quote_messages').select('*').eq('quote_id', quoteId).order('created_at'),
      supabase.from('quote_files').select('*').eq('quote_id', quoteId).order('uploaded_at'),
      supabase.from('quote_versions').select('*').eq('quote_id', quoteId).order('version', { ascending: false }).limit(2),
    ])
    setNow(Date.now())
    setState({
      quote: q.data ?? null,
      messages: (m.data ?? []).map(asChat),
      files: f.data ?? [],
      version: v.data?.[0] ?? null,
      previous: v.data?.[1] ?? null,
      loading: false,
      error: !!(q.error || m.error || f.error || v.error || !q.data),
    })
  }, [quoteId])

  useEffect(() => {
    setState((s) => (s.quote?.id === quoteId ? s : { ...s, loading: !!quoteId, error: false }))
    void reload()
    if (!quoteId) return
    const channel = supabase
      .channel(`conversation-${quoteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_messages', filter: `quote_id=eq.${quoteId}` }, () => void reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_versions', filter: `quote_id=eq.${quoteId}` }, () => void reload())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [quoteId, reload])

  const leaseAt = state.quote?.ai_run_started_at ? new Date(state.quote.ai_run_started_at).getTime() : null
  const replies = state.messages.filter((m) => m.role !== 'electrician').length
  const leaseActive = leaseAt != null && now - leaseAt < LEASE_MS
  const waiting = sent != null && replies <= sent.replies
  const busy = leaseActive || (waiting && now - sent.at < NO_REPLY_MS)
  const noReply = waiting && !leaseActive && now - sent.at >= NO_REPLY_MS

  useEffect(() => {
    if (!busy) return
    const t = window.setInterval(() => {
      setNow(Date.now())
      void reload()
    }, 3000)
    return () => window.clearInterval(t)
  }, [busy, reload])

  const repliesRef = useRef(replies)
  repliesRef.current = replies
  const markSent = useCallback(() => {
    setSent({ at: Date.now(), replies: repliesRef.current })
    setNow(Date.now())
  }, [])

  const legacy = useMemo(() => {
    const out = state.version?.ai_output as Record<string, unknown> | null | undefined
    // Quotes made before Task 3b: no conversation, and a version in the old format (or still in progress).
    return !state.messages.length && !!state.version && !(out && 'sections' in out)
  }, [state.messages.length, state.version])

  return { ...state, reload, busy, noReply, markSent, legacy }
}
