// Dev only: writes sample client PDFs (job 2 of the reference) to a folder, for visual checks.
// Run: node scripts/export-pdf-samples.mjs <out dir>
import { renderToFile } from '@react-pdf/renderer'
import { ClientQuotePdf } from '../../components/pdf/ClientQuotePdf'
import { registerInter } from '../../components/pdf/fonts'
import { buildClientQuote } from './clientQuote'
import { job2Input, job2LongestInput, job2TiersInput } from './job2.fixture'

export async function exportSamples(out: string, fontDir: string) {
  const f = (w: number) => `${fontDir}/inter-latin-${w}-normal.woff`
  registerInter({ 400: f(400), 600: f(600), 700: f(700), 800: f(800) })
  const samples = {
    'job2.pdf': job2Input(),
    'job2-senza-iva.pdf': job2Input({ vatRate: 0 }),
    'job2-prezzi.pdf': job2Input({ showPrices: true }),
    'job2-colore-chiaro.pdf': job2Input({ profile: { ...job2Input().profile, accent_color: '#FFE14D' } }),
    'job2-opzioni.pdf': job2TiersInput(),
    'job2-lungo.pdf': job2LongestInput(),
  }
  for (const [name, input] of Object.entries(samples)) await renderToFile(<ClientQuotePdf q={buildClientQuote(input)} />, `${out}/${name}`)
}
