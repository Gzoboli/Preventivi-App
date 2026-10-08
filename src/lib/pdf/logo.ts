import { signedLogoUrl } from '../onboarding/persist'

/** The electrician's logo as a PNG data URL (the PDF accepts only PNG/JPEG; SVG and WebP are converted). */
export async function logoDataUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    const url = await signedLogoUrl(path)
    if (!url) return null
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const scale = Math.min(1, 600 / Math.max(img.naturalWidth || 600, img.naturalHeight || 600))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round((img.naturalWidth || 600) * scale)
    canvas.height = Math.round((img.naturalHeight || 300) * scale)
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null // the PDF falls back to the initials
  }
}
