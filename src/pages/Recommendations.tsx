// What to fix first (AI advisor), control-room style: four numbers, a "start
// here" lead card, the fix pipeline, a priority matrix, ranked fix cards and a
// detail drawer with the proof chart. All content comes from sim/insights and
// sim/tracking; only presentation lives here.
import clsx from 'clsx'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  Gauge,
  FileCheck2,
  ListChecks,
  MapPin,
  MessageSquareQuote,
  Package,
  ShieldAlert,
  Timer,
  User,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Evidence } from '../components/charts/Evidence'
import { SectionTitle, useCountUp, useMounted } from '../components/ui/kit'
import { fmt } from '../lib/format'
import { INSIGHTS, insightById, type Insight, type Kind } from '../sim/insights'
import { READINESS, READY_COUNT, ruleForInsight, type Ready } from '../sim/iso'
import { STAGES, TRACK } from '../sim/tracking'

type Tab = 'all' | 'downtime' | 'problem'

const KIND: Partial<Record<Kind, { label: string; short: string; icon: LucideIcon; cls: string; rgb: string }>> = {
  downtime: { label: 'Stopping production', short: 'Downtime', icon: Timer, cls: 'bg-alarm-bg text-alarm', rgb: 'rgb(var(--alarm))' },
  problem: { label: 'Machine problem caught early', short: 'Machine problem', icon: ShieldAlert, cls: 'bg-warn-bg text-warn', rgb: 'rgb(var(--warn))' },
}
const kindOf = (i: Insight) => KIND[i.kind] ?? KIND.problem!

/** Two-word names for the small chips (pipeline, priority) */
const TAG: Record<string, string> = {
  'bearing-overrun': 'Bearing changes',
  'no-reason': 'Missing reasons',
  'card-trips': 'Card trips',
  'ring-34': 'Ring Frame 34',
  condenser: 'Condenser motor',
  'lt2-harmonics': 'LT#2 capacitors',
}
const tagOf = (i: Insight) => TAG[i.id] ?? i.where.split(' · ')[0]

/** Downtime first (most yarn first), then machine problems */
const RANKED = [...INSIGHTS].sort((a, b) => Number(b.kind === 'downtime') - Number(a.kind === 'downtime') || (b.kgMonth ?? 0) - (a.kgMonth ?? 0))
const MAX_KG = Math.max(1, ...INSIGHTS.map((i) => i.kgMonth ?? 0))

/** Effort from the measure's cost note: none / low / medium / high */
const effortOf = (i: Insight) => {
  const c = TRACK[i.id].measure.cost.toLowerCase()
  return c.startsWith('none') ? 0 : c.startsWith('low') || c.startsWith('rs') ? 1 : c.startsWith('medium') ? 2 : 3
}
/** Due soon (days) or later (this month) */
const soonOf = (i: Insight) => !/month/i.test(TRACK[i.id].due)
const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

/* ------------------------------ page ------------------------------ */

export function Recommendations() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const openId = hash.replace('#', '')
  const open = openId ? insightById[openId] : undefined
  const [tab, setTab] = useState<Tab>('all')
  const show = (id: string | null) => navigate({ hash: id ?? '' }, { replace: true })

  const downtime = INSIGHTS.filter((i) => i.kind === 'downtime')
  const problems = INSIGHTS.filter((i) => i.kind === 'problem')
  const kg = downtime.reduce((a, i) => a + (i.kgMonth ?? 0), 0)
  const moving = INSIGHTS.filter((i) => TRACK[i.id].stage >= 1).length
  const lead = RANKED[0]
  const list = RANKED.filter((i) => tab === 'all' || i.kind === tab)

  return (
    <div>
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        <h1 className="font-display font-bold text-[22px] sm:text-[26px]">What to fix first</h1>
        <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-sunken text-[12px] font-semibold text-muted">
          <Bot size={13} /> AI advisor
        </span>
      </header>

      {/* Four numbers */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 sm:mt-6">
        <Tile icon={ListChecks} value={INSIGHTS.length} label="Fixes found" tone="fg" />
        <Tile icon={Package} value={kg} unit="kg" label="Yarn lost a month" tone="alarm" />
        <Tile icon={ShieldAlert} value={problems.length} label="Breakdowns caught early" tone="warn" />
        <Tile icon={Wrench} value={moving} label="Being worked on" tone="brand" />
      </section>

      {/* Start here + where every fix stands */}
      <section className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-4 mt-4">
        {lead && <LeadCard i={lead} onOpen={() => show(lead.id)} />}
        <Pipeline onOpen={show} />
      </section>

      {/* Priority matrix */}
      <section className="mt-8">
        <SectionTitle title="Priority" />
        <Matrix onOpen={show} />
      </section>

      {/* All fixes */}
      <section className="mt-8">
        <SectionTitle title="All fixes" count={list.length}>
          <div className="inline-flex p-0.5 rounded-lg bg-sunken text-[12px] font-semibold" role="tablist">
            {(
              [
                ['all', 'All'],
                ['downtime', 'Downtime'],
                ['problem', 'Machine'],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={clsx('focus-ring h-7 px-3 rounded-md transition-colors', tab === t ? 'bg-panel text-fg shadow-card' : 'text-muted hover:text-fg')}
              >
                {label}
              </button>
            ))}
          </div>
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((i, n) => (
            <FixCard key={i.id} i={i} n={RANKED.indexOf(i) + 1} delay={n * 60} active={openId === i.id} onOpen={() => show(i.id)} />
          ))}
        </div>
      </section>

      {/* ISO 50001: what Enervtek already produces for an energy audit */}
      <section className="mt-8">
        <SectionTitle title="ISO 50001 readiness" />
        <IsoReadiness />
      </section>

      {open && <Drawer key={open.id} i={open} onClose={() => show(null)} />}
    </div>
  )
}

/* ------------------------------ ISO 50001 readiness ------------------------------ */

const READY_META: Record<Ready, { label: string; cls: string; rgb: string }> = {
  ready: { label: 'Produced by Enervtek', cls: 'bg-mint text-brand', rgb: 'rgb(var(--brand))' },
  partly: { label: 'One step from the mill', cls: 'bg-warn-bg text-warn', rgb: 'rgb(var(--warn))' },
  din: { label: "Mill's team", cls: 'bg-sunken text-muted', rgb: 'rgb(var(--faint))' },
}

function IsoReadiness() {
  const on = useMounted()
  const { ready, partly, din, total } = READY_COUNT
  const v = useCountUp(ready)
  const seg = (n: number) => (on ? `${(n / total) * 100}%` : '0%')

  return (
    <div className="rise rounded-2xl border border-line bg-panel grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] overflow-hidden">
      {/* Summary */}
      <div className="p-5 sm:p-6 border-b lg:border-b-0 lg:border-r border-line flex flex-col gap-4">
        <span className="w-9 h-9 rounded-lg grid place-items-center bg-mint text-brand">
          <FileCheck2 size={18} />
        </span>
        <div>
          <div className="num font-display font-bold text-[34px] leading-none tracking-tight">
            {fmt(v)}
            <span className="text-[15px] font-semibold text-muted ml-1">of {total}</span>
          </div>
          <div className="text-[13px] text-muted mt-1.5">ISO 50001 items produced automatically from the meters</div>
        </div>
        <div>
          <div className="h-2.5 rounded-full bg-sunken overflow-hidden flex">
            {(['ready', 'partly', 'din'] as Ready[]).map((k) => (
              <div key={k} className="h-full transition-[width] duration-1000" style={{ width: seg(READY_COUNT[k]), background: READY_META[k].rgb }} />
            ))}
          </div>
          <div className="mt-2.5 space-y-1 text-[12px]">
            {(
              [
                ['ready', ready],
                ['partly', partly],
                ['din', din],
              ] as [Ready, number][]
            ).map(([k, n]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: READY_META[k].rgb }} />
                <span className="text-muted flex-1">{READY_META[k].label}</span>
                <b className="num">{n}</b>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[12px] leading-snug text-muted mt-auto">
          Enervtek does not certify the mill. It keeps the measured records an ISO 50001 auditor asks for; the policy, the energy in-charge, the internal audit and the management review stay with the mill.
        </p>
      </div>

      {/* Clause by clause */}
      <ul className="divide-y divide-line">
        {READINESS.map((r) => (
          <li key={r.clause} className="px-4 sm:px-5 py-2.5 flex items-center gap-3 min-w-0">
            <span className="num shrink-0 w-14 text-[11px] font-semibold text-faint">§ {r.clause}</span>
            <span className="flex-1 min-w-0 leading-tight">
              <span className="block text-[13px] font-semibold truncate">{r.item}</span>
              <span className="block text-[11.5px] text-muted truncate" title={r.how}>
                {r.how}
              </span>
            </span>
            <span className={clsx('shrink-0 h-6 px-2 rounded-full text-[11px] font-semibold inline-flex items-center gap-1', READY_META[r.status].cls)}>
              {r.status === 'ready' && <Check size={11} />}
              <span className="hidden sm:inline">{READY_META[r.status].label}</span>
              <span className="sm:hidden">{r.status === 'ready' ? 'Auto' : r.status === 'partly' ? 'Partly' : 'Mill'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------ pieces ------------------------------ */

const TONE = { alarm: 'text-alarm', warn: 'text-warn', brand: 'text-brand', fg: 'text-fg' } as const
const TONE_BG = { alarm: 'bg-alarm-bg', warn: 'bg-warn-bg', brand: 'bg-mint', fg: 'bg-sunken' } as const

function Tile({ icon: Icon, value, unit, label, tone }: { icon: LucideIcon; value: number; unit?: string; label: string; tone: keyof typeof TONE }) {
  const v = useCountUp(value)
  return (
    <div className="rise rounded-2xl border border-line bg-panel p-3.5 sm:p-4 flex flex-col justify-between gap-4 min-w-0">
      <span className={clsx('w-8 h-8 rounded-lg grid place-items-center', TONE_BG[tone], TONE[tone])}>
        <Icon size={16} />
      </span>
      <div>
        <div className={clsx('num font-display font-bold text-[28px] sm:text-[34px] leading-none tracking-tight', TONE[tone])}>
          {fmt(v)}
          {unit && <span className="text-[14px] sm:text-[15px] font-semibold text-muted ml-1">{unit}</span>}
        </div>
        <div className="text-[12px] text-muted mt-1.5 truncate">{label}</div>
      </div>
    </div>
  )
}

function KindChip({ i }: { i: Insight }) {
  const k = kindOf(i)
  return (
    <span className={clsx('inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-bold uppercase tracking-wide shrink-0', k.cls)}>
      <k.icon size={12} strokeWidth={2.5} /> {k.short}
    </span>
  )
}

/** Five-step progress bar with the current step named */
function StageBar({ stage, className }: { stage: number; className?: string }) {
  const on = useMounted()
  return (
    <div className={className}>
      <div className="flex gap-1">
        {STAGES.map((s, n) => (
          <span key={s} className="h-1.5 flex-1 rounded-full bg-sunken overflow-hidden">
            <span className="block h-full bg-brand rounded-full transition-[width] duration-700" style={{ width: on && n <= stage ? '100%' : 0, transitionDelay: `${n * 90}ms` }} />
          </span>
        ))}
      </div>
      <div className="text-[11.5px] font-semibold mt-1.5">{STAGES[stage]}</div>
    </div>
  )
}

function Owner({ name, due }: { name: string; due?: string }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="w-7 h-7 rounded-full bg-sunken text-[10.5px] font-bold text-muted grid place-items-center shrink-0" title={name}>
        {initials(name) || <User size={13} />}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[12px] font-semibold truncate">{name}</span>
        {due && <span className="block text-[11px] text-muted truncate">{due}</span>}
      </span>
    </span>
  )
}

/** Yarn lost per month as a bar, or the breakdown risk for machine problems */
function Impact({ i, big }: { i: Insight; big?: boolean }) {
  const on = useMounted()
  if (i.kgMonth)
    return (
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={clsx('num font-display font-bold leading-none text-alarm', big ? 'text-[40px]' : 'text-[22px]')}>{fmt(i.kgMonth)}</span>
          <span className="text-[12px] text-muted">kg / month</span>
        </div>
        <div className="h-1.5 rounded-full bg-sunken mt-2 overflow-hidden">
          <div className="h-full rounded-full bg-alarm transition-[width] duration-1000" style={{ width: on ? `${(i.kgMonth / MAX_KG) * 100}%` : 0 }} />
        </div>
      </div>
    )
  return (
    <div className="flex items-center gap-2 text-warn">
      <ShieldAlert size={big ? 22 : 16} />
      <span className={clsx('font-display font-bold', big ? 'text-[22px]' : 'text-[15px]')}>Breakdown risk</span>
    </div>
  )
}

/* ------------------------------ start here ------------------------------ */

function LeadCard({ i, onOpen }: { i: Insight; onOpen: () => void }) {
  const tr = TRACK[i.id]
  return (
    <article
      className="rise rounded-2xl border border-alarm/40 p-5 sm:p-6 flex flex-col gap-5 min-w-0"
      style={{ background: 'radial-gradient(120% 100% at 0% 0%, rgb(var(--alarm) / 0.13), rgb(var(--panel)) 60%)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">Start here</span>
        <KindChip i={i} />
      </div>
      <h2 className="font-display font-bold text-[20px] sm:text-[22px] leading-snug">{i.title}</h2>
      <Impact i={i} big />
      <div className="mt-auto flex items-center justify-between gap-3 pt-4 border-t border-line">
        <Owner name={tr.owner} due={tr.due} />
        <button onClick={onOpen} className="focus-ring inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-brand text-bg text-[13px] font-bold hover:brightness-110 shrink-0">
          Open <ArrowRight size={15} />
        </button>
      </div>
    </article>
  )
}

/* ------------------------------ pipeline ------------------------------ */

function Pipeline({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div className="rise rounded-2xl border border-line bg-panel p-4 sm:p-5 min-w-0" style={{ animationDelay: '80ms' }}>
      <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint mb-4">Where every fix stands</div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {STAGES.map((s, n) => {
          const here = RANKED.filter((i) => TRACK[i.id].stage === n)
          return (
            <div key={s} className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 mb-2">
                <span className={clsx('w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold shrink-0', here.length ? 'bg-brand text-bg' : 'bg-sunken text-faint')}>{n + 1}</span>
                <span className={clsx('text-[11px] sm:text-[12px] font-semibold truncate', here.length ? 'text-fg' : 'text-faint')}>{s}</span>
              </div>
              {/* Arrow-shaped lane */}
              <div className={clsx('relative flex-1 min-h-[132px] rounded-xl p-1.5 sm:p-2 flex flex-col gap-1.5', here.length ? 'bg-sunken/70' : 'bg-sunken/30 border border-dashed border-line')}>
                {here.map((i, k) => {
                  const K = kindOf(i)
                  return (
                    <button
                      key={i.id}
                      onClick={() => onOpen(i.id)}
                      title={i.title}
                      style={{ animationDelay: `${200 + k * 80}ms` }}
                      className="rise focus-ring flex items-center gap-1.5 rounded-lg bg-panel border border-line px-1.5 sm:px-2 py-1.5 text-left hover:border-brand/60 transition-colors min-w-0"
                    >
                      <span className={clsx('w-5 h-5 rounded-md grid place-items-center shrink-0', K.cls)}>
                        <K.icon size={11} />
                      </span>
                      <span className="text-[11px] font-semibold truncate hidden sm:block">{tagOf(i)}</span>
                    </button>
                  )
                })}
                {!here.length && <span className="m-auto text-[11px] text-faint">—</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------ priority matrix ------------------------------ */

// Urgency from the due date (days vs this month); effort from the cost note (none/low vs medium+)
const QUADS = [
  { soon: true, easy: true, title: 'Do now', sub: 'Urgent and easy' },
  { soon: true, easy: false, title: 'Plan the work', sub: 'Urgent, needs budget' },
  { soon: false, easy: true, title: 'Schedule', sub: 'Easy, this month' },
  { soon: false, easy: false, title: 'Project', sub: 'Needs a quote' },
] as const

function Matrix({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div className="rise rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <div className="grid grid-cols-[18px_minmax(0,1fr)] sm:grid-cols-[22px_minmax(0,1fr)] gap-2">
        {/* Y axis */}
        <div className="flex items-center justify-center">
          <span className="-rotate-90 whitespace-nowrap text-[10.5px] uppercase tracking-[0.12em] font-semibold text-faint">Urgency →</span>
        </div>
        <div>
          <div className="grid grid-cols-2 gap-2">
            {QUADS.map((q) => {
              const items = RANKED.filter((i) => soonOf(i) === q.soon && (effortOf(i) <= 1) === q.easy)
              const hero = q.soon && q.easy
              return (
                <div
                  key={q.title}
                  className={clsx('rounded-xl p-3 min-h-[120px] flex flex-col gap-2 min-w-0', hero ? 'border border-brand/40' : 'bg-sunken/50')}
                  style={hero ? { background: 'radial-gradient(120% 120% at 0% 0%, rgb(var(--brand) / 0.14), transparent 70%)' } : undefined}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={clsx('font-display font-semibold text-[14px]', hero ? 'text-brand' : 'text-fg')}>{q.title}</span>
                    <span className="text-[11px] text-faint truncate hidden sm:inline">{q.sub}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((i) => {
                      const K = kindOf(i)
                      return (
                        <button
                          key={i.id}
                          onClick={() => onOpen(i.id)}
                          title={i.title}
                          className="focus-ring inline-flex items-center gap-1.5 h-7 pl-1 pr-2.5 rounded-full bg-panel border border-line text-[12px] font-semibold hover:border-brand/60 max-w-full"
                        >
                          <span className={clsx('w-5 h-5 rounded-full grid place-items-center shrink-0', K.cls)}>
                            <K.icon size={11} />
                          </span>
                          <span className="truncate">{tagOf(i)}</span>
                        </button>
                      )
                    })}
                    {!items.length && <span className="text-[12px] text-faint">—</span>}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="text-right text-[10.5px] uppercase tracking-[0.12em] font-semibold text-faint mt-2">Effort →</div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ fix cards ------------------------------ */

function FixCard({ i, n, delay, active, onOpen }: { i: Insight; n: number; delay: number; active: boolean; onOpen: () => void }) {
  const tr = TRACK[i.id]
  return (
    <button
      onClick={onOpen}
      style={{ animationDelay: `${delay}ms` }}
      className={clsx(
        'rise focus-ring text-left rounded-2xl border border-line bg-panel p-4 sm:p-5 flex flex-col gap-4 min-w-0 hover:border-brand/50 transition-colors',
        active && 'ring-2 ring-brand ring-offset-2 ring-offset-bg',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="num w-7 h-7 rounded-full bg-sunken text-[12px] font-bold text-muted grid place-items-center shrink-0">{n}</span>
        <KindChip i={i} />
      </div>
      <div className="min-w-0">
        <div className="font-display font-semibold text-[15px] leading-snug line-clamp-2">{i.title}</div>
        <div className="text-[12px] text-muted truncate mt-1">{i.where}</div>
      </div>
      <Impact i={i} />
      <div className="mt-auto pt-4 border-t border-line grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-end">
        <Owner name={tr.owner} due={tr.due} />
        <StageBar stage={tr.stage} />
      </div>
    </button>
  )
}

/* ------------------------------ drawer ------------------------------ */

function Drawer({ i, onClose }: { i: Insight; onClose: () => void }) {
  const tr = TRACK[i.id]
  const rule = ruleForInsight(i.id)
  const [story, setStory] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] fade-in" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={i.title}
        className="absolute inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl sm:rounded-none sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(620px,100vw)] sm:max-h-none bg-panel border-t sm:border-t-0 sm:border-l border-line shadow-pop overflow-y-auto sheet-in sm:drawer-in"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-panel/95 backdrop-blur border-b border-line px-5 py-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <KindChip i={i} />
              <span className="text-[12px] text-muted truncate">{i.where}</span>
            </div>
            <h2 className="font-display font-bold text-[18px] sm:text-[19px] leading-snug mt-2">{i.title}</h2>
          </div>
          <button onClick={onClose} className="focus-ring w-9 h-9 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-sunken shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Key facts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="col-span-2 sm:col-span-1 rounded-xl border border-line p-3">
              <div className="text-[11px] text-muted">{i.kgMonth ? 'Yarn lost / month' : 'At stake'}</div>
              <div className={clsx('num font-display font-bold mt-1 leading-tight', i.kgMonth ? 'text-[22px] text-alarm' : 'text-[15px] text-warn')}>
                {i.kgMonth ? `${fmt(i.kgMonth)} kg` : 'Breakdown'}
              </div>
            </div>
            <Fact icon={Gauge} label="Cost to fix" value={tr.measure.cost} />
            <Fact icon={Check} label="Brings" value={tr.measure.payback} />
            <Fact icon={Timer} label="Due" value={tr.due} />
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">Progress</span>
              <Owner name={tr.owner} />
            </div>
            <Stepper stage={tr.stage} />
          </div>

          {/* What to do */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint mb-2.5">What to do</div>
            <ol className="space-y-2">
              {tr.steps.map((s, n) => (
                <li key={s} className="flex gap-3 items-start rounded-xl bg-sunken/60 px-3 py-2.5 text-[13.5px]">
                  <span className="w-6 h-6 rounded-full bg-brand text-bg grid place-items-center text-[12px] font-bold shrink-0">{n + 1}</span>
                  <span className="pt-0.5">{s.replace(' ✓', '')}</span>
                </li>
              ))}
            </ol>
            <div className="flex items-start gap-2 text-[12px] text-muted mt-3">
              <Check size={14} className="text-brand shrink-0 mt-0.5" />
              <span>
                Proof it worked: <b className="text-fg">{tr.measure.verify}</b>
              </span>
            </div>
            {rule && (
              <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] rounded-full bg-alarm-bg text-alarm font-semibold px-3 py-1">
                <AlertTriangle size={12} /> Rule {rule.id} broken {rule.breaches} of {rule.of} days
              </span>
            )}
          </div>

          {/* The proof */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">The proof</div>
            <div className="text-[12.5px] text-muted mt-0.5">{tr.evidence}</div>
            <div className="rounded-xl border border-line mt-2 px-1 pt-1">
              <Evidence id={i.id} height={210} themed />
            </div>
          </div>

          {/* What your team said */}
          <div className="rounded-xl border border-brand/30 px-4 py-3 flex gap-3" style={{ background: 'rgb(var(--brand) / 0.06)' }}>
            <MessageSquareQuote size={17} className="text-brand shrink-0 mt-0.5" />
            <div className="text-[13px] italic">“{i.heard}”</div>
          </div>

          {/* Full story and causes, on demand */}
          <div className="rounded-xl border border-line">
            <button onClick={() => setStory(!story)} aria-expanded={story} className="focus-ring w-full flex items-center gap-2 px-4 h-11 text-[13px] font-semibold">
              <BookOpen size={15} className="text-muted" />
              <span className="flex-1 text-left">The full story and possible causes</span>
              <ChevronDown size={16} className={clsx('text-muted transition-transform', story && 'rotate-180')} />
            </button>
            {story && (
              <div className="px-4 pb-4 space-y-3 text-[13px]">
                <p className="leading-relaxed">{i.plain}</p>
                <p className="text-muted">{i.impact}</p>
                <ul className="space-y-1.5">
                  {tr.causes.map((c) => (
                    <li key={c} className="flex gap-2">
                      <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-faint shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
                <div className="text-[12px] text-muted">
                  Measure library: <b className="text-fg">{tr.measure.family} · {tr.measure.name}</b>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {i.machineIds[0] && (
              <Link to={`/map?m=${i.machineIds[0]}`} className="focus-ring inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-sunken text-[13px] font-semibold hover:brightness-110">
                <MapPin size={15} /> Map
              </Link>
            )}
            {tr.link && (
              <Link to={tr.link.to} className="focus-ring inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-sunken text-[13px] font-semibold hover:brightness-110">
                {tr.link.label}
              </Link>
            )}
            <Link to={`/ask?about=${i.id}`} className="focus-ring inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-brand text-bg text-[13px] font-bold hover:brightness-110">
              <Bot size={15} /> Ask Enervtek
            </Link>
          </div>
        </div>
      </aside>
    </div>
  )
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line p-3 min-w-0">
      <div className="flex items-center gap-1 text-[11px] text-muted">
        <Icon size={11} /> {label}
      </div>
      <div className="font-semibold text-[13px] mt-1 leading-snug">{value}</div>
    </div>
  )
}

/** Found → Assigned → Inspected → Fixed → Confirmed, filling in on open */
function Stepper({ stage }: { stage: number }) {
  const on = useMounted()
  return (
    <div className="flex items-start">
      {STAGES.map((s, n) => {
        const done = n < stage || (stage === STAGES.length - 1 && n === stage)
        const current = n === stage && !done
        return (
          <div key={s} className="flex items-start flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5 w-[52px] sm:w-[64px]">
              <span
                className={clsx(
                  'w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold border-2 transition-colors duration-500',
                  done && on && 'bg-brand border-brand text-bg',
                  current && 'bg-panel border-brand text-brand ring-4 ring-brand/15',
                  (!done || !on) && !current && 'bg-panel border-line text-faint',
                )}
                style={{ transitionDelay: `${n * 120}ms` }}
              >
                {done && on ? <Check size={14} strokeWidth={3} /> : n + 1}
              </span>
              <span className={clsx('text-[10.5px] sm:text-[11px] text-center leading-tight', done || current ? 'text-fg font-semibold' : 'text-faint')}>{s}</span>
            </div>
            {n < STAGES.length - 1 && (
              <div className="h-0.5 flex-1 mt-3.5 rounded-full bg-line overflow-hidden">
                <div className="h-full bg-brand transition-[width] duration-500" style={{ width: on && n < stage ? '100%' : 0, transitionDelay: `${n * 120 + 60}ms` }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
