import clsx from 'clsx'
import { ArrowRight, ArrowUp, Bot, Check, Database, Loader2, RotateCcw } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EnervtekMark } from '../components/layout/Logo'
import { PageHeader } from '../components/ui/primitives'
import { SUGGESTIONS, answer, questionFor, type Answer } from '../sim/assistant'

interface Msg {
  id: number
  role: 'user' | 'bot'
  text: string
  a?: Answer
}

/** **bold** → <b> */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <b key={i} className="font-semibold text-fg">
            {p.slice(2, -2)}
          </b>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

export function AskEnervtek() {
  const [params, setParams] = useSearchParams()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(1)
  const started = useRef(false)

  const ask = (q: string) => {
    if (busy || !q.trim()) return
    const a = answer(q)
    setMsgs((m) => [...m, { id: idRef.current++, role: 'user', text: q.trim() }, { id: idRef.current++, role: 'bot', text: '', a }])
    setInput('')
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

  return (
    <>
      <PageHeader
        layer={{ n: 3, name: 'AI advisor' }}
        title="Ask Enervtek"
        subtitle="Ask about your mill in plain words, in English or Roman Urdu. Every answer is worked out from your own meters, and shows where it came from."
        actions={
          msgs.length > 0 && (
            <button onClick={() => !busy && setMsgs([])} className="btn-ghost border border-line">
              <RotateCcw size={14} /> New conversation
            </button>
          )
        }
      />

      <div className="grid xl:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="card flex flex-col h-[calc(100vh-230px)] min-h-[520px]">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {msgs.length === 0 && <Welcome onAsk={ask} />}
            {msgs.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[75%] rounded-2xl rounded-br-md bg-brand text-white px-4 py-2.5 text-[14px]">{m.text}</div>
                </div>
              ) : (
                <BotMessage key={m.id} a={m.a!} onDone={() => setBusy(false)} onAsk={ask} />
              ),
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              ask(input)
            }}
            className="border-t border-line p-3 flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Ask anything, e.g. "Card 21 kyun band hai?"'
              className="focus-ring flex-1 h-11 px-4 rounded-xl bg-sunken border border-line text-[14px] placeholder:text-faint"
            />
            <button type="submit" disabled={busy || !input.trim()} className="btn-primary !h-11 !w-11 !px-0 justify-center disabled:opacity-40" title="Send">
              {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
            </button>
          </form>
        </div>

        <aside className="card p-4">
          <div className="eyebrow mb-3">Try asking</div>
          <div className="space-y-4">
            {SUGGESTIONS.map((g) => (
              <div key={g.group}>
                <div className="text-[12px] font-semibold text-muted mb-1.5">{g.group}</div>
                <div className="space-y-1.5">
                  {g.qs.map((q) => (
                    <button
                      key={q}
                      disabled={busy}
                      onClick={() => ask(q)}
                      className="w-full text-left text-[13px] rounded-lg border border-line px-3 py-2 hover:border-brand-soft hover:bg-mint/50 transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-4 leading-relaxed">
            Demo: answers are prepared from this mill's data. In the live system Enervtek answers any question from your meters.
          </p>
        </aside>
      </div>
    </>
  )
}

function Welcome({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <div className="max-w-xl mx-auto text-center pt-6">
      <div className="flex justify-center">
        <EnervtekMark size={52} />
      </div>
      <h2 className="font-display font-bold text-[22px] mt-4">Assalam-o-alaikum. What would you like to know?</h2>
      <p className="text-[14px] text-muted mt-2">I watch every machine, feeder and meter in your mill. Ask me which machines are down, why they stopped, what it cost in production, or what to fix next.</p>
      <div className="grid sm:grid-cols-2 gap-2 mt-6 text-left">
        {['Which machines are stopped right now?', 'How much production did we lose this month?', 'Which machine is most likely to break down?', 'What should my team fix first?'].map((q) => (
          <button key={q} onClick={() => onAsk(q)} className="rounded-xl border border-line px-4 py-3 text-[13px] font-medium hover:border-brand-soft hover:bg-mint/50 transition-colors">
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

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

  return (
    <div className="flex gap-3">
      <div className="shrink-0 pt-0.5">
        <EnervtekMark size={32} />
      </div>
      <div className="flex-1 min-w-0 max-w-[880px]">
        <div className="text-[12px] font-semibold text-muted mb-1.5">Enervtek</div>

        <div className="space-y-1 mb-2">
          {a.reading.slice(0, Math.min(step, a.reading.length)).map((r, i) => {
            const active = reading && i === step - 1
            return (
              <div key={r} className="flex items-center gap-2 text-[12px] text-muted">
                {active ? <Loader2 size={12} className="animate-spin text-brand" /> : <Check size={12} className="text-brand" />}
                <Database size={11} className="text-faint" />
                {r}
              </div>
            )
          })}
          {step === 0 && (
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <Bot size={13} className="text-brand" /> Thinking…
            </div>
          )}
        </div>

        {!reading && (
          <div className="space-y-3 text-[14px] leading-relaxed text-fg/90">
            {shown.split('\n\n').map((p, i) => (
              <p key={i}>
                <Rich text={p} />
              </p>
            ))}
          </div>
        )}

        {done && (
          <>
            {a.attach && <div className="mt-4 rounded-xl border border-line bg-panel p-4">{a.attach}</div>}
            {(a.links?.length || a.sources) && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {a.links?.map((l) => (
                  <Link key={l.to + l.label} to={l.to} className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-mint text-brand text-[12px] font-semibold hover:bg-brand-soft/60">
                    {l.label} <ArrowRight size={13} />
                  </Link>
                ))}
                {a.sources && (
                  <span className="text-[11px] text-muted inline-flex items-center gap-1 ml-1">
                    <Database size={11} /> Based on: {a.sources}
                  </span>
                )}
              </div>
            )}
            {a.followUps && a.followUps.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {a.followUps.map((q) => (
                  <button key={q} onClick={() => onAsk(q)} className={clsx('text-[12px] rounded-full border border-line px-3 h-8 hover:border-brand-soft hover:bg-mint/50')}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
