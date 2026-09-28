import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ImageUp, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useProfile } from '../profile/ProfileProvider'
import { signedLogoUrl, uploadLogo } from '../lib/onboarding/persist'
import { ACCENT_SWATCHES, DEFAULT_ACCENT, LEGAL_FORMS } from '../lib/onboarding/questions'
import { inputClass } from './onboarding/OptionButton'

type TextField = 'company_name' | 'vat_number' | 'address' | 'phone' | 'email'

const TEXT_FIELDS: { key: TextField; label: string; type?: string; inputMode?: 'tel' | 'email' | 'numeric'; autoComplete?: string }[] = [
  { key: 'company_name', label: 'Ragione sociale', autoComplete: 'organization' },
  { key: 'vat_number', label: 'P.IVA', inputMode: 'numeric' },
  { key: 'address', label: 'Indirizzo', autoComplete: 'street-address' },
  { key: 'phone', label: 'Telefono', type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
  { key: 'email', label: 'Email', type: 'email', inputMode: 'email', autoComplete: 'email' },
]

const HEX = /^#[0-9a-fA-F]{6}$/

/** Company details for the PDF (onboarding q14 and "Il mio metodo"). Every field autosaves. */
export function CompanyForm() {
  const { session } = useAuth()
  const { profile, updateProfile } = useProfile()
  const [error, setError] = useState(false)

  if (!profile) return null

  async function save(patch: Parameters<typeof updateProfile>[0]) {
    try {
      await updateProfile(patch)
      setError(false)
    } catch {
      setError(true)
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Ragione sociale" id="company_name">
        <SavedInput id="company_name" initial={profile.company_name} autoComplete="organization" onSave={(v) => save({ company_name: v })} />
      </Field>

      <Field label="Forma giuridica" id="legal_form">
        <select
          id="legal_form"
          value={profile.legal_form ?? ''}
          onChange={(e) => void save({ legal_form: e.target.value || null })}
          className={`${inputClass} appearance-auto`}
        >
          <option value="">Scegli…</option>
          {LEGAL_FORMS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Field>

      {TEXT_FIELDS.filter((f) => f.key !== 'company_name').map((f) => (
        <Field key={f.key} label={f.label} id={f.key}>
          <SavedInput
            id={f.key}
            initial={profile[f.key]}
            type={f.type}
            inputMode={f.inputMode}
            autoComplete={f.autoComplete}
            onSave={(v) => save({ [f.key]: v } as Partial<Record<TextField, string | null>>)}
          />
        </Field>
      ))}

      {session && <LogoField userId={session.user.id} path={profile.logo_path} onSaved={(p) => save({ logo_path: p })} />}

      <ColorField value={profile.accent_color || DEFAULT_ACCENT} onChange={(c) => void save({ accent_color: c })} />

      {error && (
        <p className="text-red-700" role="alert">
          Qualcosa non ha funzionato, riprova.
        </p>
      )}
    </div>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

function SavedInput({
  id,
  initial,
  onSave,
  ...rest
}: {
  id: string
  initial: string | null
  onSave: (v: string | null) => void
  type?: string
  inputMode?: 'tel' | 'email' | 'numeric'
  autoComplete?: string
}) {
  const [value, setValue] = useState(initial ?? '')
  const [saved, setSaved] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        onBlur={() => {
          const v = value.trim() || null
          if (v !== (initial ?? null)) {
            onSave(v)
            setSaved(true)
          }
        }}
        className={inputClass}
        {...rest}
      />
      {saved && <Check className="absolute top-3.5 right-3 size-5 text-green-700" aria-label="Salvato" />}
    </div>
  )
}

function LogoField({ userId, path, onSaved }: { userId: string; path: string | null; onSaved: (path: string) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!path) return
    let alive = true
    void signedLogoUrl(path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [path])

  async function handle(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setError(false)
    try {
      const newPath = await uploadLogo(userId, file)
      await onSaved(newPath)
      setUrl(URL.createObjectURL(file))
    } catch {
      setError(true)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <p className="mb-1 font-medium">Logo</p>
      <div className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-gray-50">
          {url ? <img src={url} alt="Logo" className="max-h-full max-w-full object-contain" /> : <ImageUp className="size-7 text-muted" aria-hidden />}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => void handle(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex h-12 items-center gap-2 rounded-lg border border-line px-4 font-semibold hover:border-accent hover:text-accent disabled:opacity-70"
        >
          {uploading && <Loader2 className="size-5 animate-spin" aria-hidden />}
          {url ? 'Cambia logo' : 'Carica logo'}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-red-700" role="alert">
          Qualcosa non ha funzionato, riprova.
        </p>
      )}
    </div>
  )
}

function ColorField({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [hex, setHex] = useState(value)
  useEffect(() => setHex(value), [value])
  return (
    <div>
      <p className="mb-2 font-medium">Colore del preventivo</p>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colore del preventivo">
        {ACCENT_SWATCHES.map((c) => {
          const selected = c.toLowerCase() === value.toLowerCase()
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={c}
              onClick={() => onChange(c)}
              className={`flex size-12 items-center justify-center rounded-full ${selected ? 'ring-2 ring-offset-2' : ''}`}
              style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
            >
              {selected && <Check className="size-5 text-white" strokeWidth={3} aria-hidden />}
            </button>
          )
        })}
        <input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onBlur={() => (HEX.test(hex) ? hex.toLowerCase() !== value.toLowerCase() && onChange(hex.toUpperCase()) : setHex(value))}
          aria-label="Colore personalizzato (esadecimale)"
          placeholder="#1F5EFF"
          className={`${inputClass} w-32 font-mono`}
        />
      </div>
    </div>
  )
}
