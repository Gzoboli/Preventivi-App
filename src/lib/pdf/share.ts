// Sending the PDF: share sheet with the file where the device supports it, otherwise download + link.

export type ShareResult = 'shared' | 'cancelled' | 'unsupported'

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
}

/** Opens the share sheet with the file (WhatsApp, Mail…). */
export async function shareFile(file: File, data: { title: string; text: string }): Promise<ShareResult> {
  if (!canShareFile(file)) return 'unsupported'
  try {
    await navigator.share({ files: [file], title: data.title, text: data.text })
    return 'shared'
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'unsupported'
  }
}

export const whatsappText = (title: string, company: string) => `Buongiorno, le invio il preventivo per ${title}. ${company}`
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
export const mailtoUrl = (subject: string, body: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
