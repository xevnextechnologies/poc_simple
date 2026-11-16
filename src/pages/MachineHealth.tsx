// Machine health, control-room style: health numbers, the mill coloured by
// health, the machines to act on now (score gauge, the failing value and its
// 6-week trend), the watch list, a matrix of the 8 checks, every machine by
// hall, and an analysis drawer with a radar of the 8 checks. All values come
// from sim/health; only presentation lives here.
import clsx from 'clsx'
import { Activity, AlertTriangle, ArrowRight, CircleCheck, Eye, FlagTriangleRight, HeartPulse, Info, Lightbulb, MapPin, ScanSearch, X, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { HALLS, MACHINES, hallById, machineById } from '../data/din'
import { HALL_BOXES, TILES, VIEW } from '../data/din/floorplan'
import { SectionTitle, useCountUp, useMounted } from '../components/ui/kit'
import { fmt } from '../lib/format'
import { HEALTH, HEALTH_LIST, INDICATORS, healthCounts, type HealthRecord, type Indicator, type Level } from '../sim/health'

/* Every level has its own icon, so it never depends on colour alone */
const LEVEL: Record<Level, { label: string; icon: LucideIcon; cls: string; rgb: string }> = {
  ok: { label: 'Healthy', icon: CircleCheck, cls: 'bg-mint text-brand', rgb: 'rgb(var(--brand))' },
  watch: { label: 'Watch', icon: Eye, cls: 'bg-warn-bg text-warn', rgb: 'rgb(var(--warn))' },
  act: { label: 'Act now', icon: AlertTriangle, cls: 'bg-alarm-bg text-alarm', rgb: 'rgb(var(--alarm))' },
}
const RANK: Record<Level, number> = { act: 0, watch: 1, ok: 2 }

/** Short names for the 8 checks, for tight spaces */
const SHORT: Record<string, string> = {
  imbalance: 'Current imbalance',
  vimb: 'Voltage imbalance',
  load: 'Load',
  thdi: 'Harmonics',
  pf: 'Power factor',
  drift: 'Energy drift',
  trips: 'Trips',
  service: 'Service',
}

const fmtVal = (key: string, v: number, unit: string) => `${fmt(v, key === 'pf' ? 2 : Number.isInteger(v) ? 0 : 1)}${unit}`
const indOf = (key?: string) => INDICATORS.find((i) => i.key === key)

/** The check that best explains a machine's state */
function keyOf(h: HealthRecord): string | undefined {
  if (h.trendKey) return h.trendKey
  return INDICATORS.find((i) => h.levels[i.key] === 'act')?.key ?? INDICATORS.find((i) => h.levels[i.key] === 'watch')?.key
}

/** 0 = perfect, 0.66 = watch limit, 1 = act limit (for the radar) */
function stress(ind: Indicator, v: number | null) {
  if (v == null) return 0
  const d = ind.lowerIsWorse ? 1 - v : v
  const w = ind.lowerIsWorse ? 1 - ind.watch : ind.watch
  const a = ind.lowerIsWorse ? 1 - ind.act : ind.act
  if (d <= w) return Math.max(0, 0.66 * (d / w))
  if (a <= w) return 1.05
  return Math.min(1.25, 0.66 + 0.34 * ((d - w) / (a - w)))
}

const byRisk = (a: HealthRecord, b: HealthRecord) => RANK[a.level] - RANK[b.level] || a.score - b.score

/* ------------------------------ anomaly detection ------------------------------ */

interface Anomaly {
  /** Expected range, learned from the machine's own first two weeks */
  lo: number
  hi: number
  /** Day index (0–41) when the trend left that range and stayed out */
  start: number
  daysAgo: number
  /** Day it then crossed the limit it reached (act if it got there, else watch) */
  limitDay?: number
  limitKind?: 'act' | 'watch'
  /** Days between "unusual" and "over the limit": the early warning */
  lead?: number
}

const BASE_DAYS = 14

/**
 * "Unusual for this machine": the 6-week trend leaves the range of its own
 * first two weeks (mean ± 3σ, at least ±5% of the act limit) and stays out
 * for 3 days. Service hours are a counter, not a signal, so they are skipped.
 */
function anomalyOf(h: HealthRecord): Anomaly | null {
  const ind = indOf(h.trendKey)
  const d = h.trend
  if (!ind || !d || ind.key === 'service') return null
  const base = d.slice(0, BASE_DAYS)
  const mean = base.reduce((a, v) => a + v, 0) / base.length
  const sd = Math.sqrt(base.reduce((a, v) => a + (v - mean) ** 2, 0) / base.length)
  const half = Math.max(3 * sd, 0.05 * Math.abs(ind.act))
  const lo = mean - half
  const hi = mean + half
  const out = (v: number) => v < lo || v > hi

  let start = -1
  for (let i = BASE_DAYS; i < d.length; i++) {
    if (d.slice(i, i + 3).every(out)) {
      start = i
      break
    }
  }
  if (start < 0) return null

  const crosses = (lim: number) => d.findIndex((v) => (ind.lowerIsWorse ? v < lim : v > lim))
  const actDay = crosses(ind.act)
  const watchDay = crosses(ind.watch)
  const [limitDay, limitKind] = actDay >= start ? [actDay, 'act' as const] : watchDay >= start ? [watchDay, 'watch' as const] : [undefined, undefined]
  return { lo, hi, start, daysAgo: d.length - 1 - start, limitDay, limitKind, lead: limitDay != null ? limitDay - start : undefined }
}

const ANOMALY: Record<string, Anomaly | null> = Object.fromEntries(HEALTH_LIST.map((h) => [h.id, anomalyOf(h)]))
const LEADS = Object.values(ANOMALY).flatMap((a) => (a?.lead != null ? [a.lead] : []))
const AVG_LEAD = LEADS.length ? Math.round(LEADS.reduce((a, v) => a + v, 0) / LEADS.length) : 0

/* ------------------------------ page ------------------------------ */

export function MachineHealth() {
  const [params, setParams] = useSearchParams()
  const sel = params.get('m')
  const selH = sel ? HEALTH[sel] : undefined
  const [hot, setHot] = useState<string | null>(null)
  const pick = (id: string | null) => setParams(id ? { m: id } : {}, { replace: true })

  const counts = healthCounts()
  const act = HEALTH_LIST.filter((h) => h.level === 'act').sort(byRisk)
  const watch = HEALTH_LIST.filter((h) => h.level === 'watch').sort(byRisk)
  const avg = Math.round(HEALTH_LIST.reduce((s, h) => s + h.score, 0) / HEALTH_LIST.length)

  return (
    <div>
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        <h1 className="font-display font-bold text-[22px] sm:text-[26px]">Machine health</h1>
        <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-sunken text-[12px] font-semibold text-muted">
          <span className="w-2 h-2 rounded-full bg-brand" />
          <Activity size={13} /> 8 checks · every 5 s
        </span>
        {AVG_LEAD > 0 && (
          <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-mint text-brand text-[12px] font-semibold" title="Average days between spotting something unusual and the machine crossing its warning or danger limit">
            <ScanSearch size={13} /> Problems spotted <span className="num">{AVG_LEAD}</span> days early
          </span>
        )}
      </header>

      {/* Health in numbers */}
      <section className="grid grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] gap-3 mt-5 sm:mt-6">
        <FleetScore avg={avg} total={HEALTH_LIST.length} />
        <Stat level="ok" value={counts.ok} total={HEALTH_LIST.length} />
        <Stat level="watch" value={counts.watch} total={HEALTH_LIST.length} />
        <Stat level="act" value={counts.act} total={HEALTH_LIST.length} />
      </section>

      {/* Where + what to act on */}
      <section className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4 mt-4">
        <HealthMap sel={sel} hot={hot} onHot={setHot} onPick={pick} />
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-2 px-1">
            <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-alarm">Act now</span>
            <span className="num h-5 min-w-5 px-1.5 grid place-items-center rounded-full bg-alarm-bg text-alarm text-[11px] font-bold">{act.length}</span>
          </div>
          {act.map((h, i) => (
            <ActCard key={h.id} h={h} i={i} active={sel === h.id || hot === h.id} onHot={setHot} onPick={pick} />
          ))}
          {!act.length && (
            <div className="rounded-2xl border border-line bg-panel flex-1 grid place-items-center p-8 text-brand font-semibold">
              <span className="inline-flex items-center gap-2">
                <CircleCheck size={20} /> Nothing to act on
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Watch list */}
      {watch.length > 0 && (
        <section className="mt-8">
          <SectionTitle title="Worth watching" count={watch.length} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {watch.map((h, i) => (
              <WatchRow key={h.id} h={h} i={i} active={sel === h.id || hot === h.id} onHot={setHot} onPick={pick} />
            ))}
          </div>
        </section>
      )}

      {/* The 8 checks for every flagged machine */}
      <section className="mt-8">
        <SectionTitle title="The 8 checks" count={act.length + watch.length} />
        <Matrix rows={[...act, ...watch]} sel={sel} onPick={pick} />
      </section>

      {/* Every machine */}
      <section className="mt-8">
        <SectionTitle title="Every machine" count={MACHINES.length} />
        <ByHall sel={sel} onPick={pick} />
      </section>

      <FixNext count={act.length + watch.length} />

      {selH && <Drawer key={selH.id} h={selH} onClose={() => pick(null)} />}
    </div>
  )
}

/* ------------------------------ pieces ------------------------------ */

function LevelBadge({ level, big }: { level: Level; big?: boolean }) {
  const L = LEVEL[level]
  return (
    <span className={clsx('shrink-0 inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide', L.cls, big ? 'h-7 px-3 text-[12px]' : 'h-6 px-2.5 text-[11px]')}>
      <L.icon size={big ? 13 : 12} strokeWidth={2.5} />
      {L.label}
    </span>
  )
}

/** Unusual for this machine (its own history), as opposed to over a fixed limit */
function AnomalyBadge({ a }: { a: Anomaly }) {
  return (
    <span
      title={`Left its normal range ${a.daysAgo} days ago`}
      className="shrink-0 inline-flex items-center gap-1 h-6 px-2.5 rounded-full border border-brand/40 text-brand text-[11px] font-bold uppercase tracking-wide"
    >
      <ScanSearch size={12} strokeWidth={2.5} /> Unusual
    </span>
  )
}

/** Health score out of 100 as an animated ring */
function ScoreRing({ score, level, size = 64 }: { score: number; level: Level; size?: number }) {
  const on = useMounted()
  const v = useCountUp(score)
  const R = 26
  const C = 2 * Math.PI * R
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title="Health score out of 100">
      <svg viewBox="0 0 68 68" className="w-full h-full -rotate-90">
        <circle cx="34" cy="34" r={R} fill="none" stroke="rgb(var(--sunken))" strokeWidth="6" />
        <circle
          cx="34"
          cy="34"
          r={R}
          fill="none"
          stroke={LEVEL[level].rgb}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={on ? C * (1 - score / 100) : C}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-display font-bold num" style={{ fontSize: size * 0.3 }}>
        {Math.round(v)}
      </div>
    </div>
  )
}

function FleetScore({ avg, total }: { avg: number; total: number }) {
  const level: Level = avg >= 85 ? 'ok' : avg >= 70 ? 'watch' : 'act'
  return (
    <div className="col-span-2 lg:col-span-1 rounded-2xl border border-line bg-panel p-3.5 sm:p-4 flex items-center gap-4 min-w-0">
      <ScoreRing score={avg} level={level} size={88} />
      <div className="min-w-0">
        <div className="text-[12px] text-muted">Average health</div>
        <div className="font-display font-semibold text-[15px] mt-1 flex items-center gap-1.5">
          <HeartPulse size={15} className="text-brand" /> {total} machines
        </div>
        <div className="text-[12px] text-faint mt-0.5 num">{fmt(total * 8)} checks running</div>
      </div>
    </div>
  )
}

function Stat({ level, value, total }: { level: Level; value: number; total: number }) {
  const on = useMounted()
  const v = useCountUp(value)
  const L = LEVEL[level]
  return (
    <div className="rounded-2xl border border-line bg-panel p-3.5 sm:p-4 flex flex-col justify-between gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <span className={clsx('w-8 h-8 rounded-lg grid place-items-center', L.cls)}>
          <L.icon size={16} />
        </span>
        <span className="text-[11px] num text-faint">{fmt((value / total) * 100)}%</span>
      </div>
      <div>
        <div className="num font-display font-bold text-[28px] sm:text-[34px] leading-none tracking-tight" style={{ color: L.rgb }}>
          {fmt(v)}
        </div>
        <div className="text-[12px] text-muted mt-1.5">{L.label}</div>
      </div>
      <div className="h-1.5 rounded-full bg-sunken overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: on ? `${Math.max(2, (value / total) * 100)}%` : 0, background: L.rgb }} />
      </div>
    </div>
  )
}

/** Small trend line with the act limit dashed in red */
function MiniTrend({ data, ind, level, anomaly, className }: { data: number[]; ind: Indicator; level: Level; anomaly?: Anomaly | null; className?: string }) {
  const on = useMounted()
  const clip = `mt${useId().replace(/:/g, '')}`
  const W = 100
  const H = 40
  const max = Math.max(ind.act * 1.15, ...data)
  const y = (v: number) => H - 2 - (Math.max(0, v) / max) * (H - 4)
  const x = (i: number) => (i / (data.length - 1)) * W
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      {/* Drawn left to right on load */}
      <clipPath id={clip}>
        <rect x="0" y="0" width={W} height={H} style={{ transform: on ? 'scaleX(1)' : 'scaleX(0)', transformOrigin: '0 0', transition: 'transform 1.4s ease-out' }} />
      </clipPath>
      {/* Expected range, and the day it was left */}
      {anomaly && (
        <>
          <rect x="0" y={y(anomaly.hi)} width={W} height={Math.max(1, y(anomaly.lo) - y(anomaly.hi))} fill="rgb(var(--brand) / 0.14)" />
          <line x1={x(anomaly.start)} x2={x(anomaly.start)} y1="0" y2={H} stroke="rgb(var(--brand))" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        </>
      )}
      <line x1="0" x2={W} y1={y(ind.act)} y2={y(ind.act)} stroke="rgb(var(--alarm))" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.7" />
      <path d={line} clipPath={`url(#${clip})`} fill="none" stroke={LEVEL[level].rgb} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/* ------------------------------ health map ------------------------------ */

function HealthMap({ sel, hot, onHot, onPick }: { sel: string | null; hot: string | null; onHot: (id: string | null) => void; onPick: (id: string) => void }) {
  const fill = (l: Level) => (l === 'ok' ? 'rgb(var(--brand) / 0.22)' : LEVEL[l].rgb)
  const flagged = TILES.filter((t) => HEALTH[t.id] && HEALTH[t.id].level !== 'ok')
  const tag = hot ?? sel
  const tagTile = tag ? TILES.find((t) => t.id === tag) : undefined

  return (
    <div className="rise rounded-2xl border border-line bg-panel p-3 sm:p-4 flex flex-col min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">Health across the mill</span>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          {(['ok', 'watch', 'act'] as Level[]).map((l) => {
            const L = LEVEL[l]
            return (
              <span key={l} className="inline-flex items-center gap-1">
                <L.icon size={12} style={{ color: L.rgb }} /> {L.label}
              </span>
            )
          })}
        </div>
      </div>

      <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="w-full flex-1 mt-3 min-h-[200px] sm:min-h-[280px]" preserveAspectRatio="xMidYMid meet" onMouseLeave={() => onHot(null)}>
        {HALL_BOXES.map((h) => (
          <g key={h.id}>
            <rect x={h.x} y={h.y} width={h.w} height={h.h} rx={18} fill="rgb(var(--sunken) / 0.45)" stroke="rgb(var(--line))" strokeWidth={2} />
            <text x={h.x + 18} y={h.y + 34} fill="rgb(var(--faint))" fontSize={22} fontWeight={600}>
              {h.title}
            </text>
          </g>
        ))}

        {/* Pings under flagged machines */}
        {flagged.map((t) => (
          <circle
            key={`p-${t.id}`}
            cx={t.x + t.w / 2}
            cy={t.y + t.h / 2}
            r={Math.min(Math.max(t.w, t.h), 34) * 0.9}
            fill={LEVEL[HEALTH[t.id].level].rgb}
            opacity={0.25}
            pointerEvents="none"
          />
        ))}

        {TILES.map((t) => {
          const h = HEALTH[t.id]
          if (!h) return null
          const on = t.id === sel || t.id === hot
          const common = {
            fill: fill(h.level),
            stroke: on ? 'rgb(var(--fg))' : h.level === 'ok' ? 'none' : 'rgb(var(--bg))',
            strokeWidth: on ? 4 : 2,
            className: 'cursor-pointer',
            onClick: () => onPick(t.id),
            onMouseEnter: () => onHot(t.id),
          }
          return t.shape === 'circle' ? (
            <circle key={t.id} cx={t.x + t.w / 2} cy={t.y + t.h / 2} r={t.w / 2 + (h.level === 'ok' ? 0 : 2)} {...common} />
          ) : (
            <rect key={t.id} x={t.x} y={t.y} width={t.w} height={t.h} rx={4} {...common} />
          )
        })}

        {/* Name tag for the machine hovered or opened */}
        {tag && tagTile && (
          <g pointerEvents="none">
            {(() => {
              const label = `${machineById[tag].name} · ${HEALTH[tag].score}`
              const w = label.length * 12.5 + 28
              const cx = tagTile.x + tagTile.w / 2
              const x = Math.min(Math.max(cx - w / 2, 8), VIEW.w - w - 8)
              const y = Math.max(tagTile.y - 58, 8)
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

/* ------------------------------ act now / watch ------------------------------ */

function ActCard({ h, i, active, onHot, onPick }: { h: HealthRecord; i: number; active: boolean; onHot: (id: string | null) => void; onPick: (id: string) => void }) {
  const m = machineById[h.id]
  const ind = indOf(keyOf(h))
  const an = ANOMALY[h.id]
  const v = ind ? h.values[ind.key] : null
  return (
    <button
      onClick={() => onPick(h.id)}
      onMouseEnter={() => onHot(h.id)}
      onMouseLeave={() => onHot(null)}
      style={{ animationDelay: `${i * 80}ms`, background: 'radial-gradient(120% 120% at 0% 0%, rgb(var(--alarm) / 0.12), rgb(var(--panel)) 60%)' }}
      className={clsx(
        'rise focus-ring text-left rounded-2xl border border-alarm/40 p-4 flex items-center gap-4 min-w-0 transition-shadow',
        active && 'ring-2 ring-brand ring-offset-2 ring-offset-bg',
      )}
    >
      <ScoreRing score={h.score} level={h.level} size={64} />
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold text-[16px] truncate">{m.name}</div>
        <div className="text-[12px] text-muted truncate">{hallById[m.hallId].name}</div>
        {ind && v != null && (
          <div className="flex items-baseline gap-2 mt-2 min-w-0">
            <span className="num font-display font-bold text-[22px] leading-none text-alarm">{fmtVal(ind.key, v, ind.unit)}</span>
            <span className="text-[12px] text-muted truncate">{ind.label}</span>
          </div>
        )}
        {an && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[11.5px] text-muted min-w-0">
            <ScanSearch size={12} className="text-brand shrink-0" />
            <span className="truncate">
              Unusual {an.daysAgo} d ago
              {an.lead != null && (
                <>
                  {' · '}
                  <b className="text-brand num">{an.lead} d early</b>
                </>
              )}
            </span>
          </div>
        )}
      </div>
      {ind && h.trend && <MiniTrend data={h.trend} ind={ind} level={h.level} anomaly={an} className="w-20 sm:w-28 h-12 shrink-0" />}
    </button>
  )
}

function WatchRow({ h, i, active, onHot, onPick }: { h: HealthRecord; i: number; active: boolean; onHot: (id: string | null) => void; onPick: (id: string) => void }) {
  const m = machineById[h.id]
  const ind = indOf(keyOf(h))
  const v = ind ? h.values[ind.key] : null
  return (
    <button
      onClick={() => onPick(h.id)}
      onMouseEnter={() => onHot(h.id)}
      onMouseLeave={() => onHot(null)}
      style={{ animationDelay: `${i * 50}ms` }}
      className={clsx('rise focus-ring text-left rounded-2xl border border-line bg-panel p-3.5 flex items-center gap-3.5 min-w-0 hover:border-warn/50 transition-colors', active && 'ring-2 ring-brand ring-offset-2 ring-offset-bg')}
    >
      <ScoreRing score={h.score} level={h.level} size={46} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-[14px] truncate">{m.name}</span>
          {ANOMALY[h.id] && (
            <span title={`Unusual for this machine since ${ANOMALY[h.id]!.daysAgo} days ago`} className="text-brand shrink-0">
              <ScanSearch size={13} />
            </span>
          )}
        </div>
        {ind && v != null && (
          <div className="flex items-baseline gap-1.5 min-w-0 text-[12px]">
            <span className="num font-bold text-warn">{fmtVal(ind.key, v, ind.unit)}</span>
            <span className="text-muted truncate">{SHORT[ind.key]}</span>
          </div>
        )}
      </div>
      {ind && h.trend && <MiniTrend data={h.trend} ind={ind} level={h.level} anomaly={ANOMALY[h.id]} className="w-20 h-9 shrink-0" />}
    </button>
  )
}

/* ------------------------------ 8-check matrix ------------------------------ */

function Matrix({ rows, sel, onPick }: { rows: HealthRecord[]; sel: string | null; onPick: (id: string) => void }) {
  return (
    <div className="rise rounded-2xl border border-line bg-panel overflow-x-auto">
      <table className="w-full min-w-[860px] text-[12px] border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-panel text-left font-semibold text-faint px-4 py-3">Machine</th>
            {INDICATORS.map((i) => (
              <th key={i.key} className="px-1.5 py-3 font-semibold text-faint text-center whitespace-nowrap" title={i.plain}>
                {SHORT[i.key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => {
            const L = LEVEL[h.level]
            return (
              <tr key={h.id} onClick={() => onPick(h.id)} className={clsx('cursor-pointer group', sel === h.id && 'outline outline-2 outline-brand -outline-offset-2')}>
                <td className="sticky left-0 z-10 bg-panel group-hover:bg-sunken border-t border-line px-4 py-1.5">
                  <span className="flex items-center gap-2 font-semibold text-[13px] whitespace-nowrap">
                    <L.icon size={14} style={{ color: L.rgb }} />
                    {machineById[h.id].name}
                    {ANOMALY[h.id] && (
                      <span title="Unusual for this machine" className="text-brand">
                        <ScanSearch size={13} />
                      </span>
                    )}
                  </span>
                </td>
                {INDICATORS.map((i) => {
                  const l = h.levels[i.key]
                  const v = h.values[i.key]
                  return (
                    <td key={i.key} className="border-t border-line p-1.5 group-hover:bg-sunken/40">
                      <div
                        title={`${i.label}: ${v == null ? 'not measured' : fmtVal(i.key, v, i.unit)}`}
                        className={clsx(
                          'h-9 rounded-lg grid place-items-center num font-semibold',
                          l === 'act' ? 'bg-alarm text-bg' : l === 'watch' ? 'bg-warn text-bg' : l === 'ok' ? 'bg-sunken text-muted' : 'text-faint',
                        )}
                      >
                        {v == null ? '–' : fmtVal(i.key, v, i.unit)}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------ every machine by hall ------------------------------ */

function ByHall({ sel, onPick }: { sel: string | null; onPick: (id: string) => void }) {
  const fill = (l: Level) => (l === 'ok' ? 'rgb(var(--brand) / 0.35)' : LEVEL[l].rgb)
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {HALLS.map((hall, k) => {
        const ms = MACHINES.filter((m) => m.hallId === hall.id)
        if (!ms.length) return null
        const flagged = ms.filter((m) => HEALTH[m.id].level !== 'ok').length
        return (
          <div key={hall.id} className="rise rounded-2xl border border-line bg-panel p-4 min-w-0" style={{ animationDelay: `${k * 50}ms` }}>
            <div className="flex items-center justify-between gap-3 text-[13px] mb-3">
              <span className="font-semibold truncate">{hall.name}</span>
              {flagged ? (
                <span className="inline-flex items-center gap-1 text-warn font-semibold shrink-0">
                  <Eye size={13} /> {flagged}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-brand shrink-0">
                  <CircleCheck size={13} /> All healthy
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {ms.map((m) => {
                const h = HEALTH[m.id]
                return (
                  <button
                    key={m.id}
                    title={`${m.name}: ${LEVEL[h.level].label} (${h.score}/100)`}
                    onClick={() => onPick(m.id)}
                    className={clsx('focus-ring w-5 h-5 rounded-[5px] transition-transform hover:scale-125', sel === m.id && 'ring-2 ring-fg ring-offset-1 ring-offset-panel')}
                    style={{ background: fill(h.level) }}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FixNext({ count }: { count: number }) {
  if (!count) return null
  return (
    <div
      className="mt-8 rounded-2xl border border-line p-5 flex items-center gap-4"
      style={{ background: 'radial-gradient(120% 120% at 0% 0%, rgb(var(--brand) / 0.12), rgb(var(--panel)) 60%)' }}
    >
      <span className="w-12 h-12 rounded-xl bg-mint text-brand grid place-items-center shrink-0">
        <Lightbulb size={22} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">AI advisor</div>
        <div className="font-display font-semibold text-[16px] leading-snug mt-0.5">
          <span className="num">{count}</span> checks ready for your team
        </div>
      </div>
      <Link to="/advisor#condenser" className="focus-ring inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-brand text-bg text-[13px] font-bold hover:brightness-110 shrink-0">
        <span className="hidden sm:inline">See jobs</span> <ArrowRight size={15} />
      </Link>
    </div>
  )
}

/* ------------------------------ analysis drawer ------------------------------ */

function Drawer({ h, onClose }: { h: HealthRecord; onClose: () => void }) {
  const m = machineById[h.id]
  const ind = indOf(h.trendKey)
  const an = ANOMALY[h.id]

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
        aria-label={`Health analysis: ${m.name}`}
        className="absolute inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl sm:rounded-none sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(560px,100vw)] sm:max-h-none bg-panel border-t sm:border-t-0 sm:border-l border-line shadow-pop overflow-y-auto sheet-in sm:drawer-in"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-panel/95 backdrop-blur border-b border-line px-5 py-4 flex items-center gap-4">
          <ScoreRing score={h.score} level={h.level} size={56} />
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-[19px] leading-tight truncate">{m.name}</div>
            <div className="flex items-center gap-2 mt-1 min-w-0">
              <LevelBadge level={h.level} />
              {an && <AnomalyBadge a={an} />}
              <span className="text-[12px] text-muted truncate hidden sm:inline">{hallById[m.hallId].name}</span>
            </div>
          </div>
          <button onClick={onClose} className="focus-ring w-9 h-9 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-sunken shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {h.headline && (
            <p className="flex items-start gap-2 text-[14px] font-semibold leading-snug">
              <span className="flex-1">{h.headline}</span>
              {h.note && (
                <span title={h.note} aria-label={h.note} tabIndex={0} className="focus-ring rounded-full text-faint hover:text-fg cursor-help mt-0.5 shrink-0">
                  <Info size={15} />
                </span>
              )}
            </p>
          )}

          {an && h.trend && <CaughtEarly a={an} days={h.trend.length} />}

          <Radar h={h} />

          {ind && h.trend && (
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint mb-2">{ind.label} · 6 weeks</div>
              <TrendChart data={h.trend} ind={ind} level={h.level} anomaly={an} />
            </div>
          )}

          {/* All 8 checks */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {INDICATORS.map((i) => {
              const l = h.levels[i.key]
              const v = h.values[i.key]
              const L = l ? LEVEL[l] : null
              return (
                <div
                  key={i.key}
                  title={i.plain}
                  className={clsx('rounded-xl border px-3 py-2.5 min-w-0', l === 'act' ? 'border-alarm/50 bg-alarm-bg' : l === 'watch' ? 'border-warn/50 bg-warn-bg' : 'border-line', !l && 'opacity-50')}
                >
                  <div className="flex items-center justify-between gap-1 text-[11px] text-muted">
                    <span className="truncate">{SHORT[i.key]}</span>
                    {L && <L.icon size={12} style={{ color: L.rgb }} className="shrink-0" />}
                  </div>
                  <div className="num font-display font-bold text-[17px] mt-0.5" style={L && l !== 'ok' ? { color: L.rgb } : undefined}>
                    {v == null ? '–' : fmtVal(i.key, v, i.unit)}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to={`/map?m=${m.id}`} className="focus-ring inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-sunken text-[13px] font-semibold hover:brightness-110">
              <MapPin size={15} /> Map
            </Link>
            {h.level !== 'ok' && (
              <Link to="/advisor" className="focus-ring inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-brand text-bg text-[13px] font-bold hover:brightness-110">
                <Lightbulb size={15} /> What to do
              </Link>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

/** How early the problem was spotted: unusual → over the limit → today, on one line */
function CaughtEarly({ a, days }: { a: Anomaly; days: number }) {
  const on = useMounted()
  const last = days - 1
  const pos = (i: number) => `${(i / last) * 100}%`
  const limitAgo = a.limitDay != null ? last - a.limitDay : null
  return (
    <div className="rounded-xl border border-brand/30 p-4" style={{ background: 'radial-gradient(120% 140% at 0% 0%, rgb(var(--brand) / 0.12), transparent 60%)' }}>
      <div className="flex items-baseline gap-2">
        {a.lead != null ? (
          <>
            <span className="num font-display font-bold text-[32px] leading-none text-brand">{a.lead}</span>
            <span className="text-[13px] text-muted">days early warning</span>
          </>
        ) : (
          <>
            <span className="num font-display font-bold text-[32px] leading-none text-brand">{a.daysAgo}</span>
            <span className="text-[13px] text-muted">days since spotted · danger limit not reached</span>
          </>
        )}
      </div>

      {/* Six weeks on one line */}
      <div className="relative h-14 mt-4 mx-2">
        <span className="absolute left-0 right-0 top-[11px] h-[3px] rounded-full bg-sunken" />
        <span
          className="absolute top-[11px] h-[3px] rounded-full bg-brand"
          style={{ left: pos(a.start), width: on ? `${(((a.limitDay ?? last) - a.start) / last) * 100}%` : 0, transition: 'width 1.2s cubic-bezier(.2,.8,.2,1) .2s' }}
        />
        <Mark at={pos(a.start)} icon={ScanSearch} color="rgb(var(--brand))" label="Unusual" sub={`${a.daysAgo} d ago`} />
        {a.limitDay != null && limitAgo != null && (
          <Mark at={pos(a.limitDay)} icon={FlagTriangleRight} color={a.limitKind === 'act' ? 'rgb(var(--alarm))' : 'rgb(var(--warn))'} label={a.limitKind === 'act' ? 'Danger limit' : 'Warning limit'} sub={limitAgo ? `${limitAgo} d ago` : 'today'} />
        )}
        {(limitAgo == null || limitAgo >= 6) && <Mark at="100%" color="rgb(var(--fg))" label="Today" />}
      </div>
    </div>
  )
}

function Mark({ at, icon: Icon, color, label, sub }: { at: string; icon?: LucideIcon; color: string; label: string; sub?: string }) {
  return (
    <span className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: at }}>
      <span className="w-6 h-6 rounded-full grid place-items-center border-2 bg-panel" style={{ borderColor: color, color }}>
        {Icon ? <Icon size={12} strokeWidth={2.5} /> : <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
      </span>
      <span className="text-[10.5px] font-semibold mt-1 whitespace-nowrap" style={{ color }}>
        {label}
      </span>
      {sub && <span className="text-[10px] text-faint num whitespace-nowrap">{sub}</span>}
    </span>
  )
}

/** The 8 checks on a radar: inner ring = normal, amber = watch limit, red = act limit */
function Radar({ h }: { h: HealthRecord }) {
  const on = useMounted()
  const N = INDICATORS.length
  const cx = 160
  const cy = 130
  const R = 88
  const pt = (i: number, r: number) => {
    const a = ((-90 + (i * 360) / N) * Math.PI) / 180
    return [cx + R * r * Math.cos(a), cy + R * r * Math.sin(a)] as const
  }
  const ring = (r: number) => INDICATORS.map((_, i) => pt(i, r).join(',')).join(' ')
  const s = INDICATORS.map((ind) => stress(ind, h.values[ind.key]))
  const poly = s.map((v, i) => pt(i, Math.max(0.04, v)).join(',')).join(' ')
  const color = LEVEL[h.level].rgb

  return (
    <svg viewBox="-50 0 420 262" className="w-full max-w-[480px] mx-auto block" role="img" aria-label="The 8 checks against their limits">
      {/* Spokes and rings */}
      {INDICATORS.map((_, i) => {
        const [x, y] = pt(i, 1.12)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgb(var(--line))" strokeWidth="1" />
      })}
      <polygon points={ring(0.33)} fill="none" stroke="rgb(var(--line))" strokeWidth="1" />
      <polygon points={ring(0.66)} fill="rgb(var(--warn) / 0.05)" stroke="rgb(var(--warn))" strokeWidth="1" strokeDasharray="4 4" opacity="0.8" />
      <polygon points={ring(1)} fill="none" stroke="rgb(var(--alarm))" strokeWidth="1" strokeDasharray="4 4" opacity="0.8" />

      {/* This machine */}
      <g style={{ transform: on ? 'scale(1)' : 'scale(0.2)', opacity: on ? 1 : 0, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 0.9s cubic-bezier(.2,.8,.2,1), opacity 0.6s' }}>
        <polygon points={poly} fill={color} fillOpacity="0.22" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {INDICATORS.map((ind, i) => {
          const l = h.levels[ind.key]
          if (!l) return null
          const [x, y] = pt(i, Math.max(0.04, s[i]))
          return <circle key={ind.key} cx={x} cy={y} r={l === 'ok' ? 2.5 : 4.5} fill={LEVEL[l].rgb} stroke="rgb(var(--panel))" strokeWidth="1.5" />
        })}
      </g>

      {/* Labels */}
      {INDICATORS.map((ind, i) => {
        const [x, y] = pt(i, 1.3)
        const l = h.levels[ind.key]
        const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end'
        return (
          <text key={ind.key} x={x} y={y + 4} textAnchor={anchor} fontSize="10.5" fontWeight={l && l !== 'ok' ? 700 : 500} fill={l && l !== 'ok' ? LEVEL[l].rgb : l ? 'rgb(var(--muted))' : 'rgb(var(--faint))'}>
            {SHORT[ind.key]}
          </text>
        )
      })}
    </svg>
  )
}

/** 6-week trend with the watch and act zones shaded */
function TrendChart({ data, ind, level, anomaly }: { data: number[]; ind: Indicator; level: Level; anomaly?: Anomaly | null }) {
  const on = useMounted()
  const W = 340
  const H = anomaly ? 196 : 170
  const L = 36
  const B = 22
  const T = anomaly ? 34 : 8
  const max = Math.max(ind.act * 1.2, ...data)
  const x = (i: number) => L + (i / (data.length - 1)) * (W - L - 6)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1)} ${H - B} L${x(0)} ${H - B} Z`
  const color = LEVEL[level].rgb
  const zones = ind.lowerIsWorse
    ? { act: [y(ind.act), H - B], watch: [y(ind.watch), y(ind.act)] }
    : { act: [T, y(ind.act)], watch: [y(ind.act), y(ind.watch)] }
  const last = data[data.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${ind.label} over 6 weeks`}>
      <defs>
        <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.3" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={L} y={zones.act[0]} width={W - L - 6} height={Math.max(0, zones.act[1] - zones.act[0])} fill="rgb(var(--alarm) / 0.08)" />
      <rect x={L} y={zones.watch[0]} width={W - L - 6} height={Math.max(0, zones.watch[1] - zones.watch[0])} fill="rgb(var(--warn) / 0.08)" />
      {[
        { v: ind.watch, c: 'rgb(var(--warn))' },
        { v: ind.act, c: 'rgb(var(--alarm))' },
      ].map((g) => (
        <g key={g.c}>
          <line x1={L} x2={W - 6} y1={y(g.v)} y2={y(g.v)} stroke={g.c} strokeDasharray="4 4" strokeWidth="1" opacity="0.8" />
          <text x={L - 6} y={y(g.v) + 3.5} textAnchor="end" fontSize="10" fill={g.c} className="num">
            {fmt(g.v, ind.key === 'pf' ? 2 : 0)}
            {ind.unit}
          </text>
        </g>
      ))}
      <line x1={L} x2={W - 6} y1={H - B} y2={H - B} stroke="rgb(var(--line))" />

      {/* Anomaly: the machine's own expected range, the day it left it, and the early-warning span */}
      {anomaly && (
        <g style={{ opacity: on ? 1 : 0, transition: 'opacity .6s ease 1.2s' }}>
          <rect x={L} y={y(anomaly.hi)} width={W - L - 6} height={Math.max(2, y(Math.max(0, anomaly.lo)) - y(anomaly.hi))} fill="rgb(var(--brand) / 0.13)" />
          <text x={L + 4} y={y(anomaly.hi) - 4} fontSize="9.5" fontWeight="600" fill="rgb(var(--brand))">
            Expected
          </text>
          <line x1={x(anomaly.start)} x2={x(anomaly.start)} y1={T - 6} y2={H - B} stroke="rgb(var(--brand))" strokeDasharray="3 3" strokeWidth="1.2" />
          {anomaly.limitDay != null && anomaly.lead != null && (
            <g>
              <line x1={x(anomaly.start)} x2={x(anomaly.limitDay)} y1={12} y2={12} stroke="rgb(var(--brand))" strokeWidth="2" />
              <line x1={x(anomaly.start)} x2={x(anomaly.start)} y1={7} y2={17} stroke="rgb(var(--brand))" strokeWidth="2" />
              <line x1={x(anomaly.limitDay)} x2={x(anomaly.limitDay)} y1={7} y2={17} stroke="rgb(var(--brand))" strokeWidth="2" />
              <text x={(x(anomaly.start) + x(anomaly.limitDay)) / 2} y={28} textAnchor="middle" fontSize="10" fontWeight="700" fill="rgb(var(--brand))">
                {anomaly.lead} days early
              </text>
            </g>
          )}
        </g>
      )}

      <path d={area} fill="url(#trend-fill)" style={{ opacity: on ? 1 : 0, transition: 'opacity 1s ease 0.6s' }} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={on ? 0 : 1}
        style={{ transition: 'stroke-dashoffset 1.6s ease-out' }}
      />
      <circle cx={x(data.length - 1)} cy={y(last)} r="4.5" fill={color} stroke="rgb(var(--panel))" strokeWidth="2" style={{ opacity: on ? 1 : 0, transition: 'opacity .3s ease 1.5s' }} />
      {anomaly && (
        <g style={{ opacity: on ? 1 : 0, transition: 'opacity .4s ease 1.3s' }}>
          <circle cx={x(anomaly.start)} cy={y(data[anomaly.start])} r="9" fill="rgb(var(--brand))" opacity={0.25} />
          <circle cx={x(anomaly.start)} cy={y(data[anomaly.start])} r="4.5" fill="rgb(var(--brand))" stroke="rgb(var(--panel))" strokeWidth="2" />
        </g>
      )}
      {['6 wk ago', '3 wk', 'Today'].map((t, i) => (
        <text key={t} x={L + (i / 2) * (W - L - 6)} y={H - 6} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="10" fill="rgb(var(--faint))">
          {t}
        </text>
      ))}
    </svg>
  )
}
