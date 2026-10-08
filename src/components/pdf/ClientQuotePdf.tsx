// The client's PDF quote (Task 5), after riferimento-pdf-cliente.html. Only reads the ClientQuote model.
import { Circle, Document, Image, Page, Path, Rect, StyleSheet, Svg, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { formatEur, formatNumber } from '../../../supabase/functions/_shared/format.ts'
import { ICONS } from '../../lib/icons'
import { plateShapes } from '../../lib/plates'
import type { ClientQuote, ClientSection, ClientTier, PlateStyle, SectionIcon } from '../../lib/pdf/clientQuote'

const T = '#1B2230'
const T2 = '#5A6476'
const T3 = '#8A93A3'
const LINE = '#E2E6EC'
const WARM = '#F7F8FA'

const s = StyleSheet.create({
  // No lineHeight on the Page or on containers: there it hides the fixed footer (react-pdf 4).
  // Multi-line text styles set their own lineHeight, always with an explicit fontSize.
  page: { fontFamily: 'Inter', fontSize: 9.5, color: T, paddingTop: 38, paddingBottom: 52, paddingHorizontal: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 12, borderBottomWidth: 2 },
  company: { flexDirection: 'row', alignItems: 'center', maxWidth: 300 },
  mark: { width: 38, height: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  markText: { color: '#FFFFFF', fontWeight: 800, fontSize: 13 },
  logo: { maxWidth: 110, maxHeight: 40, marginRight: 10, objectFit: 'contain' },
  companyName: { fontSize: 12.5, fontWeight: 700 },
  small: { fontSize: 8.5, color: T2, lineHeight: 1.4 },
  meta: { alignItems: 'flex-end', maxWidth: 210 },
  metaTitle: { fontSize: 10, fontWeight: 700 },
  kicker: { fontSize: 8, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 22 },
  title: { fontSize: 25, fontWeight: 800, lineHeight: 1.1, letterSpacing: -0.3, marginTop: 3, marginBottom: 5 },
  summary: { fontSize: 11.5, color: T2, maxWidth: 410, lineHeight: 1.35 },
  price: {
    marginTop: 20,
    borderRadius: 9,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  priceLabel: { color: '#FFFFFF', fontSize: 8.5, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', opacity: 0.85 },
  priceBig: { color: '#FFFFFF', fontSize: 32, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1, marginTop: 3 },
  priceSub: { color: '#FFFFFF', fontSize: 9, textAlign: 'right', opacity: 0.92 },
  h2: { fontSize: 8, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T3, marginBottom: 6 },
  block: { marginTop: 22 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3.5 },
  tile: { width: '25%', paddingHorizontal: 3.5, marginBottom: 7 },
  tileBox: { borderWidth: 1, borderColor: LINE, borderRadius: 7, padding: 9, minHeight: 84 },
  tileName: { fontSize: 10, fontWeight: 700, lineHeight: 1.2, marginTop: 5 },
  tileText: { fontSize: 8.5, color: T2, lineHeight: 1.3, marginTop: 2 },
  boxes: { flexDirection: 'row', marginTop: 14 },
  box: { backgroundColor: WARM, borderRadius: 7, paddingVertical: 12, paddingHorizontal: 13 },
  bulletRow: { flexDirection: 'row', marginTop: 1.5 },
  bulletDot: { width: 9, fontSize: 9.5, color: T2, lineHeight: 1.4 },
  bulletText: { flex: 1, fontSize: 9.5, color: T2, lineHeight: 1.4 },
  info: { flexDirection: 'row', marginTop: 14 },
  infoCell: { flex: 1, backgroundColor: WARM, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 11 },
  infoLabel: { fontSize: 7.5, color: T3, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase' },
  infoValue: { fontSize: 10, fontWeight: 700, marginTop: 1 },
  opt: {
    marginTop: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9D2DD',
    borderRadius: 7,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 6,
    fontSize: 7.5,
    color: T3,
  },
  tierRow: { flexDirection: 'row', marginTop: 22, alignItems: 'stretch' },
  tierCard: { borderRadius: 9, padding: 10 },
  badge: { position: 'absolute', top: -8, left: 10, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 7 },
  badgeText: { color: '#FFFFFF', fontSize: 7, fontWeight: 700, letterSpacing: 0.8 },
  sec: { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: LINE },
  secIcon: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  secName: { fontSize: 11, fontWeight: 700 },
  amount: { fontSize: 10.5, fontWeight: 700, marginLeft: 10, textAlign: 'right' },
  totals: { marginLeft: 'auto', width: '55%', marginTop: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: T, paddingTop: 5, marginTop: 5 },
  two: { flexDirection: 'row', marginTop: 18 },
  sign: { flexDirection: 'row', marginTop: 26 },
  signLine: { flex: 1, borderTopWidth: 1, borderTopColor: T, paddingTop: 4, fontSize: 8.5, color: T2 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 3, marginTop: 4 },
  tr: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: LINE },
})

const eur = formatEur
/** At most n lines, with an ellipsis (keeps page 1 on one page). */
const clamp = (n: number) => ({ maxLines: n, textOverflow: 'ellipsis' as const })
const vatSub = (vat: number, imponibile: number) => (vat === 0 ? 'IVA esclusa' : `IVA ${formatNumber(vat)}% inclusa\nimponibile ${eur(imponibile)}`)

export function ClientQuotePdf({ q }: { q: ClientQuote }) {
  return (
    <Document title={`Preventivo ${q.number}`} author={q.company.name} subject={q.title} language="it-IT">
      <PageOne q={q} />
      <PageTwo q={q} />
      {q.priceTable && <PageThree q={q} />}
    </Document>
  )
}

// ---------------------------------------------------------------- page 1: colpo d'occhio

function PageOne({ q }: { q: ClientQuote }) {
  return (
    <Page size="A4" style={s.page} wrap={false}>
      <View style={[s.header, { borderBottomColor: q.accent }]}>
        <View style={s.company}>
          <Mark q={q} />
          <View style={{ flexShrink: 1 }}>
            <Text style={s.companyName}>{q.company.name}</Text>
            {q.company.lines.map((l) => (
              <Text key={l} style={s.small}>
                {l}
              </Text>
            ))}
          </View>
        </View>
        <View style={s.meta}>
          <Text style={s.metaTitle}>Preventivo n. {q.number}</Text>
          <Text style={s.small}>{q.date}</Text>
          {q.client && <Text style={s.small}>Per: {q.client}</Text>}
          {q.address && <Text style={[s.small, { textAlign: 'right' }]}>{q.address}</Text>}
        </View>
      </View>

      <Text style={[s.kicker, { color: q.accent }]}>Il lavoro</Text>
      <Text style={[s.title, clamp(2)]}>{q.title}</Text>
      {q.summary && <Text style={[s.summary, clamp(q.summaryLines)]}>{q.summary}</Text>}

      {q.single ? (
        <View style={[s.price, { backgroundColor: q.accent }]}>
          <View>
            <Text style={s.priceLabel}>Totale</Text>
            <Text style={s.priceBig}>{eur(q.single.totale)}</Text>
          </View>
          <Text style={s.priceSub}>{vatSub(q.vatRate, q.single.imponibile)}</Text>
        </View>
      ) : (
        q.tiers && <Tiers q={q} tiers={q.tiers} />
      )}

      {q.tiles.length > 0 && (
        <View style={s.block}>
          <Text style={s.h2}>Cosa comprende</Text>
          <View style={s.tiles}>
            {q.tiles.map((t, i) => (
              <View key={i} style={s.tile} wrap={false}>
                <View style={s.tileBox}>
                  <Icon name={t.icon} color={q.accent} size={19} />
                  <Text style={[s.tileName, clamp(2)]}>{t.name}</Text>
                  {t.summary && <Text style={[s.tileText, clamp(2)]}>{t.summary}</Text>}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={s.boxes}>
        <View style={[s.box, { flex: 1, marginRight: 8 }]}>
          <Text style={s.h2}>Non comprende</Text>
          <Bullets items={q.exclusions.length ? q.exclusions : ['Quello che non è scritto in questo preventivo']} max={4} />
        </View>
        <View style={[s.box, { flex: 1.25, borderLeftWidth: 3, borderLeftColor: q.accent }]}>
          <Text style={s.h2}>Se troviamo sorprese</Text>
          <Text style={{ fontSize: 9.5, color: T2, lineHeight: 1.4 }}>
            {q.clause.map((c, i) => (
              <Text key={i} style={c.bold ? { color: T, fontWeight: 700 } : undefined}>
                {c.text}
              </Text>
            ))}
          </Text>
        </View>
      </View>

      <View style={s.info}>
        {q.info.map((i, n) => (
          <View key={i.label} style={[s.infoCell, n < q.info.length - 1 ? { marginRight: 7 } : {}]}>
            <Text style={s.infoLabel}>{i.label}</Text>
            <Text style={[s.infoValue, clamp(2)]}>{i.value}</Text>
          </View>
        ))}
      </View>

      {q.upgrade && (
        <View style={s.opt} wrap={false}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontWeight: 700 }}>{q.upgrade.text}</Text>
            {q.upgrade.detail && <Text style={s.small}>{q.upgrade.detail}</Text>}
          </View>
          <Text style={{ fontWeight: 700 }}>+ {eur(q.upgrade.price)}</Text>
        </View>
      )}
      <Footer q={q} />
    </Page>
  )
}

function Tiers({ q, tiers }: { q: ClientQuote; tiers: ClientTier[] }) {
  return (
    <View>
      <View style={s.tierRow}>
        {tiers.map((t, i) => (
          <View
            key={t.id}
            style={[
              s.tierCard,
              {
                flex: t.recommended ? 1.15 : 1,
                marginRight: i < tiers.length - 1 ? 7 : 0,
                borderWidth: t.recommended ? 2 : 1,
                borderColor: t.recommended ? t.color : LINE,
                marginTop: t.recommended ? 0 : 6,
              },
            ]}
          >
            {t.recommended && (
              <View style={[s.badge, { backgroundColor: t.color }]}>
                <Text style={s.badgeText}>CONSIGLIATA</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: t.recommended ? 4 : 0 }}>
              <Plate style={t.plate} color={t.color} size={30} />
              <View style={{ marginLeft: 7, flexShrink: 1 }}>
                <Text style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: t.color }}>{t.label}</Text>
                <Text style={[{ fontSize: 10, fontWeight: 700 }, clamp(1)]}>{t.series}</Text>
              </View>
            </View>
            <View style={{ marginTop: 6, minHeight: 36 }}>
              <Bullets items={t.points} max={3} size={8.5} chars={60} />
            </View>
            <Text style={{ fontSize: t.recommended ? 18 : 15, fontWeight: 800, marginTop: 6, color: t.recommended ? t.color : T }}>
              {eur(t.totale)}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[s.small, { marginTop: 4 }]}>{q.vatRate === 0 ? 'Prezzi IVA esclusa' : `Prezzi IVA ${formatNumber(q.vatRate)}% inclusa`}</Text>
    </View>
  )
}

// ---------------------------------------------------------------- page 2: il lavoro nel dettaglio

function PageTwo({ q }: { q: ClientQuote }) {
  return (
    <Page size="A4" style={s.page}>
      <CompactHeader q={q} title="Il lavoro nel dettaglio" />
      <View style={{ marginTop: 4 }}>
        {q.sections.map((sec, i) => (
          <SectionRow key={i} q={q} sec={sec} />
        ))}
      </View>

      <View style={s.totals} wrap={false}>
        <View style={s.totalRow}>
          <Text style={{ color: T2 }}>Imponibile</Text>
          <Text>{eur(q.totals.imponibile)}</Text>
        </View>
        {q.vatRate > 0 && (
          <View style={s.totalRow}>
            <Text style={{ color: T2 }}>IVA {formatNumber(q.vatRate)}%</Text>
            <Text>{eur(q.totals.iva)}</Text>
          </View>
        )}
        <View style={s.grand}>
          <Text style={{ fontSize: 12.5, fontWeight: 800 }}>{q.vatRate > 0 ? 'Totale' : 'Totale (IVA esclusa)'}</Text>
          <Text style={{ fontSize: 12.5, fontWeight: 800 }}>{eur(q.totals.totale)}</Text>
        </View>
        {q.pendingNote && <Text style={[s.small, { marginTop: 4, textAlign: 'right' }]}>Esclusi gli importi da definire in sopralluogo</Text>}
      </View>

      <View style={s.two} wrap={false}>
        {q.notes.length > 0 && (
          <View style={{ flex: 1, marginRight: 18 }}>
            <Text style={s.h2}>Cosa abbiamo considerato</Text>
            <Bullets items={q.notes} max={4} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.h2}>Pagamento</Text>
          <Bullets items={q.payment} max={4} />
        </View>
      </View>

      <View style={{ marginTop: 20 }} wrap={false}>
        <Text style={s.h2}>Per accettazione</Text>
        <View style={s.sign}>
          <Text style={[s.signLine, { marginRight: 28 }]}>Data</Text>
          <Text style={s.signLine}>Firma del cliente</Text>
        </View>
      </View>
      <Footer q={q} />
    </Page>
  )
}

function SectionRow({ q, sec }: { q: ClientQuote; sec: ClientSection }) {
  const points = sec.pending && sec.amount != null ? [...sec.points, 'Una parte da definire in sopralluogo'] : sec.points
  return (
    <View style={s.sec} wrap={false}>
      <View style={[s.secIcon, { backgroundColor: q.soft }]}>
        <Icon name={sec.icon} color={q.accent} size={15} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[s.secName, { flex: 1 }]}>{sec.name}</Text>
          {sec.included ? (
            <Text style={[s.amount, { color: q.accent }]}>inclusa</Text>
          ) : sec.amount == null ? (
            <Text style={[s.amount, { color: T2, fontWeight: 600 }]}>da definire in sopralluogo</Text>
          ) : (
            <Text style={s.amount}>{eur(sec.amount)}</Text>
          )}
        </View>
        {points.length > 0 && (
          <View style={{ marginTop: 2 }}>
            <Bullets items={points} max={4} />
          </View>
        )}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------- page 3: dettaglio dei prezzi (optional)

function PageThree({ q }: { q: ClientQuote }) {
  const cols = [
    { flex: 5 },
    { flex: 1.4, textAlign: 'right' as const },
    { flex: 1.4, textAlign: 'right' as const },
    { flex: 1.5, textAlign: 'right' as const },
  ]
  return (
    <Page size="A4" style={s.page}>
      <CompactHeader q={q} title="Dettaglio dei prezzi" />
      <Text style={[s.small, { marginTop: 8 }]}>Prezzi IVA esclusa.</Text>
      {q.priceTable!.map((sec, i) => (
        <View key={i} style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: 700, fontSize: 10.5 }}>{sec.name}</Text>
          <View style={s.th}>
            {['Voce', 'Q.tà', 'Prezzo', 'Totale'].map((h, n) => (
              <Text key={h} style={[cols[n], { fontSize: 7.5, color: T3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
                {h}
              </Text>
            ))}
          </View>
          {sec.rows.map((r, n) => (
            <View key={n} style={s.tr} wrap={false}>
              <Text style={[cols[0], { paddingRight: 8 }]}>{r.label}</Text>
              <Text style={[cols[1], { color: T2 }]}>{r.qty}</Text>
              <Text style={[cols[2], { color: T2 }]}>{r.price}</Text>
              <Text style={[cols[3], r.total === 'inclusa' ? { color: q.accent, fontWeight: 700 } : { fontWeight: 600 }]}>{r.total}</Text>
            </View>
          ))}
        </View>
      ))}
      <Footer q={q} />
    </Page>
  )
}

// ---------------------------------------------------------------- pieces

function Mark({ q, size = 38 }: { q: ClientQuote; size?: number }) {
  if (q.company.logo) return <Image src={q.company.logo} style={[s.logo, { maxHeight: size + 2 }]} />
  return (
    <View style={[s.mark, { width: size, height: size, backgroundColor: q.accent }]}>
      <Text style={[s.markText, { fontSize: size * 0.34 }]}>{q.company.initials}</Text>
    </View>
  )
}

function CompactHeader({ q, title }: { q: ClientQuote; title: string }) {
  return (
    <View style={[s.header, { borderBottomColor: q.accent, alignItems: 'center' }]}>
      <View style={s.company}>
        <Mark q={q} size={30} />
        <View>
          <Text style={{ fontSize: 11, fontWeight: 700 }}>{q.company.name}</Text>
          <Text style={s.small}>
            Preventivo n. {q.number}
            {q.client ? ` · ${q.client}` : ''}
          </Text>
        </View>
      </View>
      <Text style={s.metaTitle}>{title}</Text>
    </View>
  )
}

function Footer({ q }: { q: ClientQuote }) {
  return (
    <View style={s.footer} fixed>
      <Text>{q.company.name}</Text>
      <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`} />
    </View>
  )
}

/** Up to `max` bullets of at most ~`chars` characters (maxLines on a bullet adds blank space in react-pdf 4). */
function Bullets({ items, max, size, chars = 140 }: { items: string[]; max: number; size?: number; chars?: number }): ReactNode {
  return items.slice(0, max).map((it, i) => (
    <View key={i} style={s.bulletRow}>
      <Text style={[s.bulletDot, size ? { fontSize: size } : {}]}>•</Text>
      <Text style={[s.bulletText, size ? { fontSize: size } : {}]}>{it.length > chars ? `${it.slice(0, chars - 1).trimEnd()}…` : it}</Text>
    </View>
  ))
}

function Icon({ name, color, size }: { name: SectionIcon; color: string; size: number }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      {ICONS[name].map((sh, i) =>
        sh.kind === 'path' ? (
          <Path key={i} d={sh.d} stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : sh.kind === 'rect' ? (
          <Rect key={i} x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={sh.rx} stroke={color} strokeWidth={1.8} fill="none" />
        ) : (
          <Circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} stroke={color} strokeWidth={1.8} fill="none" />
        ),
      )}
    </Svg>
  )
}

function Plate({ style, color, size }: { style: PlateStyle; color: string; size: number }) {
  return (
    <Svg viewBox="0 0 40 40" width={size} height={size}>
      {plateShapes(style, color).map((sh, i) =>
        sh.kind === 'rect' ? (
          <Rect
            key={i}
            x={sh.x}
            y={sh.y}
            width={sh.w}
            height={sh.h}
            rx={sh.rx}
            fill={sh.fill}
            stroke={sh.stroke ?? 'none'}
            strokeWidth={sh.stroke ? 1 : 0}
            fillOpacity={sh.opacity ?? 1}
          />
        ) : (
          <Path key={i} d={sh.d} fill={sh.fill} fillOpacity={sh.opacity ?? 1} />
        ),
      )}
    </Svg>
  )
}
