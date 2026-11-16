import clsx from 'clsx'
import { AlertTriangle, BadgeCheck, Bot, Check, ChevronDown, CircleDollarSign, LayoutList, MapPin, MessageSquareQuote, Timer, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Evidence } from '../components/charts/Evidence'
import { PageHeader } from '../components/ui/primitives'
import { Disclosure } from '../components/ui/structure'
import { fmt, pkr } from '../lib/format'
import { INSIGHTS, type Insight, type Kind } from '../sim/insights'
import { STAGES, TRACK } from '../sim/tracking'
import { ruleForInsight } from '../sim/iso'

type Tab = 'all' | Kind

const KIND: Record<Kind, { label: string; short: string; icon: LucideIcon; tint: string; ink: string; hex: string }> = {
  downtime: { label: 'Stopping production', short: 'Downtime', icon: Timer, tint: 'bg-alarm-bg', ink: 'text-alarm', hex: '#B83A2C' },
  waste: { label: 'Energy waste', short: 'Waste', icon: CircleDollarSign, tint: 'bg-warn-bg', ink: 'text-warn', hex: '#E0A100' },
  problem: { label: 'Machine problems caught early', short: 'Problem', icon: AlertTriangle, tint: 'bg-warn-bg', ink: 'text-warn', hex: '#E0A100' },
  verified: { label: 'Fixed and confirmed', short: 'Fixed', icon: BadgeCheck, tint: 'bg-mint', ink: 'text-brand', hex: '#237A57' },
}
const ORDER: Kind[] = ['downtime', 'problem']

/** Downtime first (most yarn first), then machine problems */
const byKind = (k: Kind) => INSIGHTS.filter((i) => i.kind === k).sort((a, b) => (b.kgMonth ?? 0) - (a.kgMonth ?? 0))

export function Recommendations() {
  const { hash } = useLocation()
  const focus = hash.replace('#', '')
  const [tab, setTab] = useState<Tab>('all')
  const firstId = focus || byKind('downtime')[0]?.id
  const [open, setOpen] = useState<Set<string>>(new Set(firstId ? [firstId] : []))

  const openOne = (id: string) => {
    setTab('all')
    setOpen((o) => new Set(o).add(id))
    setTimeout(() => document.getElementById(`rec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  useEffect(() => {
    if (focus) openOne(focus)
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const list = (tab === 'all' ? ORDER : [tab]).flatMap(byKind)

  return (
    <>
      <PageHeader
        layer={{ n: 3, name: 'AI advisor' }}
        title="What to fix first"
        subtitle="Everything Enervtek found, most important first: what is happening, what to do, and who is doing it. Click any line for the full story and the proof."
      />

      <Summary onPick={openOne} />

      <CategoryTabs tab={tab} setTab={setTab} />

      <div className="space-y-3">
        {list.map((i) => (
          <RecRow key={i.id} insight={i} open={open.has(i.id)} onToggle={() => toggle(i.id)} focused={focus === i.id} />
        ))}
      </div>
    </>
  )
}

/* ------------------------------ top: what to do, and where it stands ------------------------------ */

function Summary({ onPick }: { onPick: (id: string) => void }) {
  const first = byKind('downtime')[0]
  const counts = STAGES.map((_, s) => INSIGHTS.filter((i) => TRACK[i.id].stage === s).length)
  const kg = byKind('downtime').reduce((a, i) => a + (i.kgMonth ?? 0), 0)
  return (
    <section className="card p-6 grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-x-10 gap-y-6 items-center">
      <div>
        <p className="font-display font-bold text-[24px] leading-tight">
          {INSIGHTS.length} things to fix. Start with <span className="text-alarm">{first.title.charAt(0).toLowerCase() + first.title.slice(1)}</span>.
        </p>
        <p className="text-[15px] text-muted mt-2">
          The {byKind('downtime').length} downtime findings cost about <b className="text-fg">{fmt(kg)} kg of yarn a month</b>. The other {byKind('problem').length} are machine problems
          caught before they cause a breakdown.
        </p>
        <button onClick={() => onPick(first.id)} className="btn-primary mt-4">
          Open the first fix
        </button>
      </div>
      <div>
        <div className="text-[13px] text-muted mb-3">Where each fix stands</div>
        <div className="grid grid-cols-5 gap-2">
          {STAGES.map((st, i) => (
            <div key={st} className={clsx('rounded-xl px-3 py-3 text-center', counts[i] ? 'bg-mint' : 'bg-sunken/70')}>
              <div className={clsx('font-display font-bold text-[26px] leading-none num', counts[i] ? 'text-brand-dark' : 'text-faint')}>{counts[i]}</div>
              <div className="text-[12px] text-muted mt-1.5">{st}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------ categories ------------------------------ */

function CategoryTabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string; icon: LucideIcon; count: number; sub: string; ink: string; tint: string }[] = [
    { id: 'all', label: 'All findings', icon: LayoutList, count: INSIGHTS.length, sub: 'Most important first', ink: 'text-brand-dark', tint: 'bg-sunken' },
    ...ORDER.map((k) => {
      const l = byKind(k)
      return {
        id: k as Tab,
        label: KIND[k].label,
        icon: KIND[k].icon,
        count: l.length,
        sub: k === 'downtime' ? `${fmt(l.reduce((a, i) => a + (i.kgMonth ?? 0), 0))} kg of yarn a month` : 'Before they become breakdowns',
        ink: KIND[k].ink,
        tint: KIND[k].tint,
      }
    }),
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-8 mb-5" role="tablist">
      {items.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => setTab(t.id)}
            className={clsx(
              'focus-ring text-left rounded-xl px-4 py-3.5 flex items-center gap-3 border transition-all',
              active ? 'bg-brand-dark border-brand-dark text-white shadow-pop' : 'bg-panel border-line hover:border-brand-soft shadow-card',
            )}
          >
            <span className={clsx('w-10 h-10 rounded-full grid place-items-center shrink-0', active ? 'bg-white/15 text-white' : clsx(t.tint, t.ink))}>
              <t.icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-[14px] truncate">{t.label}</span>
                <span className="font-display font-bold text-[20px] num leading-none">{t.count}</span>
              </span>
              <span className={clsx('block text-[12px] truncate mt-0.5', active ? 'text-white/70' : 'text-muted')}>{t.sub}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ one recommendation ------------------------------ */

function RecRow({ insight: i, open, onToggle, focused }: { insight: Insight; open: boolean; onToggle: () => void; focused: boolean }) {
  const k = KIND[i.kind]
  const tr = TRACK[i.id]
  const verified = i.kind === 'verified'

  return (
    <article id={`rec-${i.id}`} className={clsx('card overflow-hidden scroll-mt-4', (focused || open) && 'ring-2 ring-brand/40')}>
      {/* Collapsed line: category, what, how much, where it stands */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="focus-ring w-full text-left px-5 py-4 grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_170px_180px_auto] gap-4 items-center hover:bg-sunken/50 transition-colors"
      >
        <span className={clsx('w-10 h-10 rounded-full grid place-items-center', k.tint, k.ink)} title={k.label}>
          <k.icon size={19} />
        </span>
        <div className="min-w-0">
          <div className={clsx('text-[11px] font-bold uppercase tracking-wide', k.ink)}>{k.label}</div>
          <div className="font-display font-semibold text-[16px] leading-snug mt-0.5">{i.title}</div>
          <div className="text-[12px] text-muted mt-0.5 truncate">
            {i.where} · found {tr.found.toLowerCase()}
          </div>
        </div>
        <div className="hidden md:block text-right">
          {i.kgMonth ? (
            <>
              <div className="font-display font-bold text-[22px] num leading-none">{fmt(i.kgMonth)} kg</div>
              <div className="text-[11px] text-muted mt-1">yarn lost / month</div>
            </>
          ) : i.rsMonth > 0 ? (
            <>
              <div className={clsx('font-display font-bold text-[22px] num leading-none', verified ? 'text-brand' : 'text-fg')}>{pkr(i.rsMonth)}</div>
              <div className="text-[11px] text-muted mt-1">{verified ? 'saved / month' : 'lost / month'}</div>
            </>
          ) : (
            <>
              <div className="font-display font-bold text-[15px] text-warn leading-tight">Breakdown risk</div>
              <div className="text-[11px] text-muted mt-1">caught early</div>
            </>
          )}
        </div>
        <div className="hidden md:block">
          <MiniStage stage={tr.stage} />
          <div className="text-[11px] text-muted mt-1 truncate">{tr.owner}</div>
        </div>
        <ChevronDown size={18} className={clsx('text-faint transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-line">
          {/* Key facts: the things to see first */}
          <div className={clsx('grid grid-cols-2 lg:grid-cols-5', verified ? 'bg-mint/60' : i.kind === 'problem' || i.kind === 'downtime' ? 'bg-alarm-bg/50' : 'bg-warn-bg/60')}>
            <Fact
              label={verified ? 'Saved every month' : i.kgMonth ? 'Yarn lost every month' : i.rsMonth > 0 ? 'Lost every month' : 'What is at stake'}
              value={i.kgMonth ? `${fmt(i.kgMonth)} kg` : i.rsMonth > 0 ? pkr(i.rsMonth) : i.impact.split('.')[0]}
              big={i.rsMonth > 0 || !!i.kgMonth}
              tone={verified ? 'text-brand' : i.rsMonth > 0 ? 'text-fg' : 'text-alarm'}
            />
            <Fact label="Cost to fix" value={tr.measure.cost} />
            <Fact label="What it brings" value={tr.measure.payback} />
            <Fact label="Owner" value={tr.owner} />
            <Fact label={verified ? 'Status' : 'Due'} value={tr.due} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr]">
            <div className="p-6">
              <p className="text-[15px] leading-relaxed">{i.plain}</p>
              {(i.rsMonth > 0 || i.kgMonth) && <p className="text-[13px] text-muted mt-2">{i.impact}</p>}

              <div className="mt-5">
                <div className="font-display font-semibold text-[15px] mb-2.5">{verified ? 'What was done' : 'What to do'}</div>
                <ol className="space-y-2.5">
                  {tr.steps.map((s, n) => (
                    <li key={s} className="text-[14px] flex gap-3">
                      <span className="w-6 h-6 rounded-full bg-brand text-white grid place-items-center text-[12px] font-bold shrink-0">{n + 1}</span>
                      {s.replace(' ✓', '')}
                    </li>
                  ))}
                </ol>
                <div className="text-[12px] text-muted mt-3">
                  How we prove it worked: <b className="text-fg">{tr.measure.verify}</b>
                </div>
                {ruleForInsight(i.id) && (
                  <span className="mt-2 inline-flex items-center gap-2 text-[12px] rounded-full bg-alarm-bg text-alarm font-semibold px-3 py-1">
                    Operating rule {ruleForInsight(i.id)!.id} broken {ruleForInsight(i.id)!.breaches} of {ruleForInsight(i.id)!.of} days · {ruleForInsight(i.id)!.rule}
                  </span>
                )}
              </div>

              <Disclosure label={verified ? 'Cause and background' : 'Possible causes, and what your team told us'} hideLabel="Hide" className="mt-4 -ml-3">
                <div className="pl-3 space-y-3">
                  <ul className="space-y-1.5">
                    {tr.causes.map((c) => (
                      <li key={c} className="text-[13px] flex gap-2">
                        <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-line-strong shrink-0" />
                        {c}
                      </li>
                    ))}
                  </ul>
                  {!verified && <div className="text-[12px] text-muted">These are likely causes. They are confirmed once someone inspects.</div>}
                  <div className="rounded-xl bg-mint/60 px-4 py-3 flex gap-3">
                    <MessageSquareQuote size={17} className="text-brand shrink-0 mt-0.5" />
                    <div className="text-[13px]">
                      <span className="text-muted">During the visit your team said: </span>
                      <i>“{i.heard}”</i>
                    </div>
                  </div>
                  <div className="text-[12px] text-muted">
                    Matches the textile measure library: <b className="text-fg">{tr.measure.family} · {tr.measure.name}</b>
                  </div>
                </div>
              </Disclosure>
            </div>

            <div className="p-6 bg-bg/60 xl:border-l border-t xl:border-t-0 border-line flex flex-col">
              <div className="font-display font-semibold text-[15px]">The proof</div>
              <div className="text-[13px] text-muted mt-0.5">{tr.evidence}</div>
              <div className="card mt-3 px-2 pt-1">
                <Evidence id={i.id} />
              </div>

              <div className="font-display font-semibold text-[15px] mt-5 mb-3">Progress</div>
              <Stepper stage={tr.stage} />

              <div className="flex flex-wrap gap-2 mt-auto pt-5">
                {i.machineIds[0] && (
                  <Link to={`/map?m=${i.machineIds[0]}`} className="btn-ghost border border-line bg-panel">
                    <MapPin size={15} /> On the map
                  </Link>
                )}
                {tr.link && (
                  <Link to={tr.link.to} className="btn-ghost border border-line bg-panel">
                    {tr.link.label}
                  </Link>
                )}
                <Link to={`/ask?about=${i.id}`} className="btn-ghost border border-line bg-panel">
                  <Bot size={15} /> Ask Enervtek
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

function Fact({ label, value, big, tone }: { label: string; value: string; big?: boolean; tone?: string }) {
  return (
    <div className="px-5 py-4 border-b lg:border-b-0 lg:border-r border-line/70 last:border-r-0 min-w-0">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={clsx('font-display font-bold num leading-tight mt-1', big ? 'text-[24px]' : 'text-[15px]', tone)}>{value}</div>
    </div>
  )
}

function MiniStage({ stage }: { stage: number }) {
  return (
    <div>
      <div className="flex gap-1">
        {STAGES.map((s, i) => (
          <span key={s} className={clsx('h-1.5 flex-1 rounded-full', i <= stage ? 'bg-brand' : 'bg-line')} />
        ))}
      </div>
      <div className="text-[12px] font-semibold mt-1">{STAGES[stage]}</div>
    </div>
  )
}

function Stepper({ stage }: { stage: number }) {
  return (
    <div className="flex items-center">
      {STAGES.map((s, i) => {
        const done = i < stage || (stage === STAGES.length - 1 && i === stage)
        const current = i === stage && !done
        return (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5 w-[64px]">
              <span
                className={clsx(
                  'w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold border-2',
                  done && 'bg-brand border-brand text-white',
                  current && 'bg-panel border-brand text-brand',
                  !done && !current && 'bg-panel border-line text-faint',
                )}
              >
                {done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              <span className={clsx('text-[11px] text-center leading-tight', done || current ? 'text-fg font-semibold' : 'text-faint')}>{s}</span>
            </div>
            {i < STAGES.length - 1 && <div className={clsx('h-0.5 flex-1 -mt-5 rounded-full', i < stage ? 'bg-brand' : 'bg-line')} />}
          </div>
        )
      })}
    </div>
  )
}
