import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronDown, FileAudio, FileText, Image as ImageIcon, Loader2, Paperclip, Sparkles, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { useProfile } from '../../profile/ProfileProvider'
import {
  AUDIO_ACCEPT,
  MAX_AUDIO_MB,
  MAX_DOCUMENT_MB,
  aiCanRead,
  removeQuoteFile,
  startGeneration,
  updateQuote,
  uploadQuoteFile,
} from '../../lib/quotes'
import type { Quote, QuoteFile, QuoteVersion, VatRate } from '../../types/db'
import { defaultVatRate } from '../../../supabase/functions/_shared/method.ts'
import { Recorder, mmss } from './Recorder'
import { inputClass } from '../onboarding/OptionButton'

const VAT_OPTIONS: VatRate[] = [10, 22, 4]

const draftKey = (id: string) => `preventivo-bozza-${id}`
function readDraft(id: string | undefined): string {
  if (!id) return ''
  try {
    return localStorage.getItem(draftKey(id)) ?? ''
  } catch {
    return ''
  }
}
function writeDraft(id: string, text: string) {
  try {
    localStorage.setItem(draftKey(id), text)
  } catch {
    /* private mode: the text is still sent when generating */
  }
}

type Props = {
  quote: Quote | null
  files: QuoteFile[]
  /** Set when correcting the description of an existing version. */
  existing?: QuoteVersion
  ensureQuote: () => Promise<Quote>
  onFiles: (files: QuoteFile[]) => void
  onStarted: () => void
}

export function DraftForm({ quote, files, existing, ensureQuote, onFiles, onStarted }: Props) {
  const { session } = useAuth()
  const { profile, answers } = useProfile()
  const [vat, setVat] = useState<VatRate>((quote?.vat_rate as VatRate | undefined) ?? defaultVatRate(answers))
  const [text, setText] = useState(() => existing?.input_text ?? readDraft(quote?.id))
  const [showClient, setShowClient] = useState(!!(quote?.client_name || quote?.client_address))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [generating, setGenerating] = useState(false)
  const audioInput = useRef<HTMLInputElement>(null)
  const docInput = useRef<HTMLInputElement>(null)
  const creating = useRef<Promise<Quote> | null>(null)

  const getQuote = () => {
    if (quote) return Promise.resolve(quote)
    creating.current ??= ensureQuote()
    return creating.current
  }

  useEffect(() => {
    if (quote?.vat_rate) setVat(quote.vat_rate as VatRate)
  }, [quote?.vat_rate])

  // Persist the typed description on this device (the quote row is created at the first input).
  useEffect(() => {
    if (quote?.id && !existing) writeDraft(quote.id, text)
  }, [quote?.id, text, existing])

  async function onText(v: string) {
    setText(v)
    if (!quote && v.trim()) {
      try {
        await getQuote()
      } catch {
        setError('Qualcosa non ha funzionato, riprova.')
      }
    }
  }

  async function add(fileList: FileList | File[] | null, kind: 'audio' | 'document') {
    const list = [...(fileList ?? [])]
    if (!list.length || !session) return
    setError(null)
    const max = (kind === 'audio' ? MAX_AUDIO_MB : MAX_DOCUMENT_MB) * 1024 * 1024
    const tooBig = list.find((f) => f.size > max)
    if (tooBig) setError(`"${tooBig.name}" è troppo grande (massimo ${kind === 'audio' ? MAX_AUDIO_MB : MAX_DOCUMENT_MB} MB).`)
    setBusy(kind)
    try {
      const q = await getQuote()
      const added: QuoteFile[] = []
      for (const f of list.filter((x) => x.size <= max)) {
        const row = await uploadQuoteFile(session.user.id, q.id, f, f.name, kind)
        added.push(row)
        if (kind === 'audio') readDuration(f, row.id)
      }
      onFiles([...files, ...added])
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    } finally {
      setBusy(null)
      if (audioInput.current) audioInput.current.value = ''
      if (docInput.current) docInput.current.value = ''
    }
  }

  function readDuration(blob: Blob, id: string) {
    const url = URL.createObjectURL(blob)
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      if (Number.isFinite(a.duration)) setDurations((d) => ({ ...d, [id]: a.duration }))
      URL.revokeObjectURL(url)
    }
    a.src = url
  }

  async function onRecorded(blob: Blob, name: string, seconds: number) {
    if (!session) return
    setBusy('audio')
    try {
      const q = await getQuote()
      const row = await uploadQuoteFile(session.user.id, q.id, blob, name, 'audio')
      setDurations((d) => ({ ...d, [row.id]: seconds }))
      onFiles([...files, row])
    } catch {
      setError('Non sono riuscito a salvare la registrazione. Riprova.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(f: QuoteFile) {
    try {
      await removeQuoteFile(f)
      onFiles(files.filter((x) => x.id !== f.id))
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    }
  }

  async function saveQuoteField(patch: Parameters<typeof updateQuote>[1]) {
    try {
      const q = await getQuote()
      await updateQuote(q.id, patch)
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    }
  }

  const audioCount = files.filter((f) => f.kind === 'audio').length
  const canGenerate = (!!text.trim() || audioCount > 0) && !busy && !generating

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const q = await getQuote()
      await startGeneration(q.id, text.trim(), existing)
      onStarted()
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      {profile && !profile.onboarding_completed && (
        <p className="mb-4 rounded-xl bg-gray-100 p-3 text-sm">
          Stiamo usando i valori più comuni per le domande che hai saltato.{' '}
          <Link to="/onboarding" className="font-semibold text-accent">
            Completa il tuo metodo
          </Link>
        </p>
      )}

      {/* Client + title: optional, collapsed into one row */}
      <button
        type="button"
        onClick={() => setShowClient((v) => !v)}
        aria-expanded={showClient}
        className="flex min-h-12 w-full items-center justify-between rounded-xl border border-line px-4 text-left"
      >
        <span className={quote?.client_name ? 'font-medium' : 'text-muted'}>
          {quote?.client_name || 'Cliente e indirizzo'}
          {!quote?.client_name && <span className="text-sm"> (facoltativo)</span>}
        </span>
        <ChevronDown className={`size-5 text-muted transition-transform ${showClient ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {showClient && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            defaultValue={quote?.client_name ?? ''}
            onBlur={(e) => void saveQuoteField({ client_name: e.target.value.trim() || null })}
            placeholder="Nome del cliente"
            aria-label="Cliente"
            className={inputClass}
          />
          <input
            defaultValue={quote?.client_address ?? ''}
            onBlur={(e) => void saveQuoteField({ client_address: e.target.value.trim() || null })}
            placeholder="Indirizzo del lavoro"
            aria-label="Indirizzo"
            className={inputClass}
          />
          <input
            defaultValue={quote?.job_title ?? ''}
            onBlur={(e) => void saveQuoteField({ job_title: e.target.value.trim() || null })}
            placeholder="Titolo (facoltativo, lo propone l'AI)"
            aria-label="Titolo del lavoro"
            className={`${inputClass} sm:col-span-2`}
          />
        </div>
      )}

      <label htmlFor="descrizione" className="mt-6 block text-lg font-semibold">
        Descrivi il lavoro
      </label>
      <textarea
        id="descrizione"
        rows={7}
        value={text}
        onChange={(e) => void onText(e.target.value)}
        placeholder="Es. rifacimento impianto appartamento 80 m², 2 camere, soggiorno con angolo cottura, un bagno…"
        className="mt-2 w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Recorder onRecorded={(b, n, s) => void onRecorded(b, n, s)} onError={setError} onStart={async () => void (await getQuote())} />
        <Tile icon={FileAudio} label="Carica vocali" busy={busy === 'audio'} onClick={() => audioInput.current?.click()} />
        <Tile icon={Paperclip} label="Documenti" busy={busy === 'document'} onClick={() => docInput.current?.click()} />
      </div>
      <input ref={audioInput} type="file" multiple accept={AUDIO_ACCEPT} className="hidden" onChange={(e) => void add(e.target.files, 'audio')} />
      <input ref={docInput} type="file" multiple className="hidden" onChange={(e) => void add(e.target.files, 'document')} />
      <p className="mt-2 text-sm text-muted">Vocali anche da WhatsApp. Documenti: planimetrie, visure, capitolati, foto, PDF.</p>

      {files.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-y border-line" aria-label="Allegati">
          {files.map((f) => {
            const isAudio = f.kind === 'audio'
            const Icon = isAudio ? FileAudio : f.mime_type?.startsWith('image/') ? ImageIcon : FileText
            const readable = isAudio || aiCanRead(f.mime_type, f.file_name)
            return (
              <li key={f.id} className="flex min-h-14 items-center gap-3 py-2">
                <Icon className="size-5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{f.file_name}</span>
                  {isAudio && durations[f.id] != null && <span className="text-sm text-muted">{mmss(durations[f.id])}</span>}
                  {!readable && (
                    <span className="flex items-center gap-1 text-sm text-amber-700">
                      <AlertTriangle className="size-4" aria-hidden /> L'AI legge solo PDF, foto e testo: questo file resta allegato ma non verrà letto.
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(f)}
                  aria-label={`Togli ${f.file_name}`}
                  className="flex size-12 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-gray-100 hover:text-red-700"
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">IVA</p>
        <div className="flex gap-2" role="radiogroup" aria-label="IVA">
          {VAT_OPTIONS.map((v) => {
            const selected = vat === v
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setVat(v)
                  void saveQuoteField({ vat_rate: v })
                }}
                className={`h-12 min-w-16 rounded-lg border px-3 font-semibold ${selected ? 'border-accent bg-accent text-white' : 'border-line'}`}
              >
                {v}%
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <p className="mt-4 text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canGenerate}
        onClick={() => void generate()}
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {generating ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
        Genera preventivo
      </button>
      {!text.trim() && audioCount === 0 && (
        <p className="mt-2 text-center text-sm text-muted">Scrivi una descrizione o aggiungi un vocale.</p>
      )}
    </div>
  )
}

function Tile({ icon: Icon, label, busy, onClick }: { icon: typeof Upload; label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-white p-3 text-center font-semibold hover:border-accent hover:text-accent disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-7 animate-spin text-accent" aria-hidden /> : <Icon className="size-7 text-accent" aria-hidden />}
      {label}
    </button>
  )
}
