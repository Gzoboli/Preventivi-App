// Loaded on demand (dynamic import): @react-pdf/renderer is large and only needed to make the PDF.
import { pdf } from '@react-pdf/renderer'
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url'
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff?url'
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url'
import inter800 from '@fontsource/inter/files/inter-latin-800-normal.woff?url'
import { ClientQuotePdf } from './ClientQuotePdf'
import { registerInter } from './fonts'
import type { ClientQuote } from '../../lib/pdf/clientQuote'

export async function renderClientPdf(q: ClientQuote): Promise<Blob> {
  registerInter({ 400: inter400, 600: inter600, 700: inter700, 800: inter800 })
  return pdf(<ClientQuotePdf q={q} />).toBlob()
}
