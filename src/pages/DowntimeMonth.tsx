// Downtime this month, control-room style: six numbers with 30-day trends,
// a calendar of yarn lost per day, causes as a donut, repair time against
// normal, a heat map of the mill, the five costliest machines, and the stops
// still missing a reason. Every value comes from the same stop history as
// Downtime now; only presentation lives here.
import clsx from 'clsx'
import { ArrowRight, CheckCircle2, ChevronDown, ClipboardEdit, Clock, Gauge, Hourglass, Lightbulb, MapPin, Package, Timer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ReasonForm } from '../components/downtime/parts'
import { Kpi, Panel, SectionTitle, reasonRgb, short, stopRgb, useCountUp, useMounted } from '../components/ui/kit'
import { HALL_BOXES, TILES, VIEW } from '../data/din/floorplan'
import { fmt } from '../lib/format'
import { pkMidnight } from '../sim/engine'
import {
  GROUPS,
  POSSIBLE_KG_MONTH,
  byGroup,
  byMachine,
  byReason,
  bySection,
  dur,
  isPlanned,
  monthStops,
  sum,
  totals,
  type Stop,
} from '../sim/downtime'
import { useApp } from '../store/app'

const DAY = 86_400_000
const PK = { timeZone: 'Asia/Karachi' } as const
const dayMonth = (t: number) => new Intl.DateTimeFormat('en-GB', { ...PK, day: 'numeric', month: 'short' }).format(t)
const dayNum = (t: number) => new Intl.DateTimeFormat('en-GB', { ...PK, day: 'numeric' }).format(t)
const when = (t: number) => new Intl.DateTimeFormat('en-GB', { ...PK, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t)
/** Monday = 0 … Sunday = 6, in Pakistan time */
const weekdayIdx = (t: number) => (new Date(t + 5 * 3_600_000).getUTCDay() + 6) % 7
/** What the mill can make in one day if nothing stops */
const POSSIBLE_KG_DAY = POSSIBLE_KG_MONTH / 30

interface Day {
  t: number
  /** Unplanned stops that started this day */
  list: Stop[]
  stops: number
  hours: number
  kg: number
  overHours: number
  noReason: number
}

/** The last 30 days, one entry per day (unplanned stops only, as in the month totals) */
function daily(stops: Stop[], now: number): Day[] {
  const mid = pkMidnight(now)
  return Array.from({ length: 30 }, (_, i) => {
    const t = mid - (29 - i) * DAY
    const all = stops.filter((s) => s.start >= t && s.start < t + DAY)
    const list = all.filter((s) => !isPlanned(s))
    return {
      t,
      list,
      stops: list.length,
      hours: sum(list, (s) => s.minutes) / 60,
      kg: sum(list, (s) => s.kg),
      overHours: sum(list, (s) => s.overMin) / 60,
      noReason: all.filter((s) => !s.reason).length,
    }
  })
}

/** Breakdown repairs, slowest against their normal time first */
function slowRepairs(stops: Stop[]) {
  return byReason(stops)
    .filter((r) => r.reason.group === 'mechanical' || r.reason.group === 'electrical')
    .map((r) => ({ ...r, ratio: r.avgMin / r.reason.expectedMin }))
    .sort((a, b) => b.ratio - a.ratio)
}

export function DowntimeMonth() {
  const now = useApp((s) => s.now)
  const entries = useApp((s) => s.dtEntries)
  const minute = Math.floor(now / 60_000)
  const [editing, setEditing] = useState<Stop | null>(null)
  const [showMissing, setShowMissing] = useState(false)

  // Recalculated once a minute: enough for a monthly view
  const stops = useMemo(() => monthStops(now, entries), [minute, entries]) // eslint-disable-line react-hooks/exhaustive-deps
  const unplanned = useMemo(() => stops.filter((s) => !isPlanned(s)), [stops])
  const t = useMemo(() => totals(stops), [stops])
  const days = useMemo(() => daily(stops, now), [stops]) // eslint-disable-line react-hooks/exhaustive-deps
  const slow = useMemo(() => slowRepairs(unplanned), [unplanned])
  const missing = useMemo(() => stops.filter((s) => !s.reason).sort((a, b) => b.start - a.start), [stops])

  return (
    <div>
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <h1 className="font-display font-bold text-[22px] sm:text-[26px]">Downtime this month</h1>
          <span className="inline-flex items-center h-7 px-3 rounded-full bg-sunken text-[12px] font-semibold text-muted">Last 30 days</span>
        </div>
        <Link to="/downtime" className="focus-ring inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-line text-[13px] font-semibold text-muted hover:text-fg hover:bg-sunken">
          <Timer size={15} /> Now
        </Link>
      </header>

      {/* The month in six numbers, each with its 30 days */}
      <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mt-5 sm:mt-6">
        <Kpi icon={Timer} value={t.stops} label="Stops" tone="fg" trend={days.map((d) => d.stops)} trendTitle="Last 30 days" />
        <Kpi icon={Clock} value={t.hours} label="Hours stopped" tone="fg" trend={days.map((d) => d.hours)} trendTitle="Last 30 days" />
        <Kpi
          icon={Package}
          value={t.kg / 1000}
          digits={1}
          unit="t"
          label="Yarn lost"
          tone="alarm"
          trend={days.map((d) => d.kg)}
          trendTitle="Last 30 days"
          hint={`Ring frames and Open End lose yarn the moment they stop. Earlier machines only cost yarn once the machines after them run out of material. Night cleaning, doffing and planned stops (${fmt(t.plannedHours)} h) are not counted.`}
        />
        <Kpi
          icon={Gauge}
          value={(t.kg / POSSIBLE_KG_MONTH) * 100}
          digits={1}
          unit="%"
          label="Of capacity"
          tone="alarm"
          trend={days.map((d) => (d.kg / POSSIBLE_KG_DAY) * 100)}
          trendTitle="Last 30 days"
          hint="Yarn lost, as a share of what the mill can make in 30 days"
        />
        <Kpi icon={Hourglass} value={t.overHours} label="Hours over normal" tone="alarm" trend={days.map((d) => d.overHours)} trendTitle="Last 30 days" hint="Time repairs took beyond the normal time for the job" />
        <Kpi icon={ClipboardEdit} value={t.noReason} label="No reason" tone={t.noReason ? 'warn' : 'brand'} trend={days.map((d) => d.noReason)} trendTitle="Last 30 days" />
      </section>

      {/* When and why */}
      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 mt-4">
        <Calendar days={days} now={now} />
        <Causes stops={unplanned} />
      </div>

      {/* How long and where */}
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <SlowRepairs rows={slow} />
        <HeatMap stops={unplanned} />
      </div>

      {/* Costliest machines */}
      <section className="mt-8">
        <SectionTitle title="Most yarn lost" count={5} />
        <TopMachines stops={unplanned} now={now} />
      </section>

      {/* What needs doing */}
      <div className="grid md:grid-cols-2 gap-4 mt-8">
        <NoReasonCard count={missing.length} open={showMissing} onToggle={() => setShowMissing(!showMissing)} />
        <NextCard slow={slow[0]} />
      </div>
      {showMissing && missing.length > 0 && <MissingList stops={missing} onEnter={setEditing} />}

      {editing && <ReasonForm stop={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/* ------------------------------ calendar ------------------------------ */

function Calendar({ days, now }: { days: Day[]; now: number }) {
  const [sel, setSel] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((d) => d.kg))
  const worst = days.reduce((a, d) => (d.kg > a.kg ? d : a))
  const avg = sum(days.flatMap((d) => d.list), (s) => s.kg) / days.length
  const active = days.find((d) => d.t === sel) ?? worst
  const today = pkMidnight(now)
  const cells: (Day | null)[] = [...Array<null>(weekdayIdx(days[0].t)).fill(null), ...days]
  const top = [...active.list].sort((a, b) => b.kg - a.kg).slice(0, 4)
  const heat = (kg: number) => (kg ? `rgb(var(--alarm) / ${(0.14 + 0.8 * (kg / max)).toFixed(2)})` : 'rgb(var(--sunken))')

  return (
    <Panel
      title="Yarn lost per day"
      right={
        <span className="text-[12px] text-muted num">
          avg <b className="text-fg">{fmt(avg)} kg</b>
        </span>
      }
    >
      <div className="grid sm:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-5 sm:gap-6">
        <div>
          <div className="grid grid-cols-7 gap-1.5">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span key={i} className="text-center text-[11px] font-semibold text-faint pb-1">
                {d}
              </span>
            ))}
            {cells.map((d, i) =>
              d ? (
                <button
                  key={d.t}
                  onClick={() => setSel(d.t)}
                  title={`${dayMonth(d.t)} · ${fmt(d.kg)} kg`}
                  style={{ animationDelay: `${i * 14}ms`, background: heat(d.kg), color: d.kg / max > 0.5 ? 'rgb(var(--bg))' : 'rgb(var(--fg))' }}
                  className={clsx(
                    'rise focus-ring relative aspect-square rounded-lg grid place-items-center text-[12px] num font-semibold transition-transform hover:scale-105',
                    d === active && 'ring-2 ring-fg ring-offset-2 ring-offset-panel',
                    d === worst && 'shadow-[0_0_18px_-4px_rgb(var(--alarm)/0.6)]',
                  )}
                >
                  {dayNum(d.t)}
                  {d.t === today && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-brand" />}
                </button>
              ) : (
                <span key={`e${i}`} />
              ),
            )}
          </div>
          <div className="flex items-center justify-end gap-1.5 mt-3 text-[11px] text-faint">
            Less
            {[0, 0.25, 0.5, 0.75, 1].map((k) => (
              <span key={k} className="w-3 h-3 rounded-[3px]" style={{ background: heat(k * max) }} />
            ))}
            More
          </div>
        </div>

        {/* The day picked (the worst day until another is tapped) */}
        <div key={active.t} className="rise min-w-0 sm:border-l sm:border-line sm:pl-6 border-t sm:border-t-0 border-line pt-4 sm:pt-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display font-semibold text-[16px]">{dayMonth(active.t)}</span>
            {active === worst && <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-alarm">Worst day</span>}
          </div>
          <div className="flex items-baseline gap-5 mt-2">
            <div>
              <span className="num font-display font-bold text-[30px] leading-none text-alarm">{fmt(active.kg)}</span>
              <span className="text-[13px] text-muted ml-1">kg</span>
            </div>
            <div className="text-[13px] text-muted num">
              <b className="text-fg">{active.stops}</b> stops · <b className="text-fg">{short(active.hours * 60)}</b>
            </div>
          </div>
          <ul className="mt-4 space-y-3">
            {top.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: stopRgb(s) }} />
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="text-[13px] font-semibold">{s.machine.name}</div>
                  <div className="text-[12px] text-muted truncate">{s.reason?.label ?? 'No reason'}</div>
                </div>
                <div className="text-right shrink-0 leading-tight">
                  <div className="num text-[13px] font-semibold">{fmt(s.kg)} kg</div>
                  <div className="num text-[12px] text-muted">{short(s.minutes)}</div>
                </div>
              </li>
            ))}
            {!top.length && <li className="text-[13px] text-muted">No stops this day</li>}
          </ul>
        </div>
      </div>
    </Panel>
  )
}

/* ------------------------------ causes donut ------------------------------ */

function Causes({ stops }: { stops: Stop[] }) {
  const on = useMounted()
  const [hover, setHover] = useState<string | null>(null)
  const none = stops.filter((s) => !s.reason)
  const rows = [
    ...byGroup(stops)
      .filter((g) => g.group !== 'planned' && g.stops > 0)
      .map((g) => ({ label: GROUPS[g.group].label, hex: reasonRgb(g.group), hours: g.hours })),
    ...(none.length ? [{ label: 'No reason', hex: reasonRgb('none'), hours: sum(none, (s) => s.minutes) / 60 }] : []),
  ].sort((a, b) => b.hours - a.hours)
  const total = rows.reduce((s, r) => s + r.hours, 0) || 1
  const R = 72
  const C = 2 * Math.PI * R
  const GAP = 3
  const focus = rows.find((r) => r.label === hover)
  const shownTotal = useCountUp(total)

  let acc = 0
  const segs = rows.map((r) => {
    const len = (r.hours / total) * C
    const seg = { ...r, len: Math.max(0, len - GAP), offset: acc }
    acc += len
    return seg
  })

  return (
    <Panel title="Why machines stopped">
      <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-6 flex-1">
        <div className="relative w-[190px] h-[190px] shrink-0">
          <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
            <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(var(--sunken))" strokeWidth="24" />
            {segs.map((s, i) => (
              <circle
                key={s.label}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={s.hex}
                strokeWidth={hover === s.label ? 30 : 24}
                strokeDasharray={`${on ? s.len : 0} ${C}`}
                strokeDashoffset={-s.offset}
                opacity={hover && hover !== s.label ? 0.3 : 1}
                onMouseEnter={() => setHover(s.label)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer"
                style={{ transition: `stroke-dasharray 0.9s cubic-bezier(.2,.8,.2,1) ${i * 0.08}s, opacity .2s, stroke-width .2s` }}
              />
            ))}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
            {focus ? (
              <div>
                <div className="num font-display font-bold text-[30px] leading-none">{fmt((focus.hours / total) * 100)}%</div>
                <div className="text-[12px] text-muted mt-1 max-w-[110px] leading-tight">{focus.label}</div>
              </div>
            ) : (
              <div>
                <div className="num font-display font-bold text-[30px] leading-none">{fmt(shownTotal)}</div>
                <div className="text-[12px] text-muted mt-1">hours stopped</div>
              </div>
            )}
          </div>
        </div>

        <ul className="w-full space-y-1">
          {rows.map((r, i) => (
            <li
              key={r.label}
              onMouseEnter={() => setHover(r.label)}
              onMouseLeave={() => setHover(null)}
              className={clsx('flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] transition-colors cursor-default', hover === r.label ? 'bg-sunken' : '')}
            >
              <span className="w-3 h-3 rounded-[4px] shrink-0" style={{ background: r.hex }} />
              <span className={clsx('flex-1 truncate', i === 0 && 'font-semibold')}>{r.label}</span>
              <span className="num text-muted">{fmt(r.hours)} h</span>
              <span className={clsx('num w-11 text-right', i === 0 ? 'font-bold text-fg' : 'text-muted')}>{fmt((r.hours / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

/* ------------------------------ repair time vs normal ------------------------------ */

function SlowRepairs({ rows }: { rows: ReturnType<typeof slowRepairs> }) {
  const on = useMounted()
  const max = Math.max(1, ...rows.flatMap((r) => [r.avgMin, r.reason.expectedMin])) * 1.06
  const pct = (v: number) => (v / max) * 100

  return (
    <Panel
      title="Repair time vs normal"
      right={
        <span className="flex items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-faint" /> Normal
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-alarm" /> Took
          </span>
        </span>
      }
    >
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const exp = r.reason.expectedMin
          const cur = on ? r.avgMin : exp
          const tone = r.ratio > 1.2 ? 'alarm' : r.ratio > 1.05 ? 'warn' : 'brand'
          const color = `rgb(var(--${tone}))`
          return (
            <div
              key={r.reason.id}
              className="grid grid-cols-[108px_minmax(0,1fr)_52px] sm:grid-cols-[150px_minmax(0,1fr)_60px] items-center gap-3 h-10"
              title={`${r.reason.label}: normally ${dur(exp)}, took ${dur(r.avgMin)} on average (${r.count} jobs)`}
            >
              <span className={clsx('text-[13px] truncate', i === 0 ? 'font-semibold' : 'text-muted')}>{r.reason.label}</span>
              <span className="relative h-full">
                <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
                <span
                  className="absolute top-1/2 h-[4px] -translate-y-1/2 rounded-full"
                  style={{ left: `${pct(Math.min(exp, cur))}%`, width: `${Math.abs(pct(cur) - pct(exp))}%`, background: color, opacity: 0.45, transition: `all 1s cubic-bezier(.2,.8,.2,1) ${i * 0.07}s` }}
                />
                <span className="absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-faint ring-2 ring-panel" style={{ left: `${pct(exp)}%` }} />
                <span
                  className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel"
                  style={{ left: `${pct(cur)}%`, background: color, transition: `left 1s cubic-bezier(.2,.8,.2,1) ${i * 0.07}s` }}
                />
              </span>
              <span className="num text-right text-[14px] font-bold" style={{ color }}>
                ×{fmt(r.ratio, 1)}
              </span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

/* ------------------------------ heat map of the mill ------------------------------ */

function HeatMap({ stops }: { stops: Stop[] }) {
  const navigate = useNavigate()
  const machines = byMachine(stops)
  const kgOf = new Map(machines.map((m) => [m.machine.id, m.kg]))
  const nameOf = new Map(machines.map((m) => [m.machine.id, m.machine.name]))
  const max = Math.max(1, ...machines.map((m) => m.kg))
  const sections = bySection(stops).filter((s) => s.kg > 0)
  const topSection = sections[0]?.kg || 1
  const fill = (id: string) => {
    const kg = kgOf.get(id) ?? 0
    return kg > 0 ? `rgb(var(--alarm) / ${(0.15 + 0.85 * (kg / max)).toFixed(2)})` : 'rgb(var(--brand) / 0.10)'
  }

  return (
    <Panel title="Where yarn was lost">
      <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="w-full min-h-[180px]" preserveAspectRatio="xMidYMid meet">
        {HALL_BOXES.map((h) => (
          <g key={h.id}>
            <rect x={h.x} y={h.y} width={h.w} height={h.h} rx={18} fill="rgb(var(--sunken) / 0.45)" stroke="rgb(var(--line))" strokeWidth={2} />
            <text x={h.x + 18} y={h.y + 34} fill="rgb(var(--faint))" fontSize={22} fontWeight={600}>
              {h.title}
            </text>
          </g>
        ))}
        {TILES.map((t) => {
          const kg = kgOf.get(t.id) ?? 0
          const props = {
            fill: fill(t.id),
            className: kg > 0 ? 'cursor-pointer hover:brightness-125' : undefined,
            onClick: kg > 0 ? () => navigate(`/map?m=${t.id}`) : undefined,
          }
          return (
            <g key={t.id} {...props}>
              {kg > 0 && <title>{`${nameOf.get(t.id)} · ${fmt(kg)} kg`}</title>}
              {t.shape === 'circle' ? <circle cx={t.x + t.w / 2} cy={t.y + t.h / 2} r={t.w / 2} /> : <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={4} />}
            </g>
          )
        })}
      </svg>

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-4 pt-4 border-t border-line">
        {sections.slice(0, 6).map((s, i) => (
          <div key={s.name} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-2.5 text-[12.5px]">
            <span className={clsx('truncate', i === 0 ? 'font-semibold' : 'text-muted')}>{s.name}</span>
            <span className="h-1.5 rounded-full bg-sunken overflow-hidden">
              <span className="block h-full rounded-full bg-alarm" style={{ width: `${(s.kg / topSection) * 100}%`, opacity: i === 0 ? 1 : 0.55 }} />
            </span>
            <span className="num text-right text-muted">{fmt(s.kg)} kg</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

/* ------------------------------ top machines ------------------------------ */

function TopMachines({ stops, now }: { stops: Stop[]; now: number }) {
  const rows = byMachine(stops).slice(0, 5)
  const mid = pkMidnight(now)
  const dayStarts = Array.from({ length: 30 }, (_, i) => mid - (29 - i) * DAY)

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {rows.map((r, i) => {
        const mine = stops.filter((s) => s.machine.id === r.machine.id)
        const perDay = dayStarts.map((d) => {
          const l = mine.filter((s) => s.start >= d && s.start < d + DAY)
          const byG = new Map<string, number>()
          for (const s of l) byG.set(stopRgb(s), (byG.get(stopRgb(s)) ?? 0) + s.minutes)
          const main = [...byG.entries()].sort((a, b) => b[1] - a[1])[0]
          return { min: sum(l, (s) => s.minutes), hex: main?.[0] }
        })
        const maxMin = Math.max(30, ...perDay.map((d) => d.min))
        return (
          <article key={r.machine.id} className="rise rounded-2xl border border-line bg-panel p-4 flex flex-col gap-3 min-w-0" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex items-start gap-3">
              <span className={clsx('w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold shrink-0', i === 0 ? 'bg-alarm text-bg' : 'bg-sunken text-muted')}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="font-display font-semibold text-[15px] truncate">{r.machine.name}</div>
                <div className="text-[12px] text-muted truncate">{r.main}</div>
              </div>
              <Link to={`/map?m=${r.machine.id}`} title="Show on the mill map" className="focus-ring w-8 h-8 grid place-items-center rounded-lg bg-sunken text-muted hover:text-fg shrink-0">
                <MapPin size={14} />
              </Link>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="num font-display font-bold text-[26px] leading-none text-alarm">{fmt(r.kg)}</span>
              <span className="text-[12px] text-muted">kg</span>
              <span className="ml-auto text-[12px] text-muted num">
                {fmt(r.hours, 1)} h · {r.stops} {r.stops === 1 ? 'stop' : 'stops'}
              </span>
            </div>
            {/* 30 days of this machine, one bar per day */}
            <div className="flex items-end gap-[2px] h-9" title="Time stopped per day, last 30 days">
              {perDay.map((d, k) => (
                <span key={k} className="flex-1 rounded-[2px]" style={{ height: d.min ? `${Math.max(12, (d.min / maxMin) * 100)}%` : '2px', background: d.hex ?? 'rgb(var(--line))' }} />
              ))}
            </div>
          </article>
        )
      })}
    </div>
  )
}

/* ------------------------------ what needs doing ------------------------------ */

function NoReasonCard({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  const v = useCountUp(count)
  if (!count)
    return (
      <div className="rounded-2xl border border-brand/40 bg-mint/40 p-5 flex items-center gap-3 text-brand font-display font-semibold text-[16px]">
        <CheckCircle2 size={22} /> Every stop has a reason
      </div>
    )
  return (
    <div className="rounded-2xl border border-warn/40 p-5 flex items-center gap-4" style={{ background: 'radial-gradient(120% 120% at 0% 0%, rgb(var(--warn) / 0.14), rgb(var(--panel)) 60%)' }}>
      <span className="w-12 h-12 rounded-xl bg-warn-bg text-warn grid place-items-center shrink-0">
        <ClipboardEdit size={22} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="num font-display font-bold text-[30px] leading-none text-warn">{fmt(v)}</div>
        <div className="text-[13px] text-muted mt-1">stops with no reason</div>
      </div>
      <button onClick={onToggle} aria-expanded={open} className="focus-ring inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-warn text-bg text-[13px] font-bold hover:brightness-110 shrink-0">
        {open ? 'Hide' : 'Add reasons'} <ChevronDown size={15} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>
    </div>
  )
}

function NextCard({ slow }: { slow?: ReturnType<typeof slowRepairs>[number] }) {
  if (!slow) return null
  return (
    <div className="rounded-2xl border border-line p-5 flex items-center gap-4" style={{ background: 'radial-gradient(120% 120% at 0% 0%, rgb(var(--brand) / 0.12), rgb(var(--panel)) 60%)' }}>
      <span className="w-12 h-12 rounded-xl bg-mint text-brand grid place-items-center shrink-0">
        <Lightbulb size={22} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">Fix next</div>
        <div className="font-display font-semibold text-[16px] leading-snug mt-0.5">
          {slow.reason.label}s take <span className="text-alarm num">×{fmt(slow.ratio, 1)}</span> normal
        </div>
        {slow.reason.id === 'bearing' && <div className="text-[12.5px] text-muted mt-0.5">Keep spare bearings at each section</div>}
      </div>
      <Link to="/advisor#bearing-overrun" className="focus-ring inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-brand text-bg text-[13px] font-bold hover:brightness-110 shrink-0">
        <span className="hidden sm:inline">See advice</span> <ArrowRight size={15} />
      </Link>
    </div>
  )
}

function MissingList({ stops, onEnter }: { stops: Stop[]; onEnter: (s: Stop) => void }) {
  return (
    <div className="rise mt-3 rounded-2xl border border-line bg-panel overflow-hidden">
      <ul className="grid sm:grid-cols-2 xl:grid-cols-3 divide-y sm:divide-y-0 divide-line sm:gap-px sm:bg-line">
        {stops.map((s) => (
          <li key={s.id} className="bg-panel flex items-center gap-3 px-4 py-3">
            <span className="w-2.5 h-2.5 rotate-45 shrink-0 outline outline-1 outline-dashed outline-warn outline-offset-1" style={{ background: reasonRgb('none') }} />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold truncate">{s.machine.name}</div>
              <div className="text-[12px] text-muted num">
                {when(s.start)} · {short(s.minutes)}
              </div>
            </div>
            <button onClick={() => onEnter(s)} className="focus-ring inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-warn-bg text-warn text-[12px] font-bold hover:brightness-110 shrink-0">
              <ClipboardEdit size={13} /> Add
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

