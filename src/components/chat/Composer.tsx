import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { AttachBar } from './Attachments'
import { EMPTY_OUTGOING, isEmpty, type Outgoing } from '../../lib/conversation'
import { inputClass } from '../onboarding/OptionButton'

export type ComposerHandle = { focus: (text?: string) => void }

type Props = {
  onSend: (out: Outgoing) => Promise<void>
  placeholder: string
  disabled?: boolean
  sendLabel?: string
}

/** Text + 🎙 + 📎, then "Invia". Keeps what was written if sending fails. */
export const Composer = forwardRef<ComposerHandle, Props>(function Composer({ onSend, placeholder, disabled, sendLabel = 'Invia' }, ref) {
  const [value, setValue] = useState<Outgoing>(EMPTY_OUTGOING)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    focus: (text?: string) => {
      if (text != null) setValue((v) => ({ ...v, text }))
      textarea.current?.focus()
    },
  }))

  async function send() {
    if (isEmpty(value) || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSend(value)
      setValue(EMPTY_OUTGOING)
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-white p-3">
      <textarea
        ref={textarea}
        rows={2}
        value={value.text}
        onChange={(e) => setValue({ ...value, text: e.target.value })}
        placeholder={placeholder}
        aria-label="Messaggio"
        className={`${inputClass} h-auto min-h-12 py-3`}
      />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <AttachBar value={value} onChange={setValue} onError={setError} disabled={busy} />
        <button
          type="button"
          onClick={() => void send()}
          disabled={disabled || busy || isEmpty(value)}
          className="flex h-12 items-center gap-2 rounded-lg bg-accent px-5 font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Send className="size-5" aria-hidden />}
          {sendLabel}
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
