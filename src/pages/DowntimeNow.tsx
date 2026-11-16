// Downtime now, control-room style: live numbers with 12-hour trends, the most
// urgent stop as a lead card next to a mini mill map, the other stops as
// cards, and a timeline with shift bands. All values come from sim/downtime;
// only presentation lives here.
import clsx from 'clsx'
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  CircleCheck,
  CircleHelp,
  ClipboardEdit,
  Clock,
  Hourglass,
  MapPin,
  Moon,
  Package,
  Timer,
  Volume2,
  VolumeX,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ReasonForm } from '../components/downtime/parts'
import { Kpi, SectionTitle, Spark, reasonRgb, short, stopRgb, useCountUp, useMounted } from '../components/ui/kit'
import { hallById } from '../data/din'
import { HALL_BOXES, TILES, VIEW } from '../data/din/floorplan'
import { chime, isMuted, onMutedChange, setMuted } from '../lib/chime'
import { fmt } from '../lib/format'
import { CLEANING, isCleaning, pkParts } from '../lib/time'
import { pkMidnight } from '../sim/engine'
import { DT_MACHINES, GROUPS, GROUP_ORDER, LATE_GRACE_MIN, bufferOf, monthStops, sectionOf, stoppedNow, sum, todayStops, type DtGroup, type Stop } from '../sim/downtime'
import { useApp } from '../store/app'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const clock = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }).format(t)
const weekday = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', weekday: 'narrow' }).format(t)

/* Every state has its own icon, so it never depends on colour alone */
type State = 'missing' | 'late' | 'ok'
const stateOf = (s: Stop): State => (!s.reason ? 'missing' : s.overMin > 0 ? 'late' : 'ok')
const STATE: Record<State, { label: string; cls: string; icon: LucideIcon }> = {
  missing: { label: 'No reason', cls: 'bg-warn-bg text-warn', icon: CircleHelp },
  late: { label: 'Late', cls: 'bg-alarm-bg text-alarm', icon: Hourglass },
  ok: { label: 'On track', cls: 'bg-mint text-brand', icon: CircleCheck },
}
const RANK: Record<State, number> = { missing: 0, late: 1, ok: 2 }

/* ------------------------------ hooks ------------------------------ */

function useMuted() {
  const [m, setM] = useState(isMuted())
  useEffect(() => onMutedChange(setM), [])
  return m
}

/**
 * Stops that just ended: kept on screen for a moment with a "Back running"
 * flash and a toast. A stop replaced by a new one on the same machine
 * (a second dip) is not counted as back running.
 */
function useRecovered(live: Stop[]) {
  const prev = useRef(new Map<string, Stop>())
  const timers = useRef<number[]>([])
  const [recovered, setRecovered] = useState<Stop[]>([])
  const key = live.map((s) => s.id).join('|')

  useEffect(() => {
    const ids = new Set(live.map((s) => s.id))
    const machines = new Set(live.map((s) => s.machine.id))
    const gone = [...prev.current.values()].filter((s) => !ids.has(s.id) && !machines.has(s.machine.id))
    prev.current = new Map(live.map((s) => [s.id, s]))
    if (!gone.length) return
    chime('ok')
    setRecovered((r) => [...r, ...gone])
    timers.current.push(window.setTimeout(() => setRecovered((r) => r.filter((x) => !gone.includes(x))), 2800))
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return recovered
}

/* ------------------------------ 12-hour trends for the number tiles ------------------------------ */

const BUCKET = 30 * MIN

function trends(stops: Stop[], now: number) {
  const t0 = now - 12 * HOUR
  const pts: number[] = []
  for (let t = t0; t <= now; t += BUCKET) pts.push(t)
  const near = stops.filter((s) => s.end >= t0)
  const at = (t: number) => near.filter((s) => s.start <= t && (t < s.end || (s.ongoing && t <= s.end)))

  const stopped = pts.map((t) => at(t).length)
  const late = pts.map((t) => at(t).filter((s) => s.expectedMin != null && (t - s.start) / MIN - s.expectedMin > LATE_GRACE_MIN).length)
  const noReason = pts.map((t) => at(t).filter((s) => !s.reason).length)

  // Yarn lost, added up over the window (a stop only costs yarn once the stock after it runs out)
  let acc = 0
  const kg = pts.map((t, i) => {
    if (i === 0) return 0
    const b0 = pts[i - 1]
    for (const s of near) {
      if (s.lostMin <= 0) continue
      const lostFrom = s.start + (s.minutes - s.lostMin) * MIN
      const overlap = Math.min(s.end, t) - Math.max(lostFrom, b0)
      if (overlap > 0) acc += (s.kg / s.lostMin) * (overlap / MIN)
    }
    return acc
  })
  return { stopped, running: stopped.map((n) => DT_MACHINES.length - n), late, noReason, kg }
}

/* ------------------------------ page ------------------------------ */

export function DowntimeNow() {
  const now = useApp((s) => s.now)
  const entries = useApp((s) => s.dtEntries)
  const { hash } = useLocation()
  const navigate = useNavigate()
  const focus = hash.replace('#', '')
  const [editing, setEditing] = useState<Stop | null>(null)
  const [hot, setHot] = useState<string | null>(null)
  const muted = useMuted()

  const stops = useMemo(() => monthStops(now, entries), [now, entries])
  const today = todayStops(stops, now)
  const live = stoppedNow(stops).sort((a, b) => RANK[stateOf(a)] - RANK[stateOf(b)] || b.overMin - a.overMin || b.minutes - a.minutes)
  const recovered = useRecovered(live)
  const minute = Math.floor(now / MIN)
  const trend = useMemo(() => trends(stops, now), [minute, entries, live.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stops present when the page opened do not flash; new ones (a dip) do
  const initial = useRef<Set<string> | null>(null)
  if (!initial.current) initial.current = new Set(live.map((s) => s.id))
  const fresh = (s: Stop) => !initial.current!.has(s.id)

  const late = live.filter((s) => s.overMin > 0).length
  const missing = live.filter((s) => !s.reason).length
  const kgToday = sum(today, (s) => s.kg)
  const cleaning = isCleaning(pkParts(new Date(now)).hour)
  const [lead, ...rest] = live

  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => document.getElementById(`stop-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    return () => clearTimeout(t)
  }, [focus])

  return (
    <div>
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <h1 className="font-display font-bold text-[22px] sm:text-[26px]">Downtime now</h1>
          <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-sunken text-[12px] font-semibold text-muted">
            <span className="w-2 h-2 rounded-full bg-brand" /> Live
          </span>
          {cleaning && (
            <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-warn-bg text-warn text-[12px] font-semibold">
              <Moon size={13} /> Cleaning {CLEANING.span}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted(!muted)}
            title={muted ? 'Sound off' : 'Sound on'}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            className="focus-ring w-9 h-9 grid place-items-center rounded-lg border border-line text-muted hover:text-fg hover:bg-sunken"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <Link to="/downtime-month" className="focus-ring inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-line text-[13px] font-semibold text-muted hover:text-fg hover:bg-sunken">
            <CalendarRange size={15} /> <span className="hidden sm:inline">This month</span>
            <span className="sm:hidden">Month</span>
          </Link>
        </div>
      </header>

      {/* Live numbers, each with its last 12 hours */}
      <section className="grid grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] gap-3 mt-5 sm:mt-6">
        <Fleet running={DT_MACHINES.length - live.length} total={DT_MACHINES.length} cleaning={cleaning} trend={trend.running} />
        <Kpi icon={Timer} value={live.length} label="Stopped" tone={live.length ? 'alarm' : 'brand'} trend={trend.stopped} />
        <Kpi icon={Clock} value={late} label="Running late" tone={late ? 'alarm' : 'brand'} trend={trend.late} />
        <Kpi icon={ClipboardEdit} value={missing} label="No reason" tone={missing ? 'warn' : 'brand'} trend={trend.noReason} />
        <Kpi icon={Package} value={kgToday} unit="kg" label="Yarn lost today" tone="fg" trend={trend.kg} />
      </section>

      {/* Most urgent stop + where everything is */}
      <section className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 mt-5 sm:mt-6">
        {lead ? (
          <LeadCard
            key={lead.id}
            s={lead}
            stops={stops}
            now={now}
            fresh={fresh(lead)}
            focused={focus === lead.machine.id}
            hot={hot === lead.machine.id}
            onHot={setHot}
            onEnter={() => setEditing(lead)}
          />
        ) : (
          <div className="rounded-2xl border border-line bg-panel grid place-items-center min-h-[240px] sm:min-h-[300px]">
            <div className="flex flex-col items-center gap-3 text-brand font-display font-semibold text-[20px]">
              <CheckCircle2 size={40} /> All machines running
            </div>
          </div>
        )}
        <MiniMap live={live} hot={hot} onHot={setHot} onPick={(id) => navigate({ hash: id }, { replace: true })} />
      </section>

      {/* Everything else that is stopped */}
      {(rest.length > 0 || recovered.length > 0) && (
        <section className="mt-8">
          <SectionTitle title="Also stopped" count={rest.length} />
          <div className="grid gap-3 sm:gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]">
            {rest.map((s, i) => (
              <StopCard
                key={s.id}
                s={s}
                delay={fresh(s) ? 0 : i * 60}
                fresh={fresh(s)}
                focused={focus === s.machine.id}
                hot={hot === s.machine.id}
                onHot={setHot}
                onEnter={() => setEditing(s)}
              />
            ))}
            {recovered.map((s) => (
              <StopCard key={`back-${s.id}`} s={s} delay={0} recovered />
            ))}
          </div>
        </section>
      )}

      <Timeline stops={stops} now={now} onEnter={setEditing} />

      {/* "Back running" toasts */}
      {recovered.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-none" role="status">
          {recovered.map((s) => (
            <div key={s.id} className="toast-in inline-flex items-center gap-2.5 h-11 px-4 rounded-full border border-brand/50 bg-panel shadow-pop text-[14px] font-semibold">
              <CheckCircle2 size={18} className="text-brand" />
              {s.machine.name} <span className="text-brand">back running</span>
            </div>
          ))}
        </div>
      )}

      {editing && <ReasonForm stop={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/* ------------------------------ small pieces ------------------------------ */

/** Share of production machines running, as a ring */
function Fleet({ running, total, cleaning, trend }: { running: number; total: number; cleaning: boolean; trend: number[] }) {
  const on = useMounted()
  const R = 38
  const C = 2 * Math.PI * R
  const frac = cleaning ? 0 : running / total
  const v = useCountUp(cleaning ? 0 : running)
  return (
    <div className="col-span-2 lg:col-span-1 rounded-2xl border border-line bg-panel p-3.5 sm:p-4 flex items-center gap-4 min-w-0">
      <div className="relative w-[84px] h-[84px] sm:w-[96px] sm:h-[96px] shrink-0">
        <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
          <circle cx="48" cy="48" r={R} fill="none" stroke="rgb(var(--alarm) / 0.35)" strokeWidth="9" />
          <circle
            cx="48"
            cy="48"
            r={R}
            fill="none"
            stroke="rgb(var(--brand))"
            strokeWidth="9"
            strokeDasharray={C}
            strokeDashoffset={on ? C * (1 - frac) : C}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="num font-display font-bold text-[19px] sm:text-[21px] leading-none">{cleaning ? '—' : `${Math.round(frac * 100)}%`}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="num font-display font-bold text-[22px] leading-none">
          {cleaning ? 'Cleaning' : fmt(v)}
          {!cleaning && <span className="text-[14px] text-muted font-semibold"> / {total}</span>}
        </div>
        <div className="text-[12px] text-muted mt-1.5">Machines running</div>
        <Spark data={trend} color="rgb(var(--brand))" className="w-full h-7 mt-2" />
      </div>
    </div>
  )
}

function StateBadge({ st, big }: { st: State; big?: boolean }) {
  const S = STATE[st]
  return (
    <span className={clsx('shrink-0 inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide', S.cls, big ? 'h-7 px-3 text-[12px]' : 'h-6 px-2.5 text-[11px]')}>
      <S.icon size={big ? 13 : 12} strokeWidth={2.5} />
      {S.label}
    </span>
  )
}

/** Time stopped against the normal time for the job */
function StopRing({ s, big, className }: { s: Stop; big?: boolean; className?: string }) {
  const on = useMounted()
  const R = 48
  const C = 2 * Math.PI * R
  const exp = s.expectedMin
  const within = exp ? Math.min(1, s.minutes / exp) : 0
  const over = exp && s.overMin > 0 ? Math.min(1, (s.minutes - exp) / exp) : 0
  const arc = (frac: number, color: string) => (
    <circle
      cx="60"
      cy="60"
      r={R}
      fill="none"
      stroke={color}
      strokeWidth={9}
      strokeLinecap="round"
      strokeDasharray={C}
      strokeDashoffset={on ? C * (1 - frac) : C}
      style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)' }}
    />
  )

  return (
    <div className="flex flex-col items-center shrink-0">
    <div className={clsx('relative shrink-0', className ?? 'w-[104px] h-[104px] sm:w-[112px] sm:h-[112px]')}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="rgb(var(--sunken))" strokeWidth="9" />
        {exp == null ? (
          <circle cx="60" cy="60" r={R} fill="none" stroke="rgb(var(--warn))" strokeWidth="9" strokeDasharray="3 9" strokeLinecap="round" />
        ) : (
          <>
            {arc(within, over ? 'rgb(var(--brand) / 0.35)' : 'rgb(var(--brand))')}
            {over > 0 && arc(over, 'rgb(var(--alarm))')}
          </>
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className={clsx('num font-display font-bold leading-none tracking-tight', big ? 'text-[24px] sm:text-[30px]' : s.minutes >= 60 ? 'text-[16px] sm:text-[17px]' : 'text-[19px] sm:text-[20px]')}>
            {short(s.minutes)}
          </div>
          <div className={clsx('text-muted mt-1', big ? 'text-[12px] sm:text-[13px]' : 'text-[11px]')}>stopped</div>
        </div>
      </div>
    </div>
    {/* What the ring is measured against, in plain words */}
    <div className={clsx('mt-1.5 text-center whitespace-nowrap', big ? 'text-[12.5px]' : 'text-[11px]')}>
      {exp != null ? (
        <span className="text-muted">
          Normal fix <b className="num text-fg">{short(exp)}</b>
        </span>
      ) : (
        <span className="text-warn font-semibold">No reason yet</span>
      )}
    </div>
    </div>
  )
}

/** The headline next to the ring: how late, how long to go, or ask for the reason */
function Verdict({ s, onEnter, big }: { s: Stop; onEnter?: () => void; big?: boolean }) {
  const st = stateOf(s)
  const exp = s.expectedMin
  const numCls = clsx('num font-display font-bold leading-none tracking-tight', big ? 'text-[32px] sm:text-[44px]' : 'text-[24px] sm:text-[26px]')
  if (st === 'missing')
    return onEnter ? (
      <button
        onClick={onEnter}
        className={clsx(
          'focus-ring inline-flex items-center gap-2 rounded-lg bg-warn text-bg font-bold hover:brightness-110 whitespace-nowrap',
          big ? 'h-10 sm:h-11 px-4 sm:px-5 text-[14px] sm:text-[15px]' : 'h-9 px-3.5 text-[13px]',
        )}
      >
        <ClipboardEdit size={big ? 17 : 15} /> Add reason
      </button>
    ) : null
  const word = clsx('font-semibold ml-1', big ? 'text-[16px] sm:text-[20px]' : 'text-[13px]')
  if (st === 'late')
    return (
      <>
        <div className={clsx(numCls, 'text-alarm')}>
          {short(s.overMin)}
          <span className={word}>late</span>
        </div>
        <div className="text-[12px] text-muted mt-1.5">
          Taking <b className="num text-fg">{fmt(s.minutes / exp!, 1)}×</b> the normal fix
        </div>
      </>
    )
  if (exp != null && s.minutes >= exp)
    return (
      <>
        <div className={clsx('font-display font-bold leading-tight text-brand', big ? 'text-[26px] sm:text-[30px]' : 'text-[20px]')}>Any minute</div>
        <div className="text-[12px] text-muted mt-1.5">should be fixed now</div>
      </>
    )
  return (
    <>
      <div className={clsx(numCls, 'text-brand')}>
        {short((exp ?? 0) - s.minutes)}
        <span className={word}>left</span>
      </div>
      <div className="text-[12px] text-muted mt-1.5">until it should be fixed</div>
    </>
  )
}

function ReasonTag({ s }: { s: Stop }) {
  if (!s.reason) return null
  return (
    <div className="flex items-center gap-1.5 text-[13px] font-semibold min-w-0">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: reasonRgb(s.reason.group) }} />
      <span className="truncate">{s.reason.label}</span>
    </div>
  )
}

/** Stock left before the next machines run dry, or the yarn already lost */
function Effect({ s }: { s: Stop }) {
  const buffer = bufferOf(s.machine)
  const left = buffer - s.minutes
  if (s.lostMin <= 0)
    return (
      <div className="flex-1 min-w-0" title="Material waiting for the next machines">
        <div className="flex items-center justify-between text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Package size={13} /> Stock
          </span>
          <span className="num font-semibold text-brand">{short(left)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-sunken mt-1.5 overflow-hidden">
          <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(0, (left / buffer) * 100)}%` }} />
        </div>
      </div>
    )
  return (
    <div className="flex items-baseline gap-1.5">
      <AlertTriangle size={14} className="text-alarm self-center" />
      <span className="num font-display font-bold text-[20px] text-alarm leading-none">{fmt(s.kg)}</span>
      <span className="text-[12px] text-muted">kg lost</span>
    </div>
  )
}

const where = (s: Stop) => `${sectionOf(s.machine)} · ${hallById[s.machine.hallId].name}`

/* ------------------------------ lead card ------------------------------ */

const LEAD_BG: Record<State, string> = {
  late: 'radial-gradient(120% 90% at 0% 0%, rgb(var(--alarm) / 0.14), rgb(var(--panel)) 60%)',
  missing: 'radial-gradient(120% 90% at 0% 0%, rgb(var(--warn) / 0.12), rgb(var(--panel)) 60%)',
  ok: 'radial-gradient(120% 90% at 0% 0%, rgb(var(--brand) / 0.10), rgb(var(--panel)) 60%)',
}

function LeadCard({ s, stops, now, fresh, focused, hot, onHot, onEnter }: {
  s: Stop
  stops: Stop[]
  now: number
  fresh: boolean
  focused: boolean
  hot: boolean
  onHot: (id: string | null) => void
  onEnter: () => void
}) {
  const st = stateOf(s)
  return (
    <article
      id={`stop-${s.machine.id}`}
      onMouseEnter={() => onHot(s.machine.id)}
      onMouseLeave={() => onHot(null)}
      className={clsx(
        'rise relative rounded-2xl border p-4 sm:p-6 flex flex-col gap-5 scroll-mt-6 overflow-hidden transition-shadow min-w-0',
        st === 'late' ? 'border-alarm/50 shadow-[0_0_28px_-10px_rgb(var(--alarm)/0.55)]' : st === 'missing' ? 'border-warn/50' : 'border-line',
        fresh && 'arrive',
        (focused || hot) && 'ring-2 ring-brand ring-offset-2 ring-offset-bg',
      )}
      style={{ background: LEAD_BG[st] }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">Most urgent</div>
          <div className="font-display font-bold text-[22px] sm:text-[26px] leading-tight mt-1 truncate">{s.machine.name}</div>
          <div className="text-[13px] text-muted truncate">{where(s)}</div>
        </div>
        <StateBadge st={st} big />
      </div>

      <div className="flex items-center gap-5 sm:gap-7">
        <StopRing s={s} big className="w-[124px] h-[124px] sm:w-[168px] sm:h-[168px]" />
        <div className="min-w-0 space-y-3 sm:space-y-4">
          <div>
            <Verdict s={s} onEnter={onEnter} big />
          </div>
          <ReasonTag s={s} />
          {(s.part || s.by) && (
            <div className="hidden sm:flex items-center gap-1.5 text-[12px] text-muted min-w-0">
              <Wrench size={12} className="shrink-0" />
              <span className="truncate">{[s.part, s.by].filter(Boolean).join(' · ')}</span>
            </div>
          )}
        </div>
      </div>

      <Week stops={stops} machineId={s.machine.id} now={now} />

      <div className="mt-auto pt-4 border-t border-line flex items-center justify-between gap-4">
        <Effect s={s} />
        <Link to={`/map?m=${s.machine.id}`} className="focus-ring inline-flex items-center gap-1.5 h-9 px-3 shrink-0 rounded-lg bg-sunken text-[13px] font-semibold text-muted hover:text-fg">
          <MapPin size={15} /> Map
        </Link>
      </div>
    </article>
  )
}

/** This machine's stops over the last 7 days: one stacked bar per day */
function Week({ stops, machineId, now }: { stops: Stop[]; machineId: string; now: number }) {
  const mid = pkMidnight(now)
  const days = Array.from({ length: 7 }, (_, i) => mid - (6 - i) * DAY)
  const mine = stops.filter((s) => s.machine.id === machineId && s.start >= days[0])
  const cols = days.map((d) => {
    const list = mine.filter((s) => s.start >= d && s.start < d + DAY)
    const byG = new Map<DtGroup | 'none', number>()
    for (const s of list) {
      const g = s.reason?.group ?? 'none'
      byG.set(g, (byG.get(g) ?? 0) + s.minutes)
    }
    return { d, total: sum(list, (s) => s.minutes), parts: [...byG.entries()] }
  })
  const max = Math.max(60, ...cols.map((c) => c.total))

  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-faint uppercase tracking-[0.12em] text-[11px] font-semibold">Last 7 days</span>
        <span className="text-muted num">
          <b className="text-fg">{mine.length}</b> stops · <b className="text-fg">{short(sum(mine, (s) => s.minutes))}</b>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mt-2.5">
        {cols.map((c, i) => (
          <div key={c.d} className="flex flex-col items-center gap-1.5">
            <div className="w-full h-12 rounded-md bg-sunken/60 flex flex-col-reverse overflow-hidden" title={`${short(c.total)} stopped`}>
              {c.parts.map(([g, m]) => (
                <span key={g} style={{ height: `${(m / max) * 100}%`, background: reasonRgb(g) }} className="w-full shrink-0" />
              ))}
            </div>
            <span className={clsx('text-[11px] num', i === 6 ? 'text-fg font-bold' : 'text-faint')}>{weekday(c.d)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------ small cards ------------------------------ */

function StopCard({ s, delay, fresh, focused, hot, recovered, onHot, onEnter }: {
  s: Stop
  delay: number
  fresh?: boolean
  focused?: boolean
  hot?: boolean
  recovered?: boolean
  onHot?: (id: string | null) => void
  onEnter?: () => void
}) {
  const st = stateOf(s)
  const detail = [s.part, s.by].filter(Boolean).join(' · ')

  return (
    <article
      id={recovered ? undefined : `stop-${s.machine.id}`}
      onMouseEnter={() => onHot?.(s.machine.id)}
      onMouseLeave={() => onHot?.(null)}
      style={{ animationDelay: `${delay}ms` }}
      className={clsx(
        'relative rounded-2xl border bg-panel p-4 sm:p-5 flex flex-col gap-4 scroll-mt-6 min-w-0',
        recovered ? 'leave border-brand' : 'rise',
        !recovered && (st === 'late' ? 'border-alarm/50 shadow-[0_0_28px_-10px_rgb(var(--alarm)/0.55)]' : st === 'missing' ? 'border-warn/40' : 'border-line'),
        fresh && 'arrive',
        (focused || hot) && 'ring-2 ring-brand ring-offset-2 ring-offset-bg',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display font-semibold text-[16px] sm:text-[17px] leading-tight truncate">{s.machine.name}</div>
          <div className="text-[12px] text-muted truncate mt-0.5">{where(s)}</div>
        </div>
        <StateBadge st={st} />
      </div>

      <div className="flex items-center gap-4 sm:gap-5">
        <StopRing s={s} />
        <div className="min-w-0 space-y-3">
          <div>
            <Verdict s={s} onEnter={onEnter} />
          </div>
          <ReasonTag s={s} />
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-line flex items-center justify-between gap-3">
        <Effect s={s} />
        <div className="flex gap-1.5 shrink-0">
          {detail && (
            <span className="relative">
              <span tabIndex={0} className="peer focus-ring w-9 h-9 grid place-items-center rounded-lg bg-sunken text-muted hover:text-fg cursor-help" aria-label={detail}>
                <Wrench size={15} />
              </span>
              <span className="pointer-events-none absolute bottom-full right-0 mb-2 w-max max-w-[min(240px,70vw)] rounded-lg border border-line bg-sunken px-3 py-2 text-[12px] shadow-pop opacity-0 translate-y-1 transition peer-hover:opacity-100 peer-hover:translate-y-0 peer-focus:opacity-100 peer-focus:translate-y-0 z-10">
                {detail}
              </span>
            </span>
          )}
          <Link to={`/map?m=${s.machine.id}`} title="Show on the mill map" className="focus-ring w-9 h-9 grid place-items-center rounded-lg bg-sunken text-muted hover:text-fg">
            <MapPin size={15} />
          </Link>
        </div>
      </div>

      {recovered && (
        <div className="absolute inset-0 rounded-2xl grid place-items-center bg-panel/80 backdrop-blur-[2px]">
          <div className="flex items-center gap-2.5 text-brand font-display font-bold text-[20px]">
            <CheckCircle2 size={26} /> Back running
          </div>
        </div>
      )}
    </article>
  )
}

/* ------------------------------ mini mill map ------------------------------ */

const tileOf = Object.fromEntries(TILES.map((t) => [t.id, t]))

function MiniMap({ live, hot, onHot, onPick }: { live: Stop[]; hot: string | null; onHot: (id: string | null) => void; onPick: (machineId: string) => void }) {
  const byMachine = new Set(live.map((s) => s.machine.id))
  const color = (st: State) => (st === 'missing' ? 'rgb(var(--warn))' : 'rgb(var(--alarm))')
  const hotStop = live.find((s) => s.machine.id === hot)
  const hotTile = hotStop && tileOf[hotStop.machine.id]

  return (
    <div className="rounded-2xl border border-line bg-panel p-3 sm:p-4 flex flex-col min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">Where</span>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: 'rgb(var(--brand) / 0.3)' }} /> Running
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-alarm" /> Stopped
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rotate-45 bg-warn" /> No reason
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="w-full flex-1 mt-3 min-h-[190px] sm:min-h-[240px]" preserveAspectRatio="xMidYMid meet" onMouseLeave={() => onHot(null)}>
        {HALL_BOXES.map((h) => (
          <g key={h.id}>
            <rect x={h.x} y={h.y} width={h.w} height={h.h} rx={18} fill="rgb(var(--sunken) / 0.45)" stroke="rgb(var(--line))" strokeWidth={2} />
            <text x={h.x + 18} y={h.y + 34} fill="rgb(var(--faint))" fontSize={22} fontWeight={600}>
              {h.title}
            </text>
          </g>
        ))}

        {TILES.map((t) => {
          if (byMachine.has(t.id)) return null
          return t.shape === 'circle' ? (
            <circle key={t.id} cx={t.x + t.w / 2} cy={t.y + t.h / 2} r={t.w / 2} fill="rgb(var(--brand) / 0.16)" />
          ) : (
            <rect key={t.id} x={t.x} y={t.y} width={t.w} height={t.h} rx={4} fill="rgb(var(--brand) / 0.16)" />
          )
        })}

        {/* Stopped machines on top: ping when they need attention; "no reason" drawn as a diamond */}
        {live.map((s) => {
          const t = tileOf[s.machine.id]
          if (!t) return null
          const st = stateOf(s)
          const cx = t.x + t.w / 2
          const cy = t.y + t.h / 2
          const isHot = hot === s.machine.id
          const stroke = isHot ? 'rgb(var(--fg))' : 'rgb(var(--bg))'
          return (
            <g key={s.id} className="cursor-pointer" onClick={() => onPick(s.machine.id)} onMouseEnter={() => onHot(s.machine.id)}>
              <title>{`${s.machine.name} · ${short(s.minutes)}`}</title>
              <circle cx={cx} cy={cy} r={Math.min(Math.max(t.w, t.h), 34) * 0.9} fill={color(st)} className={st === 'ok' ? undefined : 'map-ping'} opacity={st === 'ok' ? 0 : undefined} />
              {st === 'missing' ? (
                <rect x={cx - 13} y={cy - 13} width={26} height={26} rx={3} transform={`rotate(45 ${cx} ${cy})`} fill={color(st)} stroke={stroke} strokeWidth={isHot ? 4 : 2} />
              ) : t.shape === 'circle' ? (
                <circle cx={cx} cy={cy} r={t.w / 2 + 2} fill={color(st)} stroke={stroke} strokeWidth={isHot ? 4 : 2} />
              ) : (
                <rect x={t.x - 2} y={t.y - 2} width={t.w + 4} height={t.h + 4} rx={5} fill={color(st)} stroke={stroke} strokeWidth={isHot ? 4 : 2} />
              )}
            </g>
          )
        })}

        {/* Name tag for the machine being hovered (on the map or on its card) */}
        {hotStop && hotTile && (
          <g pointerEvents="none">
            {(() => {
              const label = hotStop.machine.name
              const w = label.length * 13 + 28
              const cx = hotTile.x + hotTile.w / 2
              const x = Math.min(Math.max(cx - w / 2, 8), VIEW.w - w - 8)
              const y = Math.max(hotTile.y - 58, 8)
              return (
                <>
                  <rect x={x} y={y} width={w} height={42} rx={10} fill="rgb(var(--fg))" />
                  <text x={x + w / 2} y={y + 28} textAnchor="middle" fontSize={22} fontWeight={700} fill="rgb(var(--bg))">
                    {label}
                  </text>
                </>
              )
            })()}
          </g>
        )}
      </svg>
    </div>
  )
}

/* ------------------------------ timeline ------------------------------ */

type Range = '8h' | 'day'

/** Shift A/B/C and night cleaning, as time blocks */
function shiftBlocks(t0: number, t1: number, now: number) {
  const mid = pkMidnight(now)
  const out: { id: string; from: number; to: number; cleaning?: boolean }[] = []
  for (const d of [mid - DAY, mid, mid + DAY]) {
    out.push({ id: 'A', from: d + 6 * HOUR, to: d + 14 * HOUR })
    out.push({ id: 'B', from: d + 14 * HOUR, to: d + 22 * HOUR })
    out.push({ id: 'C', from: d + 22 * HOUR, to: d + 30 * HOUR })
    out.push({ id: 'clean', from: d + CLEANING.start * HOUR, to: d + CLEANING.end * HOUR, cleaning: true })
  }
  return out.filter((b) => b.to > t0 && b.from < t1).map((b) => ({ ...b, from: Math.max(b.from, t0), to: Math.min(b.to, t1) }))
}

function Timeline({ stops, now, onEnter }: { stops: Stop[]; now: number; onEnter: (s: Stop) => void }) {
  const [range, setRange] = useState<Range>('8h')
  const [tip, setTip] = useState<{ s: Stop; x: number; y: number } | null>(null)
  const tipTimer = useRef<number>()
  const mid = pkMidnight(now)

  const t0 = range === '8h' ? now - 8 * HOUR : mid
  const t1 = range === '8h' ? now + 30 * MIN : mid + Math.min(24, Math.ceil((now - mid) / HOUR) + 1) * HOUR
  const span = t1 - t0
  const x = (t: number) => ((Math.min(Math.max(t, t0), t1) - t0) / span) * 100
  const step = range === '8h' ? HOUR : 3 * HOUR
  const ticks: number[] = []
  for (let t = mid + Math.ceil((t0 - mid) / step) * step; t <= t1; t += step) ticks.push(t)
  const blocks = shiftBlocks(t0, t1, now)

  const shown = stops.filter((s) => s.end > t0 && s.start < t1)
  const lanes = useMemo(() => {
    const map = new Map<string, Stop[]>()
    for (const s of [...shown].sort((a, b) => a.start - b.start)) map.set(s.machine.id, [...(map.get(s.machine.id) ?? []), s])
    // Machines still down first, then by first stop
    return [...map.values()].sort((a, b) => Number(b.some((s) => s.ongoing)) - Number(a.some((s) => s.ongoing)) || a[0].start - b[0].start)
  }, [shown.map((s) => s.id + s.reason?.id).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Touch has no hover: a tap shows the details for a few seconds */
  const tapTip = (s: Stop, e: MouseEvent) => {
    setTip({ s, x: e.clientX, y: e.clientY })
    window.clearTimeout(tipTimer.current)
    tipTimer.current = window.setTimeout(() => setTip(null), 2500)
  }
  useEffect(() => () => window.clearTimeout(tipTimer.current), [])

  return (
    <section className="mt-10">
      <SectionTitle title="Timeline" count={shown.length}>
        <div className="inline-flex p-0.5 rounded-lg bg-sunken text-[12px] font-semibold">
          {(['8h', 'day'] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={clsx('focus-ring h-7 px-3 rounded-md transition-colors', range === r ? 'bg-panel text-fg shadow-card' : 'text-muted hover:text-fg')}>
              {r === '8h' ? 'Last 8 h' : 'Today'}
            </button>
          ))}
        </div>
      </SectionTitle>

      {/* Phones: a plain list of stops */}
      <StopList stops={shown} onEnter={onEnter} />

      {/* Tablet and desktop: the chart. --lw is the width of the machine-name column */}
      <div className="hidden sm:block rounded-2xl border border-line bg-panel p-5 [--lw:150px]">
        {/* Shift labels and hour axis */}
        <div className="relative h-11" style={{ marginLeft: 'var(--lw)' }}>
          {blocks
            .filter((b) => !b.cleaning)
            .map((b) => (
              <span
                key={`${b.id}-${b.from}`}
                className="absolute top-0 h-5 grid place-items-center text-[10.5px] font-bold uppercase tracking-wider text-faint border-l border-line overflow-hidden whitespace-nowrap"
                style={{ left: `${x(b.from)}%`, width: `${x(b.to) - x(b.from)}%` }}
              >
                {x(b.to) - x(b.from) > 14 ? `Shift ${b.id}` : b.id}
              </span>
            ))}
          {ticks.map((t) => (
            <span key={t} className="absolute bottom-0 -translate-x-1/2 text-[11px] text-faint num" style={{ left: `${x(t)}%` }}>
              {clock(t)}
            </span>
          ))}
        </div>

        {lanes.length ? (
          <div className="relative mt-2 max-h-[420px] overflow-y-auto pr-1">
            <div className="relative">
              {/* Shift bands, grid lines, now */}
              <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ left: 'var(--lw)' }}>
                {blocks.map((b, i) =>
                  b.cleaning ? (
                    <span key={`c-${b.from}`} className="absolute inset-y-0 hatch-warn" style={{ left: `${x(b.from)}%`, width: `${x(b.to) - x(b.from)}%` }} />
                  ) : (
                    <span key={`${b.id}-${b.from}`} className={clsx('absolute inset-y-0', i % 2 ? '' : 'bg-sunken/40')} style={{ left: `${x(b.from)}%`, width: `${x(b.to) - x(b.from)}%` }} />
                  ),
                )}
                {ticks.map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${x(t)}%` }} />
                ))}
                <span className="absolute inset-y-0 w-[2px] bg-brand shadow-[0_0_12px_rgb(var(--brand))]" style={{ left: `${x(now)}%` }} />
              </div>

              {lanes.map((lane) => (
                <div key={lane[0].machine.id} className="relative flex items-center h-10">
                  <div className="shrink-0 pr-3 text-[12.5px] flex items-center gap-2 min-w-0" style={{ width: 'var(--lw)' }}>
                    <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', lane.some((s) => s.ongoing) ? 'bg-alarm' : 'bg-faint')} />
                    <span className="truncate">{lane[0].machine.name}</span>
                  </div>
                  <div className="relative flex-1 h-full">
                    {lane.map((s) => (
                      <button
                        key={s.id}
                        onClick={(e) => (s.reason ? tapTip(s, e) : onEnter(s))}
                        onMouseMove={(e) => setTip({ s, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTip(null)}
                        className={clsx(
                          'absolute top-2 bottom-2 rounded-md min-w-[6px] transition-[filter] hover:brightness-125',
                          s.ongoing && 'bar-live',
                          !s.reason ? 'cursor-pointer outline outline-1 outline-dashed outline-warn' : 'cursor-default',
                        )}
                        style={{ left: `${x(s.start)}%`, width: `${x(s.end) - x(s.start)}%`, backgroundColor: stopRgb(s) }}
                        aria-label={`${s.machine.name}: ${s.reason?.label ?? 'no reason'}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-24 grid place-items-center text-muted">No stops in this window</div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 pt-4 border-t border-line text-[12px] text-muted">
          {GROUP_ORDER.map((g) => (
            <span key={g} className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm" style={{ background: reasonRgb(g) }} />
              {GROUPS[g].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm outline outline-1 outline-dashed outline-warn" style={{ background: reasonRgb('none') }} />
            No reason
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-2 rounded-sm bar-live" style={{ backgroundColor: reasonRgb('none') }} />
            Still stopped
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-2 rounded-sm hatch-warn" />
            Night cleaning
          </span>
        </div>
      </div>

      {tip && <Tip {...tip} />}
    </section>
  )
}

const LIST_LIMIT = 8

/** Phones: the stops in the window as a list. Still stopped first, then newest first. */
function StopList({ stops, onEnter }: { stops: Stop[]; onEnter: (s: Stop) => void }) {
  const [all, setAll] = useState(false)
  const sorted = [...stops].sort((a, b) => Number(b.ongoing) - Number(a.ongoing) || b.start - a.start)
  const list = all ? sorted : sorted.slice(0, LIST_LIMIT)

  if (!sorted.length) return <div className="sm:hidden rounded-2xl border border-line bg-panel h-24 grid place-items-center text-muted">No stops in this window</div>

  return (
    <div className="sm:hidden rounded-2xl border border-line bg-panel overflow-hidden">
      <ol className="divide-y divide-line">
        {list.map((s) => {
          const body = (
            <>
              <span className="w-11 shrink-0 num text-[12px] text-muted text-left">{clock(s.start)}</span>
              <span className={clsx('relative w-2.5 h-2.5 rounded-full shrink-0', !s.reason && 'outline outline-1 outline-dashed outline-warn outline-offset-2')} style={{ background: stopRgb(s) }}>
                {s.ongoing && <span className="absolute inset-0 rounded-full motion-safe:animate-ping" style={{ background: stopRgb(s) }} />}
              </span>
              <span className="flex-1 min-w-0 text-left">
                <span className="block text-[14px] font-semibold truncate">{s.machine.name}</span>
                <span className={clsx('flex items-center gap-1 text-[12px] truncate', s.reason ? 'text-muted' : 'text-warn font-semibold')}>
                  {!s.reason && <ClipboardEdit size={12} className="shrink-0" />}
                  {s.reason?.label ?? 'Add reason'}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={clsx('block num text-[14px] font-semibold', s.ongoing ? 'text-alarm' : 'text-fg')}>{short(s.minutes)}</span>
                {s.ongoing ? (
                  <span className="block text-[10.5px] uppercase tracking-wide font-bold text-alarm">Live</span>
                ) : (
                  <span className="block num text-[11px] text-faint">{fmt(s.kg)} kg</span>
                )}
              </span>
            </>
          )
          const row = 'w-full flex items-center gap-3 px-4 py-3'
          return (
            <li key={s.id}>
              {s.reason ? (
                <div className={row}>{body}</div>
              ) : (
                <button onClick={() => onEnter(s)} className={clsx(row, 'focus-ring active:bg-sunken')}>
                  {body}
                </button>
              )}
            </li>
          )
        })}
      </ol>
      {sorted.length > LIST_LIMIT && (
        <button onClick={() => setAll(!all)} className="focus-ring w-full h-11 border-t border-line text-[13px] font-semibold text-brand active:bg-sunken">
          {all ? 'Show less' : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  )
}

function Tip({ s, x, y }: { s: Stop; x: number; y: number }) {
  return (
    <div
      className="fixed z-50 pointer-events-none w-[230px] rounded-xl border border-line bg-sunken shadow-pop p-3 text-[12px]"
      style={{ left: Math.max(8, Math.min(x + 14, window.innerWidth - 238)), top: Math.min(y + 14, window.innerHeight - 140) }}
    >
      <div className="font-semibold text-[13px] text-fg">{s.machine.name}</div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: stopRgb(s) }} />
        {s.reason?.label ?? 'No reason · click to add'}
      </div>
      <div className="grid grid-cols-2 gap-y-1 mt-2 text-muted num">
        <span>Time</span>
        <span className="text-right text-fg">
          {clock(s.start)}–{s.ongoing ? 'now' : clock(s.end)}
        </span>
        <span>Stopped</span>
        <span className="text-right text-fg">{short(s.minutes)}</span>
        <span>Yarn lost</span>
        <span className="text-right text-fg">{fmt(s.kg)} kg</span>
      </div>
    </div>
  )
}
