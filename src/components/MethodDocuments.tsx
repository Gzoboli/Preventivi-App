import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import {
  DOCUMENT_ACCEPT,
  MAX_DOCUMENT_MB,
  listMethodDocuments,
  removeMethodDocument,
  uploadMethodDocument,
  type MethodDocument,
} from '../lib/methodDocuments'

const isImage = (name: string) => /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name)

const dateFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

/** "I tuoi documenti (facoltativo)": optional files that help the AI understand how the electrician works. */
export function MethodDocuments() {
  const { session } = useAuth()
  const userId = session?.user.id
  const fileRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<MethodDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setDocs(await listMethodDocuments(userId))
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !userId) return
    setError(null)
    const tooBig = [...files].filter((f) => f.size > MAX_DOCUMENT_MB * 1024 * 1024)
    const ok = [...files].filter((f) => f.size <= MAX_DOCUMENT_MB * 1024 * 1024)
    setUploading(true)
    try {
      for (const f of ok) await uploadMethodDocument(userId, f)
      if (tooBig.length) setError(`"${tooBig[0].name}" è troppo grande (massimo ${MAX_DOCUMENT_MB} MB).`)
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    }
  }

  async function remove(doc: MethodDocument) {
    if (!window.confirm(`Togliere "${doc.name}"?`)) return
    setError(null)
    try {
      await removeMethodDocument(doc.path)
      setDocs((d) => d.filter((x) => x.path !== doc.path))
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">
        I tuoi documenti <span className="font-normal text-muted">(facoltativo)</span>
      </h2>
      <p className="mt-1 text-muted">
        Listini, fatture del grossista, vecchi preventivi: tutto quello che ci aiuta a capire come lavori. Non è
        obbligatorio.
      </p>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent/40 font-semibold text-accent hover:bg-accent/5 disabled:opacity-70"
      >
        {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Upload className="size-5" aria-hidden />}
        {uploading ? 'Caricamento…' : 'Carica un documento'}
      </button>
      <p className="mt-2 text-sm text-muted">Foto o PDF, fino a {MAX_DOCUMENT_MB} MB.</p>

      {error && (
        <p className="mt-3 text-red-700" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-4" role="status" aria-label="Caricamento documenti">
          <Loader2 className="size-6 animate-spin text-accent" />
        </div>
      ) : (
        docs.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-y border-line" aria-label="Documenti caricati">
            {docs.map((d) => {
              const Icon = isImage(d.name) ? ImageIcon : FileText
              return (
                <li key={d.path} className="flex min-h-14 items-center gap-3 py-2">
                  <Icon className="size-5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.name}</span>
                    {d.uploadedAt && (
                      <span className="text-sm text-muted">Caricato il {dateFmt.format(new Date(d.uploadedAt))}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(d)}
                    aria-label={`Togli ${d.name}`}
                    className="flex size-12 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-gray-100 hover:text-red-700"
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )
      )}
    </section>
  )
}
