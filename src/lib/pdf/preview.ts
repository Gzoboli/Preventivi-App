// Draws page 1 of the PDF on a canvas (pdf.js): Chrome on Android cannot show a PDF inside the page.
// Loaded on demand with the send screen. The "legacy" build runs on older phones too (the modern
// one needs JavaScript features that iOS Safari and Chrome added only recently).
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export async function renderFirstPage(blob: Blob, canvas: HTMLCanvasElement, cssWidth: number) {
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
  const doc = await task.promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const ratio = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`
    await page.render({ canvas, viewport }).promise
  } finally {
    void task.destroy()
  }
}
