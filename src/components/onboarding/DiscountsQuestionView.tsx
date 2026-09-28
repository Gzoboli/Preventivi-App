import { useRef, useState } from 'react'
import { Camera, CheckCircle2, Loader2 } from 'lucide-react'
import {
  ALTRO,
  DEFAULT_DISCOUNT_PCT,
  DISCOUNT_BRANDS,
  DISCOUNT_OPTIONS,
  DISCOUNT_RECOMMENDED,
  type DiscountBrand,
} from '../../lib/onboarding/questions'
import type { Answer, DiscountsValue, Pick } from '../../lib/onboarding/answers'
import { uploadBolla } from '../../lib/onboarding/persist'
import { useAuth } from '../../auth/AuthProvider'
import { Chip, inputClass } from './OptionButton'

type Props = { value: Answer; onChange: (next: Answer) => void }

export function DiscountsQuestionView({ value, onChange }: Props) {
  const { session } = useAuth()
  const v = value.value as unknown as DiscountsValue
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(false)

  function setPick(brand: DiscountBrand, pick: Pick) {
    const next: DiscountsValue = { ...v, brands: { ...v.brands, [brand]: pick } }
    onChange({ ...value, value: next as never })
  }

  async function handleFile(file: File | undefined) {
    if (!file || !session) return
    setUploading(true)
    setUploadError(false)
    try {
      const path = await uploadBolla(session.user.id, file)
      const next: DiscountsValue = { ...v, bolle: [...(v.bolle ?? []), path] }
      onChange({ ...value, value: next as never })
    } catch {
      setUploadError(true)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-5">
      {DISCOUNT_BRANDS.map((brand) => {
        const pick = v.brands?.[brand] ?? { choice: DISCOUNT_RECOMMENDED }
        return (
          <fieldset key={brand} className="border-b border-line pb-5 last:border-0">
            <legend className="mb-2 text-base font-semibold">{brand}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Sconto ${brand}`}>
              {DISCOUNT_OPTIONS.map((o) => (
                <Chip key={o.id} selected={pick.choice === o.id} onClick={() => setPick(brand, { choice: o.id })}>
                  {o.label}
                  {o.id === DISCOUNT_RECOMMENDED && <span className="sr-only"> (consigliato)</span>}
                </Chip>
              ))}
              <Chip selected={pick.choice === ALTRO} onClick={() => setPick(brand, { choice: ALTRO, custom: pick.custom })}>
                Altro…
              </Chip>
            </div>
            {pick.choice === ALTRO && (
              <input
                autoFocus
                value={pick.custom ?? ''}
                onChange={(e) => setPick(brand, { choice: ALTRO, custom: e.target.value })}
                placeholder="Es. 42% oppure 50+10"
                aria-label={`Sconto ${brand}, specifica`}
                className={`${inputClass} mt-3`}
              />
            )}
          </fieldset>
        )
      })}

      <p className="text-muted">Se non lo sai, usiamo uno sconto medio del {DEFAULT_DISCOUNT_PCT}%.</p>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-accent px-4 font-semibold text-accent hover:bg-accent/5 disabled:opacity-70 sm:w-auto"
        >
          {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
          Carica la foto di una bolla
        </button>
        {(v.bolle?.length ?? 0) > 0 && !uploading && (
          <p className="mt-3 flex items-center gap-2 font-medium text-green-700" role="status">
            <CheckCircle2 className="size-5" aria-hidden />
            Grazie! Lo calcoliamo noi entro 24 ore.
          </p>
        )}
        {uploadError && (
          <p className="mt-3 text-red-700" role="alert">
            Qualcosa non ha funzionato, riprova.
          </p>
        )}
      </div>
    </div>
  )
}
