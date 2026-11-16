// Downtime now, built to be read in one look:
//  1. How much yarn the mill is making right now, against full speed
//  2. Where in the production line the stops are hurting
//  3. One tile per stopped machine: a timer ring against the normal job time,
//     and what the stop means for production (yarn lost, or material left)
import clsx from 'clsx'
import { ClipboardEdit, MapPin } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayerFrame } from '../components/layout/LayerFrame'
import { ReasonForm, StatusWord } from '../components/downtime/parts'
import { fmt } from '../lib/format'
import { CLEANING, isCleaning, pkParts } from '../lib/time'
import { KG_PER_HOUR, pkHour } from '../sim/engine'
import { DT_MACHINES, GROUPS, NO_REASON_HEX, bufferOf, dur, kgPerHour, monthStops, sectionOf, stoppedNow, sum, todayStops, type Stop } from '../sim/downtime'
import { useApp } from '../store/app'

const RED = '#B83A2C'
const GREEN = '#2E8B5E'
const AMBER = '#E0A100'
const GREY = '#A3ADA7'


const late = (s: Stop) => s.overMin > 0
const needsAttention = (s: Stop) => !s.reason || late(s)
/** Is this stop costing yarn right now? */
const hurting = (s: Stop) => s.lostMin > 0
const minsLeft = (s: Stop) => Math.max(0, bufferOf(s.machine) - s.minutes)

export function DowntimeNow() {
  const now = useApp((s) => s.now)
  const entries = useApp((s) => s.dtEntries)
  const { hash } = useLocation()
  const focus = hash.replace('#', '')
  const [editing, setEditing] = useState<Stop | null>(null)

  const stops = useMemo(() => monthStops(now, entries), [now, entries])
  const live = stoppedNow(stops).sort(
    (a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || Number(!!a.reason) - Number(!!b.reason) || b.overMin - a.overMin || b.minutes - a.minutes,
  )
  const done = todayStops(stops, now)
    .filter((s) => !s.ongoing)
    .sort((a, b) => b.end - a.end)

  const lostPerHour = sum(live.filter(hurting), (s) => kgPerHour(s.machine))
  const kgToday = sum(todayStops(stops, now), (s) => s.kg)
  const cleaning = isCleaning(pkParts(new Date(now)).hour)

  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => document.getElementById(`stop-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    return () => clearTimeout(t)
  }, [focus])

  return (
    <LayerFrame layer={1} title="Downtime now" subtitle="Which machines are stopped, and what it is doing to production.">
      {cleaning && (
        <p className="mb-5 rounded-xl bg-warn-bg text-warn px-4 py-3 text-[14px] font-semibold">
          Night cleaning ({CLEANING.span}): production machines are stopped as planned and are not counted here.
        </p>
      )}

      <TodayProduction live={live} lostPerHour={lostPerHour} kgToday={kgToday} now={now} />

      <ProductionLine live={live} />

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display font-semibold text-[22px]">Stopped machines</h2>
            <Counts live={live} />
          </div>
          <Legend />
        </div>
        {live.length ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {live.map((s) => (
              <Tile key={s.id} s={s} focused={focus === s.machine.id} onEnter={() => setEditing(s)} />
            ))}
          </div>
        ) : (
          <div className="card px-6 py-12 text-center text-[18px] font-display font-semibold text-brand">Every production machine is running.</div>
        )}
      </section>

      <Today done={done} onEnter={setEditing} />

      {editing && <ReasonForm stop={editing} onClose={() => setEditing(null)} />}
    </LayerFrame>
  )
}

/* ------------------------------ 1. today's production ------------------------------ */

/** Yarn is traded in 100 lb bags */
const BAG_KG = 45.36
/** Production hours in a day: everything except night cleaning (01:00–04:00) */
const DAY_HOURS = 21
const productionHoursSoFar = (h: number) => (h < 1 ? h : h < 4 ? 1 : h - 3)

/**
 * Yarn the current stops will still cost if every repair finishes on time.
 * Late repairs are given another 30 minutes; stops with no reason, an hour.
 */
function stillToLose(live: Stop[], hoursLeft: number) {
  return sum(live, (s) => {
    const more = s.expectedMin == null ? 60 : s.minutes < s.expectedMin ? s.expectedMin - s.minutes : 30
    const totalLost = Math.max(0, s.minutes + more - bufferOf(s.machine))
    const future = Math.min(Math.max(0, totalLost - s.lostMin), hoursLeft * 60)
    return (future / 60) * kgPerHour(s.machine)
  })
}

function TodayProduction({ live, lostPerHour, kgToday, now }: { live: Stop[]; lostPerHour: number; kgToday: number; now: number }) {
  const target = KG_PER_HOUR * DAY_HOURS
  const hoursDone = productionHoursSoFar(pkHour(now))
  const made = Math.max(0, KG_PER_HOUR * hoursDone - kgToday)
  const future = stillToLose(live, DAY_HOURS - hoursDone)
  const short = kgToday + future
  const forecast = target - short
  const toCome = Math.max(0, forecast - made)
  const pct = (v: number) => `${(v / target) * 100}%`
  const bags = (kg: number) => Math.round(kg / BAG_KG)
  const speed = ((KG_PER_HOUR - lostPerHour) / KG_PER_HOUR) * 100

  return (
    <section className="card overflow-hidden">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="p-7">
          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Today's production</div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mt-3">
            <div>
              <div className="font-display font-bold text-[44px] leading-none num">
                {fmt(forecast)} <span className="text-[22px] text-muted font-semibold">kg</span>
              </div>
              <div className="text-[14px] text-muted mt-2">expected by midnight, against a target of {fmt(target)} kg</div>
            </div>
            <div className="rounded-xl bg-alarm-bg px-4 py-2.5 mb-1">
              <div className="font-display font-bold text-[24px] leading-none text-alarm num">{bags(short)} bags short</div>
              <div className="text-[12px] text-alarm/80 mt-1 num">{fmt(short)} kg of yarn · 100 lb bags</div>
            </div>
          </div>

          {/* The day as one bar: made, still to come, lost */}
          <div className="mt-7">
            <div className="relative h-12 rounded-xl overflow-hidden flex bg-sunken">
              <div className="h-full flex items-center pl-4 text-white text-[13px] font-semibold whitespace-nowrap" style={{ width: pct(made), background: GREEN }}>
                Made so far
              </div>
              <div className="h-full flex items-center pl-3 text-[13px] font-semibold text-brand-dark whitespace-nowrap overflow-hidden" style={{ width: pct(toCome), background: '#BFE3CE' }}>
                Still to come
              </div>
              <div
                className="h-full"
                style={{ width: pct(short), background: `repeating-linear-gradient(135deg, ${RED} 0 7px, #D4655A 7px 14px)` }}
                title={`${fmt(short)} kg lost to stops`}
              />
              <span className="absolute -top-0 bottom-0 w-[3px] bg-fg" style={{ left: pct(made) }} title="Now" />
            </div>
            <div className="grid grid-cols-3 mt-3 text-[13px]">
              <Leg color={GREEN} label="Made so far" value={`${fmt(made)} kg`} />
              <Leg color="#BFE3CE" label="Still to come" value={`${fmt(toCome)} kg`} />
              <Leg color={RED} label="Lost to stops" value={`${fmt(kgToday)} kg so far + ${fmt(future)} kg coming`} strong />
            </div>
          </div>
        </div>

        <div className="p-7 bg-sunken/50 xl:border-l border-t xl:border-t-0 border-line flex flex-col items-center justify-center text-center">
          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Running speed now</div>
          <Gauge pct={speed} />
          <div className="text-[14px] -mt-2">
            <b className="num">{fmt(KG_PER_HOUR - lostPerHour)}</b> <span className="text-muted">of {fmt(KG_PER_HOUR)} kg an hour</span>
          </div>
          {lostPerHour > 0 && <div className="text-[13px] text-alarm font-semibold mt-1 num">−{fmt(lostPerHour)} kg an hour to stops</div>}
        </div>
      </div>
    </section>
  )
}

function Leg({ color, label, value, strong }: { color: string; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-3 h-3 rounded-sm mt-0.5 shrink-0" style={{ background: color }} />
      <div>
        <div className="text-muted">{label}</div>
        <div className={clsx('num font-semibold', strong && 'text-alarm')}>{value}</div>
      </div>
    </div>
  )
}

/** Half-circle speed gauge */
function Gauge({ pct }: { pct: number }) {
  const r = 80
  const len = Math.PI * r
  const color = pct >= 97 ? GREEN : pct >= 90 ? AMBER : RED
  return (
    <div className="relative w-[210px] h-[122px] mt-3">
      <svg viewBox="0 0 200 112" className="w-full h-full" aria-hidden>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#E2E8E3" strokeWidth="16" strokeLinecap="round" />
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${(pct / 100) * len} ${len}`} />
      </svg>
      <div className="absolute inset-x-0 bottom-3 text-center">
        <span className="font-display font-bold text-[38px] leading-none num" style={{ color }}>
          {fmt(pct)}
        </span>
        <span className="font-display font-bold text-[20px]" style={{ color }}>
          %
        </span>
      </div>
    </div>
  )
}

/* ------------------------------ counters ------------------------------ */

function Counts({ live }: { live: Stop[] }) {
  const lateN = live.filter(late).length
  const noReason = live.filter((s) => !s.reason).length
  return (
    <div className="flex gap-2">
      <Pill n={live.length} label="stopped" color={RED} />
      {lateN > 0 && <Pill n={lateN} label="late" color={RED} />}
      {noReason > 0 && <Pill n={noReason} label="no reason" color={AMBER} />}
    </div>
  )
}

function Pill({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-semibold" style={{ background: `${color}1A`, color }}>
      <b className="text-[15px] num">{n}</b> {label}
    </span>
  )
}

/* ------------------------------ 2. the production line ------------------------------ */

const STAGES: { title: string; note: string; steps: string[] }[] = [
  { title: 'Preparation', note: 'Material is stored between these steps', steps: ['Carding', 'Drawing', 'Combing', 'Simplex'] },
  { title: 'Spinning', note: 'Yarn is made here', steps: ['Ring spinning', 'Open End'] },
  { title: 'Winding', note: 'Yarn onto cones', steps: ['Winding'] },
]

function ProductionLine({ live }: { live: Stop[] }) {
  const all = STAGES.flatMap((st) => st.steps)
  const info = (name: string) => {
    const ms = DT_MACHINES.filter((m) => sectionOf(m) === name)
    const down = live.filter((s) => sectionOf(s.machine) === name)
    const loss = sum(down.filter(hurting), (s) => kgPerHour(s.machine))
    const tone = loss > 0 ? RED : down.length ? AMBER : GREEN
    return { ms, down, loss, tone }
  }

  return (
    <section className="card p-7 mt-5">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-semibold text-[19px]">Where the production line is affected</h2>
          <p className="text-[13px] text-muted mt-0.5">Material flows left to right. Each dot is one machine.</p>
        </div>
        <div className="flex gap-4 text-[12px] text-muted">
          <Dot color={GREEN} label="All running" />
          <Dot color={AMBER} label="Stopped, line still fed" />
          <Dot color={RED} label="Losing yarn" />
        </div>
      </div>

      <div className="overflow-x-auto mt-6">
        <div className="min-w-[960px]">
          {/* Stage brackets */}
          <div className="grid gap-3" style={{ gridTemplateColumns: STAGES.map((st) => `${st.steps.length}fr`).join(' ') }}>
            {STAGES.map((st) => (
              <div key={st.title} className="px-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-fg">{st.title}</span>
                  <span className="text-[12px] text-muted truncate">{st.note}</span>
                </div>
                <div className="mt-1.5 h-2 border-x-2 border-t-2 border-line-strong rounded-t-md" />
              </div>
            ))}
          </div>

          {/* Track with one station per step */}
          <div className="relative mt-3">
            <div className="absolute left-[7%] right-[7%] top-[26px] h-[4px] rounded-full bg-line" />
            <div className="grid gap-3 relative" style={{ gridTemplateColumns: `repeat(${all.length}, minmax(0, 1fr))` }}>
              {all.map((name) => {
                const { ms, down, loss, tone } = info(name)
                return (
                  <div key={name} className="flex flex-col items-center text-center">
                    <div className="w-[56px] h-[56px] rounded-full grid place-items-center bg-panel border-[4px] shadow-card" style={{ borderColor: tone }}>
                      <span className="font-display font-bold text-[17px] num" style={{ color: tone }}>
                        {down.length ? down.length : '✓'}
                      </span>
                    </div>
                    <div className="mt-2.5 font-semibold text-[14px] leading-tight">{name}</div>
                    <div className="text-[12px] text-muted">{ms.length} machines</div>
                    <div className="flex flex-wrap justify-center content-start gap-[3px] mt-2.5 max-w-[124px] h-[46px]">
                      {ms.map((m) => {
                        const st = down.find((x) => x.machine.id === m.id)
                        return <span key={m.id} className="w-[8px] h-[8px] rounded-[2px]" style={{ background: !st ? '#B9DCC8' : hurting(st) ? RED : AMBER }} />
                      })}
                    </div>
                    <div className="mt-2.5 h-7 px-2.5 rounded-full inline-flex items-center text-[12px] font-bold num" style={{ background: `${tone}1A`, color: tone }}>
                      {loss > 0 ? `−${fmt(loss)} kg/hour` : down.length ? 'Line still fed' : 'Running'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

/* ------------------------------ 3. one tile per stopped machine ------------------------------ */

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-[12px] text-muted">
      <Dot color={GREEN} label="Within normal time" />
      <Dot color={RED} label="Taking too long" />
      <Dot color={GREY} label="No reason given" />
    </div>
  )
}

function Tile({ s, focused, onEnter }: { s: Stop; focused: boolean; onEnter: () => void }) {
  const isLate = late(s)
  const tone = !s.reason ? GREY : isLate ? RED : GREEN
  return (
    <article id={`stop-${s.machine.id}`} className={clsx('card p-5 flex flex-col scroll-mt-6', isLate && 'ring-2 ring-alarm/50', !s.reason && 'ring-2 ring-solar/60', focused && 'shadow-pop')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-bold text-[20px] leading-tight">{s.machine.name}</h3>
          <div className="text-[13px] text-muted">{sectionOf(s.machine)}</div>
        </div>
        <Link to={`/map?m=${s.machine.id}`} title="Show on the map" className="focus-ring w-8 h-8 rounded-lg grid place-items-center text-muted hover:bg-sunken hover:text-brand shrink-0">
          <MapPin size={16} />
        </Link>
      </div>

      <div className="flex items-center gap-5 mt-4">
        <Ring s={s} tone={tone} />
        <div className="min-w-0 flex-1">
          {s.reason ? (
            <>
              <div className="inline-flex items-center gap-1.5 text-[14px] font-semibold">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: GROUPS[s.reason.group].hex }} />
                {s.reason.label}
              </div>
              <div className="text-[13px] text-muted mt-0.5">Normally {dur(s.expectedMin!)}</div>
              <div className="text-[17px] mt-2">
                <StatusWord stop={s} />
              </div>
            </>
          ) : (
            <>
              <div className="text-[14px] font-semibold text-warn">Nobody has said why</div>
              <button onClick={onEnter} className="focus-ring mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-warn-bg text-warn text-[13px] font-semibold hover:brightness-95">
                <ClipboardEdit size={14} /> Enter the reason
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-line">
        <Effect s={s} />
      </div>
    </article>
  )
}

/** Timer ring: fills toward the normal time for the job; red once it is late */
function Ring({ s, tone }: { s: Stop; tone: string }) {
  const r = 40
  const c = 2 * Math.PI * r
  const share = s.expectedMin ? Math.min(1, s.minutes / s.expectedMin) : 1
  const h = Math.floor(s.minutes / 60)
  const m = Math.round(s.minutes % 60)
  return (
    <div className="relative w-[104px] h-[104px] shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E2E8E3" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${share * c} ${c}`}
          className={s.ongoing ? 'transition-[stroke-dasharray] duration-700' : undefined}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <div className="font-display font-bold text-[22px] num" style={{ color: tone === GREY ? undefined : tone }}>
            {h ? `${h}h ${String(m).padStart(2, '0')}` : `${m}`}
          </div>
          <div className="text-[11px] text-muted mt-1">{h ? 'hours' : 'min'}</div>
        </div>
      </div>
    </div>
  )
}

/** What the stop is doing to production, as a picture */
function Effect({ s }: { s: Stop }) {
  const rate = kgPerHour(s.machine)
  if (!hurting(s)) {
    // Material stored after the machine keeps the line going for a while
    const left = minsLeft(s)
    const share = left / bufferOf(s.machine)
    const color = share > 0.4 ? GREEN : AMBER
    return (
      <div>
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-semibold" style={{ color }}>
            Line still fed
          </span>
          <span className="text-muted">
            material left for <b className="text-fg num">{dur(left)}</b>
          </span>
        </div>
        <div className="mt-2 h-3.5 rounded-full bg-sunken overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${share * 100}%`, background: color }} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[13px] font-semibold text-alarm">Losing yarn</div>
        <div className="text-[13px] text-muted">{fmt(rate)} kg every hour</div>
      </div>
      <div className="text-right">
        <div className="font-display font-bold text-[28px] leading-none num text-alarm">
          {fmt(s.kg)} <span className="text-[15px]">kg</span>
        </div>
        <div className="text-[12px] text-muted mt-1">lost so far</div>
      </div>
    </div>
  )
}

/* ------------------------------ already fixed today ------------------------------ */

function Today({ done, onEnter }: { done: Stop[]; onEnter: (s: Stop) => void }) {
  if (!done.length) return null
  return (
    <section className="mt-10">
      <h2 className="font-display font-semibold text-[18px] mb-3">Fixed earlier today</h2>
      <div className="flex flex-wrap gap-2.5">
        {done.map((s) => (
          <div key={s.id} className="card px-4 py-2.5 flex items-center gap-3 text-[14px]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.reason ? GROUPS[s.reason.group].hex : NO_REASON_HEX }} />
            <span className="font-semibold">{s.machine.name}</span>
            <span className="text-muted">{s.reason?.label ?? 'no reason'}</span>
            <span className="text-muted num">{dur(s.minutes)}</span>
            {s.reason ? (
              <b className={clsx('num', late(s) ? 'text-alarm' : 'text-brand')}>{late(s) ? `${dur(s.overMin)} late` : 'on time'}</b>
            ) : (
              <button onClick={() => onEnter(s)} className="text-warn font-semibold hover:underline">
                Add reason
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
