// Downtime this month, written as a short story for the owner:
// one sentence with the month's numbers, then four findings whose headlines
// say the conclusion, then the day-by-day picture and the stops still missing
// a reason. Every number comes from the same stop history as Downtime now.
import clsx from 'clsx'
import ReactECharts from 'echarts-for-react'
import { Check, ChevronDown, ClipboardEdit } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HandOff, LayerFrame } from '../components/layout/LayerFrame'
import { C, FONT, axisLabel, tooltipBase } from '../components/charts/theme'
import { ReasonChip, ReasonForm } from '../components/downtime/parts'
import { fmt } from '../lib/format'
import { GROUPS, NO_REASON_HEX, POSSIBLE_KG_MONTH, byGroup, byMachine, byReason, bySection, dur, isPlanned, monthStops, perDay, sum, totals, type Stop } from '../sim/downtime'
import { useApp } from '../store/app'

const day = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short' }).format(t)
const when = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t)
const tonnes = (kg: number) => fmt(kg / 1000, 1)

export function DowntimeMonth() {
  const now = useApp((s) => s.now)
  const entries = useApp((s) => s.dtEntries)
  const minute = Math.floor(now / 60_000)
  const [editing, setEditing] = useState<Stop | null>(null)

  // Recalculated once a minute: enough for a monthly view
  const stops = useMemo(() => monthStops(now, entries), [minute, entries]) // eslint-disable-line react-hooks/exhaustive-deps
  const unplanned = useMemo(() => stops.filter((s) => !isPlanned(s)), [stops])
  const t = useMemo(() => totals(stops), [stops])

  return (
    <LayerFrame layer={1} title="Downtime this month" subtitle="The last 30 days: how long machines were stopped, why, and how much yarn it cost.">
      {/* The month in one sentence */}
      <section className="card px-8 py-7">
        <p className="font-display font-semibold text-[26px] leading-[1.35] max-w-[46ch]">
          This month your machines stopped <Num>{fmt(t.stops)} times</Num>. They stood still for <Num>{fmt(t.hours)} hours</Num>, and{' '}
          <Num tone="alarm">{tonnes(t.kg)} tonnes</Num> of yarn was not made.
        </p>
        <div className="flex flex-wrap gap-x-10 gap-y-3 mt-5 text-[14px]">
          <Fact big={`${fmt((t.kg / POSSIBLE_KG_MONTH) * 100, 1)}%`} text="of what the mill can make" />
          <Fact big={`${fmt(t.overHours)} hours`} text="lost because repairs took longer than normal" tone="alarm" />
          <Fact big={String(t.noReason)} text="stops with no reason given" tone="warn" />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-6">
        <Causes stops={unplanned} />
        <SlowJobs stops={unplanned} />
        <Sections stops={unplanned} />
        <Machines stops={unplanned} />
      </div>

      <DayByDay stops={unplanned} now={now} />

      <NoReason stops={stops} onEnter={setEditing} />

      <p className="mt-6 text-[12px] text-muted max-w-4xl leading-relaxed">
        How yarn not made is counted: ring frames and Open End make the yarn, so every minute they stop is yarn lost. Machines earlier in the line (cards, draw frames,
        combers, simplex, autoconers) only cost yarn when they stop long enough for the machines after them to run out of material. Night cleaning, doffing and planned
        stops ({fmt(t.plannedHours)} hours this month) are not counted.
      </p>

      <HandOff text="bearing changes take twice their normal time. Keeping spare bearings at each section is the quickest way to get machines back sooner." to="/advisor#bearing-overrun" label="See the recommendation" />

      {editing && <ReasonForm stop={editing} onClose={() => setEditing(null)} />}
    </LayerFrame>
  )
}

/* ------------------------------ building blocks ------------------------------ */

function Num({ children, tone }: { children: ReactNode; tone?: 'alarm' }) {
  return <span className={clsx('font-bold whitespace-nowrap', tone === 'alarm' ? 'text-alarm' : 'text-brand-dark')}>{children}</span>
}

function Fact({ big, text, tone }: { big: string; text: string; tone?: 'alarm' | 'warn' }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={clsx('font-display font-bold text-[20px] num', tone === 'alarm' ? 'text-alarm' : tone === 'warn' ? 'text-warn' : 'text-fg')}>{big}</span>
      <span className="text-muted">{text}</span>
    </div>
  )
}

/** One finding: the headline says the conclusion, the picture shows it */
function Story({ title, sub, children, className }: { title: ReactNode; sub: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('card p-6 flex flex-col', className)}>
      <h2 className="font-display font-semibold text-[19px] leading-snug">{title}</h2>
      <p className="text-[14px] text-muted mt-1">{sub}</p>
      <div className="mt-5 flex-1">{children}</div>
    </section>
  )
}

function Bar({ label, value, max, color, right, strong }: { label: ReactNode; value: number; max: number; color: string; right: ReactNode; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)_auto] items-center gap-3 text-[14px]">
      <span className={clsx('truncate', strong ? 'font-semibold' : 'text-muted')}>{label}</span>
      <span className="h-3.5 rounded-full bg-sunken overflow-hidden">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: color }} />
      </span>
      <span className="num text-right min-w-[78px]">{right}</span>
    </div>
  )
}

/* ------------------------------ 1. why machines stopped ------------------------------ */

function Causes({ stops }: { stops: Stop[] }) {
  const none = stops.filter((s) => !s.reason)
  const rows = [
    ...byGroup(stops)
      .filter((g) => g.group !== 'planned' && g.stops > 0)
      .map((g) => ({ label: GROUPS[g.group].label, hex: GROUPS[g.group].hex, hours: g.hours })),
    { label: 'No reason given', hex: NO_REASON_HEX, hours: sum(none, (s) => s.minutes) / 60 },
  ].sort((a, b) => b.hours - a.hours)
  const total = rows.reduce((s, r) => s + r.hours, 0)
  const top = rows[0]

  return (
    <Story
      title={
        <>
          {fmt((top.hours / total) * 100)}% of the time lost was <span style={{ color: top.hex }}>{top.label.toLowerCase()}s</span>
        </>
      }
      sub="Every hour machines were stopped this month, by cause."
    >
      <div className="flex h-12 rounded-xl overflow-hidden gap-[3px]">
        {rows.map((r) => (
          <div key={r.label} className="h-full grid place-items-center text-[12px] font-bold text-white" style={{ width: `${(r.hours / total) * 100}%`, background: r.hex }} title={`${r.label}: ${fmt(r.hours)} h`}>
            {r.hours / total > 0.08 ? `${fmt((r.hours / total) * 100)}%` : ''}
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5 text-[14px]">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: r.hex }} />
            <span className="flex-1">{r.label}</span>
            <b className="num">{fmt(r.hours)} h</b>
          </div>
        ))}
      </div>
    </Story>
  )
}

/* ------------------------------ 2. repairs that take too long ------------------------------ */

function SlowJobs({ stops }: { stops: Stop[] }) {
  const rows = byReason(stops).filter((r) => r.reason.group === 'mechanical' || r.reason.group === 'electrical')
  const slow = [...rows].sort((a, b) => b.avgMin / b.reason.expectedMin - a.avgMin / a.reason.expectedMin)[0]
  const others = rows.filter((r) => r !== slow)
  const ratio = slow.avgMin / slow.reason.expectedMin
  const max = Math.max(slow.avgMin, slow.reason.expectedMin)

  return (
    <Story
      title={
        <>
          {slow.reason.label}s take <span className="text-alarm">{ratio >= 1.9 ? 'twice' : `${fmt(ratio, 1)}×`}</span> as long as they should
        </>
      }
      sub={`${slow.count} ${slow.reason.label.toLowerCase()}s this month. Together they ran ${fmt(slow.overHours)} hours over.`}
    >
      <div className="space-y-3">
        <Bar label="Normally takes" value={slow.reason.expectedMin} max={max} color="#BFCAC3" right={dur(slow.reason.expectedMin)} />
        <Bar label="Took this month" value={slow.avgMin} max={max} color={C.alarm} right={<b className="text-alarm">{dur(slow.avgMin)}</b>} strong />
      </div>
      <div className="mt-6 text-[13px] text-muted mb-2">Other repairs finish close to their normal time:</div>
      <div className="flex flex-wrap gap-2">
        {others.map((r) => {
          const ok = r.avgMin <= r.reason.expectedMin * 1.2
          return (
            <span key={r.reason.id} className={clsx('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-semibold', ok ? 'bg-mint text-brand' : 'bg-warn-bg text-warn')}>
              {ok && <Check size={13} strokeWidth={3} />}
              {r.reason.label} · {dur(r.avgMin)}
            </span>
          )
        })}
      </div>
    </Story>
  )
}

/* ------------------------------ 3. by section ------------------------------ */

function Sections({ stops }: { stops: Stop[] }) {
  const rows = bySection(stops).filter((r) => r.kg > 0)
  const total = rows.reduce((s, r) => s + r.kg, 0)
  return (
    <Story
      title={
        <>
          {rows[0].name} loses the most yarn: {fmt((rows[0].kg / total) * 100)}% of it
        </>
      }
      sub="Yarn not made this month, by section of the mill."
    >
      <div className="space-y-3">
        {rows.map((r, i) => (
          <Bar key={r.name} label={r.name} value={r.kg} max={rows[0].kg} color={i === 0 ? C.alarm : '#E7A49B'} right={<span className={i === 0 ? 'font-bold' : ''}>{fmt(r.kg)} kg</span>} strong={i === 0} />
        ))}
      </div>
    </Story>
  )
}

/* ------------------------------ 4. machines ------------------------------ */

function Machines({ stops }: { stops: Stop[] }) {
  const rows = byMachine(stops).slice(0, 5)
  return (
    <Story title={<>These 5 machines lost the most yarn</>} sub="Mostly long one-off repairs, not machines that stop often.">
      <div className="space-y-3.5">
        {rows.map((r, i) => (
          <Link key={r.machine.id} to={`/map?m=${r.machine.id}`} className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 group">
            <span className={clsx('w-6 h-6 rounded-full grid place-items-center text-[12px] font-bold', i === 0 ? 'bg-alarm text-white' : 'bg-sunken text-muted')}>{i + 1}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-[14px] group-hover:text-brand">{r.machine.name}</span>
              <span className="block text-[12px] text-muted truncate">
                {r.main} · stopped {fmt(r.hours, 1)} h in {r.stops} {r.stops === 1 ? 'stop' : 'stops'}
              </span>
            </span>
            <b className="num text-[15px]">{fmt(r.kg)} kg</b>
          </Link>
        ))}
      </div>
    </Story>
  )
}

/* ------------------------------ 5. day by day ------------------------------ */

function DayByDay({ stops, now }: { stops: Stop[]; now: number }) {
  const days = perDay(stops, now).map((d) => ({ t: d.t, kg: Object.values(d.by).reduce((a, v) => a + v, 0) + d.none }))
  const avg = days.reduce((s, d) => s + d.kg, 0) / days.length
  const worst = days.reduce((a, d) => (d.kg > a.kg ? d : a))
  const worstStop = stops.filter((s) => s.start >= worst.t && s.start < worst.t + 86_400_000).sort((a, b) => b.kg - a.kg)[0]

  const option = {
    animation: false,
    grid: { left: 60, right: 92, top: 22, bottom: 24 },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${fmt(v)} kg not made` },
    xAxis: { type: 'category', data: days.map((d) => day(d.t)), axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { ...axisLabel, interval: 4 } },
    yAxis: { type: 'value', axisLabel: { ...axisLabel, formatter: (v: number) => `${v} kg` }, splitLine: { lineStyle: { color: C.line, type: 'dashed' } } },
    series: [
      {
        type: 'bar',
        barWidth: '60%',
        data: days.map((d) => ({ value: Math.round(d.kg), itemStyle: { color: d === worst ? C.alarm : '#E7A49B', borderRadius: [4, 4, 0, 0] } })),
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: C.ink, type: 'dashed', width: 1, opacity: 0.55 },
          label: { formatter: `Average day
${fmt(avg)} kg`, position: 'end', lineHeight: 14, color: C.muted, fontFamily: FONT, fontSize: 11 },
          data: [{ yAxis: Math.round(avg) }],
        },
      },
    ],
  }
  return (
    <Story
      className="mt-5"
      title={
        <>
          The worst day was {day(worst.t)}: {fmt(worst.kg)} kg of yarn not made
        </>
      }
      sub={
        worstStop
          ? `Mostly ${worstStop.machine.name}: ${worstStop.reason?.label.toLowerCase() ?? 'a stop with no reason'} that kept it stopped for ${dur(worstStop.minutes)}. On an average day, about ${fmt(avg)} kg is lost.`
          : `On an average day, about ${fmt(avg)} kg is lost.`
      }
    >
      <ReactECharts option={option} style={{ height: 240 }} notMerge />
    </Story>
  )
}

/* ------------------------------ 6. stops with no reason ------------------------------ */

function NoReason({ stops, onEnter }: { stops: Stop[]; onEnter: (s: Stop) => void }) {
  const [open, setOpen] = useState(false)
  const missing = stops.filter((s) => !s.reason).sort((a, b) => b.start - a.start)
  if (!missing.length) {
    return (
      <div className="mt-5 rounded-2xl bg-mint px-6 py-4 text-[15px] font-semibold text-brand flex items-center gap-2">
        <Check size={18} strokeWidth={3} /> Every stop this month has a reason.
      </div>
    )
  }
  return (
    <section className="mt-5 rounded-2xl bg-warn-bg">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="focus-ring w-full flex items-center gap-4 px-6 py-4 text-left">
        <span className="w-10 h-10 rounded-full bg-panel text-warn grid place-items-center shrink-0">
          <ClipboardEdit size={18} />
        </span>
        <span className="flex-1">
          <span className="block font-display font-semibold text-[17px]">
            {missing.length} stops have no reason given
          </span>
          <span className="block text-[13px] text-muted">Without a reason, nobody can tell if the repair took too long or keeps happening. Supervisors can add it here.</span>
        </span>
        <span className="text-[13px] font-semibold text-warn whitespace-nowrap inline-flex items-center gap-1">
          {open ? 'Hide' : 'Show them'} <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <div className="px-6 pb-5 grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {missing.map((s) => (
            <div key={s.id} className="rounded-xl bg-panel px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold truncate">{s.machine.name}</div>
                <div className="text-[12px] text-muted num">
                  {when(s.start)} · {dur(s.minutes)}
                </div>
              </div>
              <ReasonChip stop={s} onEnter={() => onEnter(s)} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
