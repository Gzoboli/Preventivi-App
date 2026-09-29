import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Quote, QuoteFile, QuoteVersion } from '../types/db'

type State = {
  quote: Quote | null
  version: QuoteVersion | null
  files: QuoteFile[]
  loading: boolean
  error: boolean
}

/** A quote, its latest version and its files; live via Realtime, with a 5 s poll while processing. */
export function useQuote(quoteId: string | null) {
  const [state, setState] = useState<State>({ quote: null, version: null, files: [], loading: !!quoteId, error: false })

  const reload = useCallback(async () => {
    if (!quoteId) return
    setState((s) => (s.quote?.id === quoteId ? s : { ...s, loading: true, error: false }))
    const [q, v, f] = await Promise.all([
      supabase.from('quotes').select('*').eq('id', quoteId).maybeSingle(),
      supabase.from('quote_versions').select('*').eq('quote_id', quoteId).order('version', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('quote_files').select('*').eq('quote_id', quoteId).order('uploaded_at'),
    ])
    setState({
      quote: q.data ?? null,
      version: v.data ?? null,
      files: f.data ?? [],
      loading: false,
      error: !!(q.error || v.error || f.error || !q.data),
    })
  }, [quoteId])

  useEffect(() => {
    void reload()
    if (!quoteId) return
    const channel = supabase
      .channel(`quote-${quoteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_versions', filter: `quote_id=eq.${quoteId}` }, () => void reload())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [quoteId, reload])

  const processing = state.version?.status === 'processing'
  useEffect(() => {
    if (!processing) return
    const t = window.setInterval(() => void reload(), 5000)
    return () => window.clearInterval(t)
  }, [processing, reload])

  return { ...state, reload, setFiles: (files: QuoteFile[]) => setState((s) => ({ ...s, files })) }
}
