// Mill today: the opening screen. A big load gauge, grid vs solar, today's
// load curve, the halls, health, the top fixes and what is stopped now. Every
// value comes from the same live model as the other pages; each card links on.
import clsx from 'clsx'
import { AlertTriangle, ArrowRight, CircleCheck, Eye, Package, Power, ShieldAlert, Sun, Timer, Zap, type LucideIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HALLS, MACHINES } from '../data/din'
import { short, stopRgb, useCountUp, useMounted } from '../components/ui/kit'
import { fmt } from '../lib/format'
import { DT_MACHINES, monthStops, stoppedNow, sum, todayStops } from '../sim/downtime'
import { DAY_CURVE } from '../sim/engine'
import { HEALTH_LIST, healthCounts } from '../sim/health'
import { INSIGHTS } from '../sim/insights'
import { TRACK } from '../sim/tracking'
import { useLive } from '../sim/useLive'
import { useApp } from '../store/app'

const PEAK = Math.max(...DAY_CURVE.map((s) => s.load))
const kwParts = (kw: number) => (kw >= 1000 ? { v: fmt(kw / 1000, 2), u: 'MW' } : { v: fmt(kw), u: 'kW' })

export function Overview() {
  const live = useLive()
  const now = useApp((s) => s.now)
  const entries = useApp((s) => s.dtEntries)
  const minute = Math.floor(now / 60_000)

  const stops = useMemo(() => monthStops(now, entries), [minute, entries, live.t]) // eslint-disable-line react-hooks/exhaustive-deps
  const today = todayStops(stops, now)
  const down = stoppedNow(stops).sort((a, b) => b.overMin - a.overMin || b.minutes - a.minutes)
  const running = DT_MACHINES.filter((m) => ['running', 'attention'].includes(live.machines[m.id].status)).length
  const kgToday = sum(today, (s) => s.kg)
  const hc = healthCounts()
  const avgHealth = Math.round(HEALTH_LIST.reduce((s, h) => s + h.score, 0) / HEALTH_LIST.length)
  const { load, grid, solar } = live.mix
  const fixes = [...INSIGHTS].sort((a, b) => Number(b.kind === 'downtime') - Number(a.kind === 'downtime') || (b.kgMonth ?? 0) - (a.kgMonth ?? 0)).slice(0, 3)
  const halls = HALLS.map((h) => {
    const ms = MACHINES.filter((m) => m.hallId === h.id)
    return { id: h.id, name: h.name, kw: ms.reduce((s, m) => s + live.machines[m.id].kw, 0), stopped: ms.filter((m) => live.machines[m.id].status === 'stopped').length }
  })
    .filter((h) => h.kw > 0 || h.stopped > 0)
    .sort((a, b) => b.kw - a.kw)

  return (
    <div>
      <header className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        <h1 className="font-display font-bold text-[22px] sm:text-[26px]">Mill today</h1>
        <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-sunken text-[12px] font-semibold text-muted">
          <span className="w-2 h-2 rounded-full bg-brand" /> Live
        </span>
      </header>

      {/* Hero + sources */}
      <section className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 mt-5 sm:mt-6">
        <Hero load={load} running={running} total={DT_MACHINES.length} kgToday={kgToday} stopsToday={today.length} />
        <div className="grid grid-rows-[auto_minmax(0,1fr)] gap-4 min-w-0">
          <div className="grid grid-cols-2 gap-4">
            <SourceRing label="Grid" icon={Zap} share={load ? grid / load : 0} kw={grid} color="#3D7FC4" />
            <SourceRing label="Solar" icon={Sun} share={load ? solar / load : 0} kw={solar} color="#E0A100" />
          </div>
          <Card title="Load today" to="/map" delay={120}>
            <LoadCurve hour={live.hour} />
          </Card>
        </div>
      </section>

      {/* The other layers at a glance */}
      <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
        <Card title="Halls" to="/map" delay={160}>
          <div className="space-y-2.5">
            {halls.map((h) => (
              <HallBar key={h.id} name={h.name} kw={h.kw} max={halls[0]?.kw || 1} stopped={h.stopped} />
            ))}
          </div>
        </Card>

        <Card title="Stopped now" to="/downtime" delay={200} badge={down.length ? { n: down.length, tone: 'alarm' } : undefined}>
          {down.length ? (
            <ul className="space-y-2.5">
              {down.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: stopRgb(s) }} />
                  <span className="flex-1 min-w-0 leading-tight">
                    <span className="block text-[13px] font-semibold truncate">{s.machine.name}</span>
                    <span className="block text-[11.5px] text-muted truncate">{s.reason?.label ?? 'No reason yet'}</span>
                  </span>
                  <span className={clsx('num text-[12.5px] font-semibold shrink-0', s.overMin > 0 ? 'text-alarm' : 'text-muted')}>{short(s.minutes)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={CircleCheck} text="Everything is running" />
          )}
        </Card>

        <Card title="Machine health" to="/health" delay={240}>
          <div className="flex items-center gap-4">
            <Ring value={avgHealth} max={100} color={avgHealth >= 85 ? 'rgb(var(--brand))' : 'rgb(var(--warn))'} size={84}>
              <span className="num font-display font-bold text-[22px] leading-none">{avgHealth}</span>
            </Ring>
            <div className="space-y-1.5 text-[12.5px] min-w-0">
              <Row icon={CircleCheck} rgb="rgb(var(--brand))" label="Healthy" n={hc.ok} />
              <Row icon={Eye} rgb="rgb(var(--warn))" label="Watch" n={hc.watch} />
              <Row icon={AlertTriangle} rgb="rgb(var(--alarm))" label="Act now" n={hc.act} />
            </div>
          </div>
        </Card>

        <Card title="Fix first" to="/advisor" delay={280}>
          <ul className="space-y-3">
            {fixes.map((i, n) => (
              <li key={i.id}>
                <Link to={`/advisor#${i.id}`} className="flex items-start gap-2.5 group">
                  <span className="num w-6 h-6 rounded-full bg-sunken text-[11px] font-bold text-muted grid place-items-center shrink-0">{n + 1}</span>
                  <span className="flex-1 min-w-0 leading-tight">
                    <span className="block text-[13px] font-semibold line-clamp-2 group-hover:text-brand transition-colors">{i.title}</span>
                    <span className="block text-[11.5px] mt-0.5">
                      {i.kgMonth ? (
                        <span className="text-alarm font-semibold num">{fmt(i.kgMonth)} kg / month</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-warn font-semibold">
                          <ShieldAlert size={11} /> Breakdown risk
                        </span>
                      )}
                      <span className="text-muted"> · {TRACK[i.id].owner}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  )
}

/* ------------------------------ hero ------------------------------ */

function Hero({ load, running, total, kgToday, stopsToday }: { load: number; running: number; total: number; kgToday: number; stopsToday: number }) {
  const on = useMounted()
  const v = useCountUp(load)
  const p = kwParts(v)
  const R = 92
  const C = 2 * Math.PI * R
  const ARC = 0.75 * C
  const frac = Math.min(1, load / (PEAK * 1.1))
  const ticks = 36

  return (
    <section
      className="rise rounded-2xl border border-line bg-panel p-5 sm:p-7 flex flex-col min-w-0 overflow-hidden"
      style={{ backgroundImage: 'radial-gradient(70% 60% at 50% 0%, rgb(var(--brand) / 0.14), transparent 70%)' }}
    >
      <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">Load now</div>
      <div className="relative mx-auto w-full max-w-[340px] aspect-square -mt-2 sm:mt-0">
        <svg viewBox="0 0 240 240" className="w-full h-full">
          {/* Tick ring */}
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const a = ((135 + (270 * i) / ticks) * Math.PI) / 180
            const lit = i / ticks <= frac
            return (
              <line
                key={i}
                x1={120 + 106 * Math.cos(a)}
                y1={120 + 106 * Math.sin(a)}
                x2={120 + (i % 6 === 0 ? 114 : 111) * Math.cos(a)}
                y2={120 + (i % 6 === 0 ? 114 : 111) * Math.sin(a)}
                stroke={lit && on ? 'rgb(var(--brand))' : 'rgb(var(--line))'}
                strokeWidth={i % 6 === 0 ? 2 : 1.2}
                style={{ transition: `stroke .3s ${i * 20}ms` }}
              />
            )
          })}
          <g transform="rotate(135 120 120)">
            <circle cx="120" cy="120" r={R} fill="none" stroke="rgb(var(--sunken))" strokeWidth="14" strokeDasharray={`${ARC} ${C}`} strokeLinecap="round" />
            <circle
              cx="120"
              cy="120"
              r={R}
              fill="none"
              stroke="rgb(var(--brand))"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${on ? ARC * frac : 0} ${C}`}
              style={{ transition: 'stroke-dasharray 1.3s cubic-bezier(.2,.8,.2,1)', filter: 'drop-shadow(0 0 10px rgb(var(--brand) / 0.55))' }}
            />
          </g>
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="num font-display font-bold text-[46px] sm:text-[56px] leading-none tracking-tight">{p.v}</div>
            <div className="text-[14px] font-semibold text-brand mt-1">{p.u}</div>
            <div className="text-[11.5px] text-muted mt-2 num">
              peak today {fmt(PEAK / 1000, 2)} MW
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-auto pt-4 border-t border-line">
        <HeroStat icon={CircleCheck} tone="text-brand" value={`${running}`} unit={`/${total}`} label="Running" />
        <HeroStat icon={Package} tone={kgToday ? 'text-alarm' : 'text-brand'} value={fmt(kgToday)} unit="kg" label="Yarn lost today" />
        <HeroStat icon={Timer} tone="text-fg" value={String(stopsToday)} label="Stops today" />
      </div>
    </section>
  )
}

function HeroStat({ icon: Icon, tone, value, unit, label }: { icon: LucideIcon; tone: string; value: string; unit?: string; label: string }) {
  return (
    <div className="text-center min-w-0">
      <Icon size={16} className={clsx('mx-auto', tone)} />
      <div className={clsx('num font-display font-bold text-[20px] sm:text-[26px] leading-none mt-1.5', tone)}>
        {value}
        {unit && <span className="text-[12px] sm:text-[13px] text-muted font-semibold ml-0.5">{unit}</span>}
      </div>
      <div className="text-[11px] sm:text-[12px] text-muted mt-1 truncate">{label}</div>
    </div>
  )
}

/* ------------------------------ cards ------------------------------ */

function Card({ title, to, children, delay = 0, badge }: { title: string; to: string; children: ReactNode; delay?: number; badge?: { n: number; tone: 'alarm' } }) {
  return (
    <section className="rise rounded-2xl border border-line bg-panel p-4 sm:p-5 flex flex-col min-w-0" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">{title}</h2>
        {badge && <span className="num h-5 min-w-5 px-1.5 grid place-items-center rounded-full bg-alarm-bg text-alarm text-[11px] font-bold">{badge.n}</span>}
        <Link to={to} className="focus-ring ml-auto w-7 h-7 grid place-items-center rounded-lg text-faint hover:text-fg hover:bg-sunken" aria-label={`Open ${title}`}>
          <ArrowRight size={15} />
        </Link>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  )
}

function Empty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="h-full min-h-[100px] grid place-items-center text-brand text-[13px] font-semibold">
      <span className="inline-flex items-center gap-2">
        <Icon size={18} /> {text}
      </span>
    </div>
  )
}

function Row({ icon: Icon, rgb, label, n }: { icon: LucideIcon; rgb: string; label: string; n: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={13} style={{ color: rgb }} />
      <span className="text-muted flex-1">{label}</span>
      <b className="num">{n}</b>
    </div>
  )
}

/** Ring gauge with content in the middle */
function Ring({ value, max, color, size, children }: { value: number; max: number; color: string; size: number; children: ReactNode }) {
  const on = useMounted()
  const R = 40
  const C = 2 * Math.PI * R
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
        <circle cx="48" cy="48" r={R} fill="none" stroke="rgb(var(--sunken))" strokeWidth="8" />
        <circle
          cx="48"
          cy="48"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={on ? C * (1 - Math.min(1, value / max)) : C}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

/** Share of the load from one source, as a ring */
function SourceRing({ label, icon: Icon, share, kw, color }: { label: string; icon: LucideIcon; share: number; kw: number; color: string }) {
  const v = useCountUp(share * 100)
  return (
    <div className="rise rounded-2xl border border-line bg-panel p-4 flex flex-col items-center text-center min-w-0" style={{ animationDelay: '60ms' }}>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-muted self-start">
        <Icon size={13} style={{ color }} /> {label}
      </div>
      <Ring value={share * 100} max={100} color={color} size={96}>
        <span className="num font-display font-bold text-[22px] leading-none">
          {fmt(v)}
          <span className="text-[12px] text-muted">%</span>
        </span>
      </Ring>
      <div className="num text-[12px] text-muted mt-2">{kw > 1 ? `${fmt(kw)} kW` : 'Off'}</div>
    </div>
  )
}

function HallBar({ name, kw, max, stopped }: { name: string; kw: number; max: number; stopped: number }) {
  const on = useMounted()
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className="truncate">{name}</span>
        <span className="flex items-center gap-2 shrink-0">
          {stopped > 0 && (
            <span className="inline-flex items-center gap-0.5 text-alarm font-semibold text-[11.5px]">
              <Power size={11} /> {stopped}
            </span>
          )}
          <span className="num font-semibold">{kw >= 1000 ? `${fmt(kw / 1000, 2)} MW` : `${fmt(kw)} kW`}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-sunken mt-1.5 overflow-hidden">
        <div className="h-full rounded-full bg-brand transition-[width] duration-1000" style={{ width: on ? `${(kw / max) * 100}%` : 0 }} />
      </div>
    </div>
  )
}

/** Today's load: solar at the bottom, grid on top, up to now; the rest of the day dashed */
function LoadCurve({ hour }: { hour: number }) {
  const on = useMounted()
  const W = 400
  const H = 150
  const B = 18
  const max = PEAK * 1.1
  const x = (h: number) => (h / 24) * W
  const y = (v: number) => H - B - (v / max) * (H - B - 6)
  const past = DAY_CURVE.filter((s) => s.hour <= hour)
  const path = (pts: [number, number][]) => pts.map(([h, v], i) => `${i ? 'L' : 'M'}${x(h).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = (top: [number, number][], bottom: [number, number][]) => `${path(top)} ${bottom.reverse().map(([h, v]) => `L${x(h).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} Z`
  const solarTop = past.map((s) => [s.hour, s.solar] as [number, number])
  const loadTop = past.map((s) => [s.hour, s.load] as [number, number])
  const zero = past.map((s) => [s.hour, 0] as [number, number])
  const future = DAY_CURVE.filter((s) => s.hour >= hour - 0.25).map((s) => [s.hour, s.load] as [number, number])

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Load today, grid and solar">
        <defs>
          <clipPath id="ov-reveal">
            <rect x="0" y="0" width={W} height={H} style={{ transform: on ? 'scaleX(1)' : 'scaleX(0)', transformOrigin: '0 0', transition: 'transform 1.4s ease-out' }} />
          </clipPath>
        </defs>
        {past.length > 1 && (
          <g clipPath="url(#ov-reveal)">
            <path d={area(loadTop, [...solarTop])} fill="#3D7FC4" fillOpacity="0.35" />
            <path d={area(solarTop, [...zero])} fill="#E0A100" fillOpacity="0.45" />
            <path d={path(loadTop)} fill="none" stroke="rgb(var(--brand))" strokeWidth="2" />
          </g>
        )}
        <path d={path(future)} fill="none" stroke="rgb(var(--faint))" strokeWidth="1.5" strokeDasharray="3 4" />
        <line x1={x(hour)} x2={x(hour)} y1="4" y2={H - B} stroke="rgb(var(--brand))" strokeWidth="1.5" />
        <line x1="0" x2={W} y1={H - B} y2={H - B} stroke="rgb(var(--line))" />
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={Math.min(W - 2, Math.max(2, x(h)))} y={H - 4} fontSize="10" fill="rgb(var(--faint))" textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}>
            {String(h).padStart(2, '0')}:00
          </text>
        ))}
      </svg>
      <div className="flex items-center gap-4 mt-2 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ background: '#3D7FC4' }} /> Grid
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ background: '#E0A100' }} /> Solar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-faint" /> Rest of day
        </span>
      </div>
    </div>
  )
}

