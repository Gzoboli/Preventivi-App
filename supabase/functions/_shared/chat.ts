// One conversation per quote (quote_messages). Payload conventions shared by the app and the
// edge function, and the plain-text transcript the AI reads.
import type { AiProposal, AiQuestions, Method } from './pricing.ts'

export type MessageRole = 'electrician' | 'assistant' | 'system'
export type MessageKind = 'text' | 'voice' | 'file' | 'questions' | 'method_proposal' | 'proposal' | 'quote_ready' | 'note'

export type ChatMessage = {
  id: string
  role: MessageRole
  kind: MessageKind
  text: string | null
  audio_file_id: string | null
  file_ids: string[]
  payload: Record<string, unknown>
  quote_version_id: string | null
  created_at: string
}

/** Electrician's answers to a card of AI questions (kind 'text'). */
export type AnswersPayload = {
  answers: { question_id: string; question: string; selected: string[]; custom: string | null }[]
  method_choices?: { section: string; method: Method; confirmed: boolean }[]
}

/** A voice or file message sent from a single question card. */
export type QuestionRef = { question_id?: string; question?: string }

export type ReadyPayload = { type: 'ready_to_generate'; summary: string }
export type QuoteReadyPayload = { version: number; summary: string }
export type ProposalPayload = AiProposal & { status?: 'applied' | 'cancelled' }
export type ErrorPayload = { error: true; mode: string; proposal_message_id?: string | null }

export const METHOD_LABELS: Record<Method, string> = {
  punto: 'A punto',
  ore_materiali: 'Ore + materiali',
  forfait: 'Forfait',
}

/** Conversation as text for the AI. Files are named here; their content is attached separately. */
export function renderTranscript(messages: ChatMessage[], fileNames: Record<string, string>): string {
  const out: string[] = []
  for (const m of messages) {
    if (m.role === 'system') continue
    const who = m.role === 'electrician' ? 'ELETTRICISTA' : 'ASSISTENTE'
    const ref = m.payload as QuestionRef
    const about = ref.question ? ` (risposta alla domanda «${ref.question}»)` : ''
    switch (m.kind) {
      case 'voice':
        out.push(`${who} – vocale${about}: ${m.text?.trim() || '(trascrizione non disponibile)'}`)
        break
      case 'file': {
        const names = m.file_ids.map((id) => fileNames[id] ?? 'file').join(', ')
        out.push(`${who} – allegati${about}: ${names}${m.text?.trim() ? ` — ${m.text.trim()}` : ''}`)
        break
      }
      case 'note':
        out.push(`${who} – nota/modifica manuale: ${m.text ?? ''}`)
        break
      case 'questions': {
        const p = m.payload as unknown as AiQuestions
        out.push(`${who} – domande. ${p.understanding}`)
        if (p.method_proposal) {
          for (const s of p.method_proposal.sections) out.push(`  Metodo proposto per «${s.name}»: ${METHOD_LABELS[s.method]} — ${s.why}`)
        }
        for (const q of p.questions) out.push(`  [${q.id}] ${q.text} (opzioni: ${q.options.join(' / ')})`)
        for (const c of p.challenges) out.push(`  Dubbio: ${c.text}`)
        break
      }
      case 'proposal': {
        const p = m.payload as unknown as ProposalPayload
        out.push(`${who} – proposta di modifica${p.status === 'applied' ? ' (APPLICATA)' : p.status === 'cancelled' ? ' (ANNULLATA)' : ''}: ${p.note}`)
        for (const c of p.changes) out.push(`  ${c.action} ${c.line_id ? `[${c.line_id}] ` : ''}${c.description}`)
        break
      }
      case 'quote_ready':
        out.push(`${who} – ho preparato il preventivo (versione ${(m.payload as QuoteReadyPayload).version ?? '?'}).`)
        break
      default: {
        const a = m.payload as Partial<AnswersPayload> & Partial<ReadyPayload>
        if (a.answers) {
          out.push(`${who} – risposte:`)
          for (const x of a.answers) {
            const value = [...x.selected, ...(x.custom ? [x.custom] : [])].join('; ') || '(non risposto)'
            out.push(`  [${x.question_id}] ${x.question} → ${value}`)
          }
          for (const c of a.method_choices ?? []) {
            out.push(`  Metodo per «${c.section}»: ${METHOD_LABELS[c.method]}${c.confirmed ? ' (confermato)' : ' (cambiato da lui)'}`)
          }
          if (m.text?.trim() && !a.answers.length) out.push(`  ${m.text.trim()}`)
        } else if (a.type === 'ready_to_generate') {
          out.push(`${who} – pronto per generare: ${a.summary}`)
        } else {
          out.push(`${who}: ${m.text ?? ''}`)
        }
      }
    }
  }
  return out.join('\n')
}
