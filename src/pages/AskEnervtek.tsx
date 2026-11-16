// Ask Enervtek, control-room style: a centred chat with a glowing composer,
// "reading data" steps as ticking chips, answers whose first bold line is a
// headline and whose bold numbers are pills, and topic tabs for suggestions.
// Answers come from sim/assistant unchanged; only presentation lives here.
import clsx from 'clsx'
import {
  ArrowRight,
  ArrowUp,
  Check,
  Database,
  Gauge,
  HeartPulse,
  Info,
  Lightbulb,
  Loader2,
  MessageCircle,
  Package,
  RotateCcw,
  Sparkles,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SUGGESTIONS, answer, questionFor, type Answer } from '../sim/assistant'

interface Msg {
  id: number
  role: 'user' | 'bot'
  text: string
  a?: Answer
}

/** Icons for the suggestion topics (by the group names in sim/assistant) */
const TOPIC_ICON: Record<string, LucideIcon> = {
  Downtime: Timer,
  Production: Package,
  'Machine health': HeartPulse,
  Recommendations: Lightbulb,
}
const topicIcon = (g: string) => TOPIC_ICON[g] ?? MessageCircle
const TOPIC_SHORT: Record<string, string> = { 'Machine health': 'Health', Recommendations: 'Fixes' }

/** Data source icon for a "reading" step */
const sourceIcon = (step: string): LucideIcon =>
  /meter|current|feeder|power/i.test(step) ? Gauge : /stop|downtime|reason|job/i.test(step) ? Timer : /health|check|wear|indicator/i.test(step) ? HeartPulse : Database

const WELCOME: { q: string; icon: LucideIcon }[] = [
  { q: 'Which machines are stopped right now?', icon: Timer },
  { q: 'How much production did we lose this month?', icon: Package },
  { q: 'Which machine is most likely to break down?', icon: HeartPulse },
  { q: 'What should my team fix first?', icon: Lightbulb },
]

/** **bold** → bold text; bold numbers become highlighted pills */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (!p.startsWith('**')) return <Fragment key={i}>{p}</Fragment>
        const inner = p.slice(2, -2)
        return /\d/.test(inner) ? (
          <span key={i} className="num inline-block px-1.5 py-px mx-px rounded-md bg-brand/15 text-brand font-bold">
            {inner}
          </span>
        ) : (
          <b key={i} className="font-semibold text-fg">
            {inner}
          </b>
        )
      })}
    </>
  )
}

/** Animated Enervtek orb: the assistant's face */
function Orb({ size = 32, live }: { size?: number; live?: boolean }) {
  return (
    <span className="relative grid place-items-center shrink-0" style={{ width: size, height: size }}>
      {live && <span className="absolute inset-0 rounded-full bg-brand map-ping" />}
      <span
        className="relative w-full h-full rounded-full grid place-items-center text-bg"
        style={{ background: 'radial-gradient(circle at 30% 25%, rgb(var(--brand-soft)), rgb(var(--brand)) 55%, rgb(var(--brand) / 0.6))', boxShadow: '0 0 24px rgb(var(--brand) / 0.35)' }}
      >
        <Sparkles size={size * 0.45} strokeWidth={2.2} />
      </span>
    </span>
  )
}

/* ------------------------------ page ------------------------------ */

export function AskEnervtek() {
  const [params, setParams] = useSearchParams()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [topic, setTopic] = useState(SUGGESTIONS[0]?.group ?? '')
  const [tips, setTips] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const idRef = useRef(1)
  const started = useRef(false)

  const ask = (q: string) => {
    if (busy || !q.trim()) return
    const a = answer(q)
    setMsgs((m) => [...m, { id: idRef.current++, role: 'user', text: q.trim() }, { id: idRef.current++, role: 'bot', text: '', a }])
    setInput('')
    setTips(false)
    setBusy(true)
  }

  // Question passed from another page (?m= or ?about=)
  useEffect(() => {
    if (started.current) return
    const q = questionFor(params)
    if (q) {
      started.current = true
      ask(q)
      setParams({}, { replace: true })
    }
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs, busy])

  const group = SUGGESTIONS.find((g) => g.group === topic) ?? SUGGESTIONS[0]

  return (
    <div className="flex flex-col h-[calc(100dvh-6.5rem)] md:h-[calc(100dvh-7.5rem)] min-h-[520px]">
      {/* Header */}
      <header className="flex items-center gap-3 shrink-0">
        <Orb size={34} />
        <h1 className="font-display font-bold text-[20px] sm:text-[24px]">Ask Enervtek</h1>
        <span className="hidden sm:inline-flex items-center h-7 px-3 rounded-full bg-sunken text-[12px] font-semibold text-muted">English · Roman Urdu</span>
        <div className="flex-1" />
        <span
          tabIndex={0}
          title="Demo: answers are prepared from this mill's data. In the live system Enervtek answers any question from your meters."
          className="focus-ring w-9 h-9 grid place-items-center rounded-lg text-faint hover:text-fg cursor-help"
        >
          <Info size={16} />
        </span>
        {msgs.length > 0 && (
          <button
            onClick={() => !busy && setMsgs([])}
            disabled={busy}
            className="focus-ring inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line text-[13px] font-semibold text-muted hover:text-fg hover:bg-sunken disabled:opacity-40"
          >
            <RotateCcw size={14} /> <span className="hidden sm:inline">New chat</span>
          </button>
        )}
      </header>

      <div className="flex-1 min-h-0 grid xl:grid-cols-[minmax(0,1fr)_300px] gap-4 mt-4">
        {/* Chat */}
        <div className="flex flex-col min-h-0 rounded-2xl border border-line bg-panel overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-6 space-y-7">
              {msgs.length === 0 && <Welcome onAsk={ask} />}
              {msgs.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end rise">
                    <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-md bg-brand text-bg font-medium px-4 py-2.5 text-[14px]">{m.text}</div>
                  </div>
                ) : (
                  <BotMessage key={m.id} a={m.a!} onDone={() => setBusy(false)} onAsk={ask} />
                ),
              )}
              <div ref={endRef} />
            </div>
          </div>

          {/* Phones: suggestions above the composer */}
          <div className="xl:hidden px-3 sm:px-4">
            <button onClick={() => setTips(!tips)} aria-expanded={tips} className="focus-ring inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-sunken text-[12px] font-semibold text-muted hover:text-fg">
              <Lightbulb size={13} /> Suggestions
            </button>
            {tips && (
              <div className="rise flex gap-2 overflow-x-auto py-2 -mx-3 px-3 sm:-mx-4 sm:px-4">
                {SUGGESTIONS.flatMap((g) => g.qs).map((q) => (
                  <button key={q} disabled={busy} onClick={() => ask(q)} className="shrink-0 h-9 px-3 rounded-full border border-line text-[12.5px] whitespace-nowrap hover:border-brand/60 disabled:opacity-50">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              ask(input)
            }}
            className="p-3 sm:p-4"
          >
            <div className="max-w-[820px] mx-auto flex items-center gap-2 rounded-2xl border border-line bg-sunken/60 pl-4 pr-1.5 py-1.5 transition-shadow focus-within:border-brand/60 focus-within:shadow-[0_0_0_4px_rgb(var(--brand)/0.12),0_0_32px_rgb(var(--brand)/0.15)]">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder='Ask anything, e.g. "Card 21 kyun band hai?"'
                className="flex-1 min-w-0 h-10 bg-transparent outline-none text-[14px] placeholder:text-faint"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                title="Send"
                className="focus-ring w-10 h-10 grid place-items-center rounded-xl bg-brand text-bg hover:brightness-110 disabled:opacity-30 transition"
              >
                {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
              </button>
            </div>
          </form>
        </div>

        {/* Desktop: suggestions by topic */}
        <aside className="hidden xl:flex flex-col rounded-2xl border border-line bg-panel p-4 min-h-0">
          <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint mb-3">Try asking</div>
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-sunken" role="tablist">
            {SUGGESTIONS.map((g) => {
              const Icon = topicIcon(g.group)
              const on = g.group === topic
              return (
                <button
                  key={g.group}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTopic(g.group)}
                  title={g.group}
                  className={clsx('focus-ring flex flex-col items-center gap-1 py-2 rounded-lg text-[10.5px] font-semibold transition-colors', on ? 'bg-panel text-brand shadow-card' : 'text-muted hover:text-fg')}
                >
                  <Icon size={16} />
                  {TOPIC_SHORT[g.group] ?? g.group}
                </button>
              )
            })}
          </div>
          <div key={group?.group} className="space-y-2 mt-3 overflow-y-auto">
            {group?.qs.map((q, i) => (
              <button
                key={q}
                disabled={busy}
                onClick={() => ask(q)}
                style={{ animationDelay: `${i * 50}ms` }}
                className="rise group w-full text-left text-[13px] rounded-xl border border-line px-3 py-2.5 hover:border-brand/60 hover:bg-sunken/60 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <span className="flex-1">{q}</span>
                <ArrowRight size={14} className="text-faint group-hover:text-brand shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------ welcome ------------------------------ */

function Welcome({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <div className="max-w-xl mx-auto text-center pt-4 sm:pt-10">
      <div className="flex justify-center">
        <Orb size={64} />
      </div>
      <h2 className="font-display font-bold text-[22px] sm:text-[26px] mt-5">Assalam-o-alaikum</h2>
      <p className="text-[14px] text-muted mt-1">Ask anything about your mill.</p>
      <div className="grid sm:grid-cols-2 gap-2.5 mt-7 text-left">
        {WELCOME.map(({ q, icon: Icon }, i) => (
          <button
            key={q}
            onClick={() => onAsk(q)}
            style={{ animationDelay: `${120 + i * 70}ms` }}
            className="rise focus-ring group rounded-2xl border border-line bg-sunken/40 px-4 py-3.5 flex items-start gap-3 hover:border-brand/60 hover:bg-sunken transition-colors"
          >
            <span className="w-8 h-8 rounded-lg bg-mint text-brand grid place-items-center shrink-0">
              <Icon size={16} />
            </span>
            <span className="text-[13.5px] font-medium leading-snug pt-1">{q}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------ one answer ------------------------------ */

function BotMessage({ a, onDone, onAsk }: { a: Answer; onDone: () => void; onAsk: (q: string) => void }) {
  const [step, setStep] = useState(0) // reading steps shown
  const [chars, setChars] = useState(0)
  const full = a.paras.join('\n\n')
  const reading = step < a.reading.length + 1
  const typing = !reading && chars < full.length
  const done = !reading && !typing
  const doneRef = useRef(false)

  useEffect(() => {
    if (reading) {
      const t = setTimeout(() => setStep((s) => s + 1), 520)
      return () => clearTimeout(t)
    }
    if (typing) {
      const t = setTimeout(() => setChars((c) => Math.min(full.length, c + 6)), 14)
      return () => clearTimeout(t)
    }
    if (!doneRef.current) {
      doneRef.current = true
      onDone()
    }
  }, [reading, typing, step, chars, full.length, onDone])

  // Show only complete **bold** markers while typing
  let shown = full.slice(0, chars)
  if ((shown.match(/\*\*/g) ?? []).length % 2 === 1) shown += '**'
  const paras = shown.split('\n\n')
  // A first paragraph that is all bold reads as the headline
  const headline = /^\*\*[^*]+\*\*$/.test(paras[0] ?? '') ? paras[0].slice(2, -2) : null
  const body = headline ? paras.slice(1) : paras

  return (
    <div className="flex gap-3 rise">
      <div className="pt-0.5">
        <Orb size={30} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-muted mb-2">Enervtek</div>

        {/* What it is reading, ticked off one by one */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {step === 0 && (
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-sunken text-[11.5px] text-muted">
              <Loader2 size={12} className="animate-spin text-brand" /> Thinking…
            </span>
          )}
          {a.reading.slice(0, Math.min(step, a.reading.length)).map((r, i) => {
            const active = reading && i === step - 1
            const Icon = sourceIcon(r)
            return (
              <span
                key={r}
                className={clsx(
                  'rise inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11.5px] border transition-colors',
                  active ? 'border-brand/50 text-fg bg-brand/10' : 'border-line text-muted',
                )}
              >
                <Icon size={12} className={active ? 'text-brand' : 'text-faint'} />
                <span className="max-w-[240px] sm:max-w-none truncate">{r}</span>
                {active ? <Loader2 size={12} className="animate-spin text-brand" /> : <Check size={12} className="text-brand" strokeWidth={3} />}
              </span>
            )
          })}
        </div>

        {!reading && (
          <div className="space-y-3">
            {headline && <div className="font-display font-bold text-[19px] sm:text-[21px] leading-snug">{headline}</div>}
            {body.map((p, i) => (
              <p key={i} className="text-[14px] leading-relaxed text-fg/85">
                <Rich text={p} />
              </p>
            ))}
          </div>
        )}

        {done && (
          <div className="rise">
            {a.attach && (
              <div className="mt-4 rounded-xl border border-line bg-sunken/30 overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 h-8 border-b border-line text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">
                  <Database size={11} /> From your data
                </div>
                <div className="p-3 sm:p-4 overflow-x-auto">{a.attach}</div>
              </div>
            )}

            {a.links && a.links.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {a.links.map((l) => (
                  <Link key={l.to + l.label} to={l.to} className="focus-ring inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-brand text-bg text-[12.5px] font-bold hover:brightness-110">
                    {l.label} <ArrowRight size={13} />
                  </Link>
                ))}
              </div>
            )}

            {a.followUps && a.followUps.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {a.followUps.map((q) => (
                  <button key={q} onClick={() => onAsk(q)} className="focus-ring inline-flex items-center gap-1.5 text-[12.5px] rounded-full border border-line px-3 h-8 hover:border-brand/60 hover:bg-sunken/60">
                    <MessageCircle size={12} className="text-faint" /> {q}
                  </button>
                ))}
              </div>
            )}

            {a.sources && (
              <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[11px] text-faint">
                <Database size={11} /> Based on
                {a.sources.split(/,\s*/).map((s) => (
                  <span key={s} className="h-6 px-2 inline-flex items-center rounded-md bg-sunken text-muted">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
