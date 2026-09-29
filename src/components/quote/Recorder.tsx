import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2 } from 'lucide-react'
import { MAX_RECORDING_SECONDS } from '../../lib/quotes'

const pickMime = () =>
  ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
    (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
  )

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

type Props = {
  /** Called with the finished recording; the parent uploads it. */
  onRecorded: (blob: Blob, name: string, seconds: number) => void
  onError: (message: string) => void
  /** Called just before recording starts (e.g. to create the draft quote). */
  onStart?: () => Promise<void>
}

/** In-browser recording (MediaRecorder), max 5 minutes, with timer, stop and delete. */
export function Recorder({ onRecorded, onError, onStart }: Props) {
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
      return onError('Questo browser non può registrare. Usa "Carica vocali".')
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return onError('Non ho accesso al microfono. Controlla i permessi del browser.')
    }
    try {
      await onStart?.()
    } catch {
      stream.getTracks().forEach((t) => t.stop())
      return onError('Qualcosa non ha funzionato, riprova.')
    }
    const mimeType = pickMime()
    const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    chunks.current = []
    discard.current = false
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      setRecording(false)
      const secs = (Date.now() - started.current) / 1000
      if (discard.current || !chunks.current.length) return
      const type = r.mimeType || mimeType || 'audio/webm'
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
      const now = new Date()
      const name = `Registrazione ${now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.${ext}`
      onRecorded(new Blob(chunks.current, { type: type.split(';')[0] }), name, secs)
    }
    rec.current = r
    started.current = Date.now()
    setSeconds(0)
    r.start(1000)
    setRecording(true)
  }

  if (!recording) {
    return (
      <button
        type="button"
        onClick={() => void start()}
        className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-white p-3 font-semibold hover:border-accent hover:text-accent"
      >
        <Mic className="size-7 text-accent" aria-hidden />
        Registra
      </button>
    )
  }

  const left = MAX_RECORDING_SECONDS - seconds
  return (
    <div className="col-span-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3" role="status">
      <span className="relative flex size-3 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex size-3 rounded-full bg-red-600" />
      </span>
      <span className="flex-1">
        <span className="font-semibold tabular-nums">{mmss(seconds)}</span>
        <span className="block text-sm text-muted">Sto registrando · massimo 5 minuti (restano {mmss(left)})</span>
      </span>
      <button
        type="button"
        onClick={() => {
          discard.current = true
          rec.current?.stop()
        }}
        aria-label="Elimina registrazione"
        className="flex size-12 items-center justify-center rounded-lg text-muted hover:bg-white"
      >
        <Trash2 className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => rec.current?.stop()}
        className="flex h-12 items-center gap-2 rounded-lg bg-red-600 px-4 font-semibold text-white"
      >
        <Square className="size-4 fill-current" aria-hidden />
        Stop
      </button>
    </div>
  )
}
