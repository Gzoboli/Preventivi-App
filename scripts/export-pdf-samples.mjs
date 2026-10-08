// Dev only: renders the sample client PDFs with the app's own code (through Vite's module loader).
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const out = process.argv[2] ?? '.'
const root = fileURLToPath(new URL('..', import.meta.url))
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { exportSamples } = await server.ssrLoadModule('/src/lib/pdf/exportSamples.tsx')
  await exportSamples(out, `${root}node_modules/@fontsource/inter/files`)
  console.log('PDF scritti in', out)
} finally {
  await server.close()
}
