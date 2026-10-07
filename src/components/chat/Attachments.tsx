import { useEffect, useRef, useState } from 'react'
import { FileText, Mic, Paperclip, Square, Trash2, X } from 'lucide-react'
import { MAX_DOCUMENT_MB, MAX_RECORDING_SECONDS } from '../../lib/quotes'
import type { Outgoing } from '../../lib/conversation'

const pickMime = () =>
  ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
    (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
  )

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** In-browser recording (max 5 minutes) with a timer. */
export function useRecorder(onDone: (blob: Blob, name: string) => void, onError: (m: string) => void) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const discard = useRef(false)
  const started = useRef(0)

  useEffect(() => {
    if (!recording) return
    const t = window.setInterval(() => {
      const s = (Date.now() - started.current) / 1000
      setSeconds(s)
      if (s >= MAX_RECORDING_SECONDS) rec.current?.stop()
    }, 250)
    return () => window.clearInterval(t)
  }, [recording])

  // Stop the microphone if the page is left while recording.
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), [])

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return onError('Questo browser non può registrare. Scrivi il messaggio o allega un file audio.')
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return onError('Non ho accesso al microfono. Controlla i permessi del browser.')
    }
    const mimeType = pickMime()
    const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    chunks.current = []
    discard.current = false
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      setRecording(false)
      if (discard.current || !chunks.current.length) return
      const type = r.mimeType || mimeType || 'audio/webm'
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
      const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      onDone(new Blob(chunks.current, { type: type.split(';')[0] }), `Vocale ${time}.${ext}`)
    }
    rec.current = r
    started.current = Date.now()
    setSeconds(0)
    r.start(1000)
    setRecording(true)
  }

  return {
    recording,
    seconds,
    start: () => void start(),
    stop: () => rec.current?.stop(),
    cancel: () => {
      discard.current = true
      rec.current?.stop()
    },
  }
}

type Props = {
  value: Outgoing
  onChange: (v: Outgoing) => void
  onError: (m: string) => void
  /** Label prefix for screen readers (e.g. the question). */
  label?: string
  disabled?: boolean
}

/** 🎙 and 📎 buttons, the recording bar and the chips of what is attached. */
export function AttachBar({ value, onChange, onError, label = '', disabled }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const recorder = useRecorder((blob, name) => onChange({ ...value, audio: { blob, name } }), onError)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!value.audio) return setAudioUrl(null)
    const url = URL.createObjectURL(value.audio.blob)
    setAudioUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [value.audio])

  function addFiles(list: FileList | null) {
    const files = [...(list ?? [])]
    const max = MAX_DOCUMENT_MB * 1024 * 1024
    const tooBig = files.find((f) => f.size > max)
    if (tooBig) onError(`"${tooBig.name}" è troppo grande (massimo ${MAX_DOCUMENT_MB} MB).`)
    onChange({ ...value, files: [...value.files, ...files.filter((f) => f.size <= max)] })
    if (input.current) input.current.value = ''
  }

  const prefix = label ? `${label}: ` : ''
  return (
    <div className="space-y-2">
      {recorder.recording && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-2 pl-3" role="status">
          <span className="relative flex size-3 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-red-600" />
          </span>
          <span className="flex-1 text-sm">
            <span className="font-semibold tabular-nums">{mmss(recorder.seconds)}</span> · massimo 5 minuti
          </span>
          <button type="button" onClick={recorder.cancel} aria-label="Elimina registrazione" className="flex size-12 items-center justify-center rounded-lg text-muted hover:bg-white">
            <Trash2 className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={recorder.stop} className="flex h-12 items-center gap-2 rounded-lg bg-red-600 px-4 font-semibold text-white">
            <Square className="size-4 fill-current" aria-hidden />
            Stop
          </button>
        </div>
      )}

      {(value.audio || value.files.length > 0) && (
        <ul className="flex flex-wrap gap-2">
          {value.audio && (
            <li className="flex items-center gap-2 rounded-lg border border-line bg-gray-50 py-1 pr-1 pl-2">
              <Mic className="size-4 text-accent" aria-hidden />
              {audioUrl && <audio src={audioUrl} controls className="h-9 max-w-52" aria-label={`${prefix}vocale registrato`} />}
              <button
                type="button"
                onClick={() => onChange({ ...value, audio: null })}
                aria-label={`${prefix}togli il vocale`}
                className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-white"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          )}
          {value.files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-line bg-gray-50 py-1 pr-1 pl-2 text-sm">
              <FileText className="size-4 text-muted" aria-hidden />
              <span className="max-w-44 truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => onChange({ ...value, files: value.files.filter((_, j) => j !== i) })}
                aria-label={`${prefix}togli ${f.name}`}
                className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-white"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!recorder.recording && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={recorder.start}
            aria-label={`${prefix}registra un vocale`}
            className="flex h-12 items-center gap-2 rounded-lg border border-line px-3 font-semibold hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <Mic className="size-5 text-accent" aria-hidden />
            {value.audio ? 'Registra di nuovo' : 'Vocale'}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => input.current?.click()}
            aria-label={`${prefix}allega file`}
            className="flex h-12 items-center gap-2 rounded-lg border border-line px-3 font-semibold hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <Paperclip className="size-5 text-accent" aria-hidden />
            Allega
          </button>
          <input ref={input} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} data-testid={`${label || 'main'}-file-input`} />
        </div>
      )}
    </div>
  )
}
