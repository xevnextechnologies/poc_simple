// Mill map, control-room style: the whole mill as one big live floor plan with
// power flowing to each hall, three views (status, load, health), hall cards
// that glide the map into a hall, a ticker of recent stops, and a machine
// drawer. Values come from sim/engine, sim/health and sim/downtime;
// only presentation lives here.
import clsx from 'clsx'
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronDown,
  CircleCheck,
  Eye,
  HeartPulse,
  Lightbulb,
  Maximize,
  Moon,
  Power,
  Search,
  Timer,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MACHINES, feederById, hallById, machineById } from '../data/din'
import type { Machine } from '../data/din'
import { HALL_BOXES, SOURCE_TILES, TILES, VIEW, ZONE_BOXES, shortName, type Box, type Tile } from '../data/din/floorplan'
import { useCountUp, useMounted } from '../components/ui/kit'
import { busLabel, fmt } from '../lib/format'
import { DT_MACHINES, monthStops, type Stop } from '../sim/downtime'
import { machineAt, pkMidnight, type MachineLive, type Status } from '../sim/engine'
import { HEALTH, type Level } from '../sim/health'
import { insightForMachine } from '../sim/insights'
import { useLive } from '../sim/useLive'
import { useApp } from '../store/app'

type Mode = 'status' | 'load' | 'health'
type Filter = { mode: Mode; key: string } | null

const HOUR = 3_600_000
/** The whole mill, trimmed to the halls (same 5:3 shape as the floor plan) */
const FULL: Box = { x: 12, y: 12, w: VIEW.w - 24, h: VIEW.h - 14.4 }
const DT_IDS = new Set(DT_MACHINES.map((m) => m.id))
const clock = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }).format(t)
const kwText = (kw: number) => (kw >= 1000 ? `${fmt(kw / 1000, 2)} MW` : `${fmt(kw)} kW`)

/* Every state has its own icon, so it never depends on colour alone */
const STATUS: Record<Status, { label: string; icon: LucideIcon; rgb: string }> = {
  running: { label: 'Running', icon: CircleCheck, rgb: 'rgb(var(--brand))' },
  attention: { label: 'Needs a look', icon: Eye, rgb: 'rgb(var(--warn))' },
  stopped: { label: 'Stopped', icon: Power, rgb: 'rgb(var(--alarm))' },
  idle: { label: 'Idle', icon: Moon, rgb: 'rgb(var(--faint))' },
}
const HEALTH_UI: Record<Level, { label: string; icon: LucideIcon; rgb: string }> = {
  ok: { label: 'Healthy', icon: CircleCheck, rgb: 'rgb(var(--brand))' },
  watch: { label: 'Watch', icon: Eye, rgb: 'rgb(var(--warn))' },
  act: { label: 'Act now', icon: AlertTriangle, rgb: 'rgb(var(--alarm))' },
}

/** Which hall a zone sits in */
const zoneHall = (z: Box) => HALL_BOXES.find((h) => z.x >= h.x && z.x < h.x + h.w && z.y >= h.y && z.y < h.y + h.h)?.id

/** Box around a hall, padded and stretched to the map's shape */
function fitBox(b: Box): Box {
  const pad = 24
  let w = b.w + pad * 2
  let h = b.h + pad * 2
  const ratio = VIEW.w / VIEW.h
  if (w / h > ratio) h = w / ratio
  else w = h * ratio
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h }
}
/** Viewport that glides to the whole mill or to one hall */
function useViewport() {
  const [vb, setVbState] = useState<Box>(FULL)
  const vbRef = useRef(vb)
  vbRef.current = vb
  const raf = useRef(0)
  const animateTo = useCallback((t: Box) => {
    cancelAnimationFrame(raf.current)
    const a = { ...vbRef.current }
    const start = performance.now()
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - start) / 450))
      const e = 1 - Math.pow(1 - k, 3)
      setVbState({ x: a.x + (t.x - a.x) * e, y: a.y + (t.y - a.y) * e, w: a.w + (t.w - a.w) * e, h: a.h + (t.h - a.h) * e })
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }, [])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  return { vb, animateTo }
}

/* ------------------------------ page ------------------------------ */

export function MillMapLive() {
  const live = useLive()
  const now = useApp((s) => s.now)
  const entries = useApp((s) => s.dtEntries)
  const dipSeq = useApp((s) => s.dipSeq)
  const [params, setParams] = useSearchParams()
  const selected = params.get('m')
  const [mode, setMode] = useState<Mode>('status')
  const [filter, setFilter] = useState<Filter>(null)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState<string | null>(null)
  const { vb, animateTo } = useViewport()
  const boxRef = useRef<HTMLDivElement>(null)

  const select = (id: string | null) => setParams(id ? { m: id } : {}, { replace: true })
  /** Glide to one hall (or back to the whole mill); the other halls dim */
  const goTo = (hallId: string | null) => {
    setFocus(hallId)
    const hall = hallId ? HALL_BOXES.find((h) => h.id === hallId) : undefined
    animateTo(hall ? fitBox(hall) : FULL)
  }

  // Arriving with ?m=: zoom into that machine's hall
  useEffect(() => {
    if (selected && machineById[selected]) goTo(machineById[selected].hallId)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- live numbers ---------- */
  const counts = useMemo(() => {
    const c: Record<Status, number> = { running: 0, attention: 0, stopped: 0, idle: 0 }
    for (const m of MACHINES) c[live.machines[m.id].status]++
    return c
  }, [live])
  const healthCounts = useMemo(() => {
    const c: Record<Level, number> = { ok: 0, watch: 0, act: 0 }
    for (const m of MACHINES) c[HEALTH[m.id].level]++
    return c
  }, [])
  const hallStats = useMemo(
    () =>
      Object.fromEntries(
        HALL_BOXES.map((h) => {
          const ms = MACHINES.filter((m) => m.hallId === h.id)
          return [
            h.id,
            {
              kw: ms.reduce((s, m) => s + live.machines[m.id].kw, 0),
              running: ms.filter((m) => ['running', 'attention'].includes(live.machines[m.id].status)).length,
              stopped: ms.filter((m) => live.machines[m.id].status === 'stopped').length,
              total: ms.length,
            },
          ]
        }),
      ),
    [live],
  )

  /* ---------- recent events for the ticker ---------- */
  const minute = Math.floor(now / 60_000)
  const events = useMemo(() => {
    const since = now - 12 * HOUR
    const out: { id: string; t: number; back: boolean; s: Stop }[] = []
    for (const s of monthStops(now, entries)) {
      if (s.start >= since) out.push({ id: `${s.id}:s`, t: s.start, back: false, s })
      if (!s.ongoing && s.end >= since) out.push({ id: `${s.id}:e`, t: s.end, back: true, s })
    }
    return out.sort((a, b) => b.t - a.t).slice(0, 10)
  }, [minute, entries, dipSeq, counts.stopped]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- search ---------- */
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return []
    return MACHINES.filter((m) => m.name.toLowerCase().includes(n) || m.id.toLowerCase().includes(n)).slice(0, 6)
  }, [q])

  /* ---------- how each machine is drawn ---------- */
  const look = (t: Tile) => {
    const l = live.machines[t.id]
    const m = machineById[t.id]
    if (mode === 'load') {
      const load = Math.min(1, l.kw / m.ratedKw)
      return { fill: `rgb(var(--brand) / ${(0.1 + 0.85 * load).toFixed(2)})`, ping: false, solid: load > 0.55, key: '' }
    }
    if (mode === 'health') {
      const h = HEALTH[t.id].level
      return { fill: h === 'ok' ? 'rgb(var(--brand) / 0.28)' : HEALTH_UI[h].rgb, ping: false, solid: h !== 'ok', key: h }
    }
    const s = l.status
    const fill = s === 'running' ? 'rgb(var(--brand) / 0.38)' : s === 'idle' ? 'rgb(var(--faint) / 0.25)' : STATUS[s].rgb
    return { fill, ping: s === 'stopped', solid: s === 'stopped' || s === 'attention', key: s }
  }

  return (
    <div>
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <h1 className="font-display font-bold text-[22px] sm:text-[26px]">Mill map</h1>
          <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-sunken text-[12px] font-semibold text-muted">
            <span className="w-2 h-2 rounded-full bg-brand" /> Live
          </span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="inline-flex p-0.5 rounded-lg bg-sunken text-[12px] font-semibold shrink-0" role="tablist">
            {(
              [
                ['status', 'Status', Activity],
                ['load', 'Load', Zap],
                ['health', 'Health', HeartPulse],
              ] as [Mode, string, LucideIcon][]
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m)
                  setFilter(null)
                }}
                className={clsx('focus-ring inline-flex items-center gap-1.5 h-8 px-3 rounded-md transition-colors', mode === m ? 'bg-panel text-fg shadow-card' : 'text-muted hover:text-fg')}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 sm:flex-none">
            <label className="flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-sunken/60 sm:w-60 focus-within:border-brand/60">
              <Search size={15} className="text-faint shrink-0" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a machine" className="bg-transparent outline-none text-[13px] flex-1 min-w-0 placeholder:text-faint" />
            </label>
            {matches.length > 0 && (
              <div className="absolute right-0 top-11 z-30 w-full sm:w-64 rounded-xl border border-line bg-panel shadow-pop py-1">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      select(m.id)
                      goTo(m.hallId)
                      setQ('')
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-sunken flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="text-faint text-[12px] shrink-0">{hallById[m.hallId].short}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Halls: click one to glide into it */}
      <div className="flex gap-2 sm:gap-3 mt-4 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3 xl:grid-cols-6">
        <HallCard title="Whole mill" kw={live.mix.load} running={counts.running + counts.attention} total={MACHINES.length} stopped={counts.stopped} active={!focus} onClick={() => goTo(null)} />
        {HALL_BOXES.map((h) => (
          <HallCard key={h.id} title={h.title} {...hallStats[h.id]} active={focus === h.id} onClick={() => goTo(focus === h.id ? null : h.id)} />
        ))}
      </div>

      {/* Legend (click to highlight) */}
      <div className="mt-3">
        <Legend mode={mode} counts={counts} healthCounts={healthCounts} filter={filter} setFilter={setFilter} />
      </div>

      {/* The map: full width at the floor plan's own shape; on phones it keeps a readable size and swipes sideways */}
      <div className="mt-2 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
      <div ref={boxRef} className="rise relative w-full min-w-[760px] md:min-w-0 aspect-[5/3]">
        <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="absolute inset-0 w-full h-full select-none" onMouseLeave={() => setHover(null)}>
          <defs>
            <filter id="mm-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          <PowerFlow hallKw={Object.fromEntries(HALL_BOXES.map((h) => [h.id, hallStats[h.id].kw]))} />

          {/* Halls */}
          {HALL_BOXES.map((h) => {
            const s = hallStats[h.id]
            return (
              <g key={h.id} opacity={focus && focus !== h.id ? 0.3 : 1} style={{ transition: 'opacity .3s' }}>
                <rect x={h.x} y={h.y} width={h.w} height={h.h} rx={18} fill="rgb(var(--panel) / 0.75)" stroke={focus === h.id ? 'rgb(var(--brand) / 0.6)' : 'rgb(var(--line))'} strokeWidth={1.5} />
                <g className="cursor-pointer" onClick={() => goTo(focus === h.id ? null : h.id)}>
                  <rect x={h.x} y={h.y} width={h.w} height={46} rx={18} fill="transparent" />
                  <text x={h.x + 18} y={h.y + 30} fontWeight={700} fontSize={19} fill="rgb(var(--fg))">
                    {h.title}
                  </text>
                  <text x={h.x + h.w - (s.stopped ? 48 : 18)} y={h.y + 29} textAnchor="end" fontSize={13} fill="rgb(var(--muted))">
                    <tspan fontWeight={700} fill="rgb(var(--brand))">
                      {kwText(s.kw)}
                    </tspan>
                    {` · ${s.running}/${s.total}`}
                  </text>
                  {s.stopped > 0 && (
                    <g>
                      <circle cx={h.x + h.w - 28} cy={h.y + 24} r={12} fill="rgb(var(--alarm))" />
                      <text x={h.x + h.w - 28} y={h.y + 28.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="rgb(var(--bg))">
                        {s.stopped}
                      </text>
                    </g>
                  )}
                </g>
              </g>
            )
          })}

          {/* Zones inside halls */}
          {ZONE_BOXES.map((z) => (
            <g key={z.title} pointerEvents="none" opacity={focus && zoneHall(z) !== focus ? 0.3 : 1} style={{ transition: 'opacity .3s' }}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={10} fill="rgb(var(--sunken) / 0.55)" />
              <text x={z.x + 12} y={z.y + 20} fontSize={11} fontWeight={700} fill="rgb(var(--faint))" letterSpacing={0.6}>
                {z.title.toUpperCase()}
              </text>
            </g>
          ))}

          <Sources grid={live.mix.grid} solar={live.mix.solar} />

          {/* Pings under machines that need attention */}
          {TILES.map((t) => {
            const lk = look(t)
            if (!lk.ping) return null
            const dim = (filter && filter.mode === mode && filter.key !== lk.key) || (focus && machineById[t.id].hallId !== focus)
            if (dim) return null
            return (
              <circle
                key={`p-${t.id}`}
                cx={t.x + t.w / 2}
                cy={t.y + t.h / 2}
                r={Math.min(Math.max(t.w, t.h), 40) * 0.85}
                fill={mode === 'health' ? HEALTH_UI.act.rgb : STATUS.stopped.rgb}
                className="map-ping"
                pointerEvents="none"
              />
            )
          })}

          {/* Machines */}
          {TILES.map((t) => {
            const m = machineById[t.id]
            const l = live.machines[t.id]
            const lk = look(t)
            const dim = (filter && filter.mode === mode && filter.key !== lk.key) || (focus && m.hallId !== focus)
            const isSel = selected === t.id
            const text = lk.solid ? 'rgb(var(--bg))' : 'rgb(var(--fg))'
            const cx = t.x + t.w / 2
            const cy = t.y + t.h / 2
            return (
              <g
                key={t.id}
                opacity={dim ? 0.15 : 1}
                style={{ transition: 'opacity .25s' }}
                className="cursor-pointer"
                onClick={() => select(t.id)}
                onMouseMove={(e) => {
                  const r = boxRef.current!.getBoundingClientRect()
                  setHover({ id: t.id, x: e.clientX - r.left, y: e.clientY - r.top })
                }}
                onMouseLeave={() => setHover(null)}
              >
                {lk.solid && <Shape t={t} grow={4} fill={lk.fill} opacity={0.45} filter="url(#mm-glow)" />}
                <Shape t={t} fill={lk.fill} />
                {t.h > 60 &&
                  Array.from({ length: Math.floor((t.h - 22) / 9) }, (_, i) => (
                    <line key={i} x1={t.x + 3} x2={t.x + t.w - 3} y1={t.y + 8 + i * 9} y2={t.y + 8 + i * 9} stroke={text} strokeOpacity={0.15} strokeWidth={1} />
                  ))}
                {isSel && <Shape t={t} grow={4} fill="none" stroke="rgb(var(--fg))" strokeWidth={3} />}
                {t.rich ? (
                  <>
                    <text x={t.x + 9} y={t.y + (t.h < 46 ? 20 : 19)} fontSize={12.5} fontWeight={700} fill={text}>
                      {shortName(m)}
                    </text>
                    <text x={t.h < 46 ? t.x + t.w - 9 : t.x + 9} y={t.h < 46 ? t.y + 20 : t.y + t.h - 13} textAnchor={t.h < 46 ? 'end' : 'start'} fontSize={12} fill={text} opacity={0.85}>
                      {mode === 'health' ? `${HEALTH[t.id].score}/100` : `${fmt(l.kw)} kW`}
                    </text>
                  </>
                ) : t.h > 60 ? (
                  <text x={cx} y={t.y + t.h - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={text}>
                    {t.label}
                  </text>
                ) : (
                  <text x={cx} y={cy + 4} textAnchor="middle" fontSize={t.w > 60 ? 13 : 11.5} fontWeight={700} fill={text}>
                    {t.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Back to the whole mill, when zoomed into a hall */}
        {focus && (
          <button
            onClick={() => goTo(null)}
            className="fade-in focus-ring absolute top-3 right-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-line bg-panel/85 backdrop-blur-md shadow-pop text-[13px] font-semibold hover:bg-sunken"
          >
            <Maximize size={14} /> Whole mill
          </button>
        )}

        {hover && !selected && <HoverCard id={hover.id} x={hover.x} y={hover.y} live={live.machines[hover.id]} box={boxRef.current} />}
      </div>
      </div>

      {/* Recent events */}
      <Ticker events={events} onPick={select} />

      {selected && machineById[selected] && (
        <MachineDrawer key={selected} m={machineById[selected]} live={live.machines[selected]} hour={live.hour} t={live.t} onClose={() => select(null)} />
      )}
    </div>
  )
}

/* ------------------------------ map pieces ------------------------------ */

function Shape({ t, grow = 0, ...rest }: { t: { x: number; y: number; w: number; h: number; shape: string }; grow?: number } & React.SVGProps<SVGRectElement & SVGCircleElement>) {
  if (t.shape === 'circle') return <circle cx={t.x + t.w / 2} cy={t.y + t.h / 2} r={t.w / 2 + grow} {...(rest as React.SVGProps<SVGCircleElement>)} />
  return <rect x={t.x - grow} y={t.y - grow} width={t.w + grow * 2} height={t.h + grow * 2} rx={6 + grow} {...(rest as React.SVGProps<SVGRectElement>)} />
}

/** Power from the power house to each hall: thicker and faster where more is drawn */
function PowerFlow({ hallKw }: { hallKw: Record<string, number> }) {
  const routes: { hall: string; d: string }[] = [
    { hall: 'H1', d: 'M1200 616 V530 H320 V520' },
    { hall: 'H2', d: 'M1200 616 V530 H820 V520' },
    { hall: 'H3', d: 'M1200 616 V520' },
    { hall: 'U1', d: 'M1036 650 H1000' },
  ]
  const max = Math.max(1, ...routes.map((r) => hallKw[r.hall] ?? 0))
  return (
    <g pointerEvents="none">
      {routes.map((r) => {
        const k = (hallKw[r.hall] ?? 0) / max
        return <path key={`${r.hall}-bg`} d={r.d} fill="none" stroke="rgb(var(--brand) / 0.12)" strokeWidth={6 + 8 * k} strokeLinecap="round" strokeLinejoin="round" />
      })}
      {routes.map((r) => {
        const kw = hallKw[r.hall] ?? 0
        const k = kw / max
        return (
          <path
            key={r.hall}
            d={r.d}
            fill="none"
            stroke="rgb(var(--brand))"
            strokeWidth={2 + 3 * k}
            strokeLinecap="round"
            strokeDasharray="2 12"
            className="power-flow"
            style={{ animationDuration: `${(4.5 - 2.5 * k).toFixed(2)}s`, filter: 'drop-shadow(0 0 4px rgb(var(--brand) / 0.6))' }}
          />
        )
      })}
    </g>
  )
}

function Sources({ grid, solar }: { grid: number; solar: number }) {
  const items = [
    { k: 'grid' as const, label: 'Grid (LESCO)', v: grid, color: '#3D7FC4' },
    { k: 'solar' as const, label: 'Solar', v: solar, color: '#E0A100' },
  ]
  return (
    <g pointerEvents="none">
      {items.map((i) => {
        const b = SOURCE_TILES[i.k]
        const on = i.v > 1
        return (
          <g key={i.k}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill="rgb(var(--panel))" stroke={on ? i.color : 'rgb(var(--line))'} strokeWidth={on ? 1.5 : 1} />
            <circle cx={b.x + 15} cy={b.y + 17} r={5} fill={on ? i.color : 'rgb(var(--line))'} />
            <text x={b.x + 26} y={b.y + 21.5} fontSize={13} fontWeight={700} fill="rgb(var(--muted))">
              {i.label}
            </text>
            <text x={b.x + 10} y={b.y + 50} fontSize={18} fontWeight={700} fill={on ? 'rgb(var(--fg))' : 'rgb(var(--faint))'}>
              {on ? `${fmt(i.v)} kW` : 'Off'}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/* ------------------------------ overlays ------------------------------ */

/** One hall (or the whole mill): live kW, running count, stopped badge. Click to glide in. */
function HallCard({ title, kw, running, total, stopped, active, onClick }: {
  title: string
  kw: number
  running: number
  total: number
  stopped: number
  active: boolean
  onClick: () => void
}) {
  const v = useCountUp(kw)
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'focus-ring shrink-0 w-[150px] md:w-auto text-left rounded-xl px-3.5 py-2.5 border transition-colors',
        active ? 'border-brand/60 bg-brand/10' : 'border-line bg-panel hover:border-brand/40',
      )}
    >
      <div className={clsx('text-[12px] font-semibold truncate', active ? 'text-brand' : 'text-muted')}>{title}</div>
      <div className="num font-display font-bold text-[19px] leading-tight mt-0.5">{kwText(v)}</div>
      <div className="flex items-center gap-2 text-[11.5px] mt-0.5">
        <span className="text-muted num">
          {running}/{total} running
        </span>
        {stopped > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-alarm">
            <Power size={11} /> {stopped}
          </span>
        )}
      </div>
    </button>
  )
}

function Legend({ mode, counts, healthCounts, filter, setFilter }: {
  mode: Mode
  counts: Record<Status, number>
  healthCounts: Record<Level, number>
  filter: Filter
  setFilter: (f: Filter) => void
}) {
  const chip = (key: string, label: string, Icon: LucideIcon, rgb: string, n: number) => {
    const on = filter?.mode === mode && filter.key === key
    return (
      <button
        key={key}
        onClick={() => setFilter(on ? null : { mode, key })}
        aria-pressed={on}
        className={clsx('focus-ring inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[12px] font-semibold border shrink-0 transition-colors', on ? 'border-fg/40 bg-sunken' : 'border-transparent hover:bg-sunken')}
      >
        <Icon size={13} style={{ color: rgb }} />
        <span className="text-muted">{label}</span>
        <span className="num">{n}</span>
      </button>
    )
  }
  return (
    <div className="flex items-center gap-0.5 w-max max-w-full rounded-xl border border-line bg-panel p-1 overflow-x-auto">
      {mode === 'status' && (Object.keys(STATUS) as Status[]).map((s) => chip(s, STATUS[s].label, STATUS[s].icon, STATUS[s].rgb, counts[s]))}
      {mode === 'health' && (Object.keys(HEALTH_UI) as Level[]).map((l) => chip(l, HEALTH_UI[l].label, HEALTH_UI[l].icon, HEALTH_UI[l].rgb, healthCounts[l]))}
      {mode === 'load' && (
        <div className="flex items-center gap-2 px-2.5 h-8 text-[12px] text-muted">
          Light
          <span className="flex gap-[2px]">
            {[0.1, 0.3, 0.5, 0.7, 0.95].map((a) => (
              <span key={a} className="w-6 h-3 rounded-sm" style={{ background: `rgb(var(--brand) / ${a})` }} />
            ))}
          </span>
          Full load
        </div>
      )}
    </div>
  )
}

function Ticker({ events, onPick }: { events: { id: string; t: number; back: boolean; s: Stop }[]; onPick: (id: string) => void }) {
  if (!events.length) return null
  const item = (e: (typeof events)[number], k: string) => (
    <button
      key={k}
      onClick={() => onPick(e.s.machine.id)}
      className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-sunken/80 hover:bg-sunken text-[12px] whitespace-nowrap shrink-0"
    >
      <span className="num text-faint">{clock(e.t)}</span>
      {e.back ? <CircleCheck size={13} className="text-brand" /> : <Power size={13} className="text-alarm" />}
      <span className="font-semibold">{e.s.machine.name}</span>
      <span className="text-muted">{e.back ? 'back running' : e.s.reason ? e.s.reason.label.toLowerCase() : 'stopped'}</span>
    </button>
  )
  return (
    <div className="mt-3 h-11 rounded-xl border border-line bg-panel flex items-center overflow-hidden">
      <span className="shrink-0 h-full px-3 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] font-semibold text-faint border-r border-line bg-panel">
        <Activity size={13} className="text-brand" /> <span className="hidden sm:inline">Latest</span>
      </span>
      <div className="flex-1 overflow-hidden ticker-mask">
        <div className="ticker flex gap-2 w-max px-2" style={{ animationDuration: `${Math.max(20, events.length * 6)}s` }}>
          {events.map((e) => item(e, e.id))}
          {events.map((e) => item(e, `${e.id}-again`))}
        </div>
      </div>
    </div>
  )
}

function HoverCard({ id, x, y, live, box }: { id: string; x: number; y: number; live: MachineLive; box: HTMLDivElement | null }) {
  const m = machineById[id]
  const S = STATUS[live.status]
  const ratio = live.normalKw > 0 ? (live.kw / live.normalKw - 1) * 100 : 0
  const W = 200
  const left = box ? Math.min(x + 16, box.clientWidth - W - 8) : x + 16
  const top = box ? Math.min(y + 16, box.clientHeight - 110) : y + 16
  return (
    <div className="absolute z-20 pointer-events-none rounded-xl border border-line bg-panel/95 backdrop-blur shadow-pop px-3.5 py-2.5 text-[12px]" style={{ left, top, width: W }}>
      <div className="font-semibold text-[14px] truncate">{m.name}</div>
      <div className="flex items-center gap-1.5 mt-1">
        <S.icon size={12} style={{ color: S.rgb }} />
        <span className="text-muted">{S.label}</span>
      </div>
      <div className="flex items-baseline gap-2 mt-1.5">
        <b className="num text-[15px]">{fmt(live.kw, live.kw < 20 ? 1 : 0)} kW</b>
        {live.kw > 0 && Math.abs(ratio) >= 3 && (
          <span className={ratio > 0 ? 'text-warn font-semibold' : 'text-muted'}>
            {ratio > 0 ? '+' : ''}
            {fmt(ratio)}%
          </span>
        )}
      </div>
    </div>
  )
}

/* ------------------------------ machine drawer ------------------------------ */

function MachineDrawer({ m, live, hour, t, onClose }: { m: Machine; live: MachineLive; hour: number; t: number; onClose: () => void }) {
  const mid = pkMidnight(t)
  const feeder = feederById[m.feederId]
  const insight = insightForMachine(m.id)
  const health = HEALTH[m.id]
  const S = STATUS[live.status]
  const H = HEALTH_UI[health.level]
  const [details, setDetails] = useState(false)
  const curve = useMemo(
    () => Array.from({ length: 96 }, (_, i) => i * 0.25).filter((h) => h <= hour).map((h) => [h, Math.round(machineAt(m, h, mid + h * 3600_000).kw * 10) / 10] as [number, number]),
    [m, Math.floor(hour * 4)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const todayKwh = curve.reduce((s, [, kw]) => s + kw * 0.25, 0)
  const stops = useMemo(() => monthStops(t).filter((s) => s.machine.id === m.id).length, [m.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const ratio = live.normalKw > 0 ? live.kw / live.normalKw : 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] fade-in" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={m.name}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl sm:rounded-none sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(440px,100vw)] sm:max-h-none bg-panel border-t sm:border-t-0 sm:border-l border-line shadow-pop overflow-y-auto sheet-in sm:drawer-in"
      >
        <div className="sticky top-0 z-10 bg-panel/95 backdrop-blur border-b border-line px-5 py-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint truncate">{hallById[m.hallId].name}</div>
            <h2 className="font-display font-bold text-[20px] leading-tight mt-1 truncate">{m.name}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-sunken text-[11px] font-bold uppercase tracking-wide" style={{ color: S.rgb }}>
                <S.icon size={12} strokeWidth={2.5} /> {S.label}
              </span>
              <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-sunken text-[11px] font-bold" style={{ color: H.rgb }} title="Health score">
                <HeartPulse size={12} strokeWidth={2.5} /> {health.score}/100
              </span>
            </div>
          </div>
          <button onClick={onClose} className="focus-ring w-9 h-9 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-sunken shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {live.note && (
            <div className={clsx('rounded-xl px-3.5 py-3 text-[13px] flex gap-2', live.status === 'stopped' ? 'bg-alarm-bg text-alarm' : 'bg-warn-bg text-warn')}>
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{live.note}</span>
            </div>
          )}

          <div className="flex items-center gap-5">
            <KwGauge kw={live.kw} normal={live.normalKw} rated={m.ratedKw} status={live.status} />
            <div className="grid grid-cols-1 gap-3 flex-1 min-w-0">
              <Fig label="vs normal" value={live.kw === 0 ? '—' : `${ratio >= 1 ? '+' : ''}${fmt((ratio - 1) * 100)}%`} tone={ratio > 1.05 ? 'text-warn' : undefined} />
              <Fig label="Used today" value={`${fmt(todayKwh)} units`} />
              <Fig label="Stops this month" value={DT_IDS.has(m.id) ? String(stops) : '—'} />
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint mb-2">Power today</div>
            <DayCurve curve={curve} normal={live.normalKw} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {live.status === 'stopped' && <Action to={`/downtime#${m.id}`} icon={Timer} label="Downtime" strong />}
            {insight && <Action to={`/advisor#${insight.id}`} icon={Lightbulb} label="What to do" strong={live.status !== 'stopped'} />}
            <Action to={`/health?m=${m.id}`} icon={HeartPulse} label="Health" />
            <Action to={`/ask?m=${m.id}`} icon={Bot} label="Ask Enervtek" />
          </div>

          <div className="rounded-xl border border-line">
            <button onClick={() => setDetails(!details)} aria-expanded={details} className="focus-ring w-full flex items-center justify-between px-4 h-10 text-[13px] font-semibold">
              Machine details <ChevronDown size={16} className={clsx('text-muted transition-transform', details && 'rotate-180')} />
            </button>
            {details && (
              <dl className="px-4 pb-4 grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
                <dt className="text-muted">Feeder</dt>
                <dd>
                  {feeder.sldName} · <span className="text-muted">{busLabel(feeder.bus)}</span>
                </dd>
                <dt className="text-muted">Rated power</dt>
                <dd className="num">{fmt(m.ratedKw, m.ratedKw % 1 ? 1 : 0)} kW</dd>
                {m.spindles && (
                  <>
                    <dt className="text-muted">Spindles</dt>
                    <dd className="num">{fmt(m.spindles)}</dd>
                  </>
                )}
                <dt className="text-muted">Measured by</dt>
                <dd>{m.metering === 'feeder' ? 'Share of the feeder meter' : m.metering === 'pq' ? 'Power-quality meter' : 'Its own meter'}</dd>
              </dl>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={clsx('num font-display font-bold text-[17px] leading-tight truncate', tone)}>{value}</div>
    </div>
  )
}

function Action({ to, icon: Icon, label, strong }: { to: string; icon: LucideIcon; label: string; strong?: boolean }) {
  return (
    <Link
      to={to}
      className={clsx(
        'focus-ring inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg text-[13px] font-semibold hover:brightness-110',
        strong ? 'bg-brand text-bg font-bold' : 'bg-sunken',
      )}
    >
      <Icon size={15} /> {label}
    </Link>
  )
}

/** Live kW on a half-ring scaled to rated power, with a tick at normal */
function KwGauge({ kw, normal, rated, status }: { kw: number; normal: number; rated: number; status: Status }) {
  const on = useMounted()
  const v = useCountUp(kw)
  const R = 52
  const L = Math.PI * R
  const frac = Math.min(1, kw / rated)
  const nFrac = Math.min(1, normal / rated)
  const a = Math.PI * (1 - nFrac)
  const color = STATUS[status].rgb
  return (
    <div className="relative w-[140px] shrink-0">
      <svg viewBox="0 0 140 84" className="w-full">
        <path d="M18 74 A52 52 0 0 1 122 74" fill="none" stroke="rgb(var(--sunken))" strokeWidth="11" strokeLinecap="round" />
        <path
          d="M18 74 A52 52 0 0 1 122 74"
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={L}
          strokeDashoffset={on ? L * (1 - frac) : L}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }}
        />
        {normal > 0 && <line x1={70 + 40 * Math.cos(a)} y1={74 - 40 * Math.sin(a)} x2={70 + 64 * Math.cos(a)} y2={74 - 64 * Math.sin(a)} stroke="rgb(var(--fg))" strokeWidth="2" />}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="num font-display font-bold text-[24px] leading-none">{fmt(v, v < 20 ? 1 : 0)}</div>
        <div className="text-[11px] text-muted">kW now</div>
      </div>
    </div>
  )
}

/** Today's power for one machine, with its normal as a dashed line */
function DayCurve({ curve, normal }: { curve: [number, number][]; normal: number }) {
  const on = useMounted()
  const W = 320
  const H = 100
  const B = 16
  const max = Math.max(1, normal * 1.25, ...curve.map((p) => p[1]))
  const x = (h: number) => (h / 24) * W
  const y = (v: number) => (H - B) - (v / max) * (H - B - 6)
  if (curve.length < 2) return <div className="h-[100px] grid place-items-center text-[12px] text-muted">Day just started</div>
  const line = curve.map(([h, v], i) => `${i ? 'L' : 'M'}${x(h).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(curve[curve.length - 1][0])} ${H - B} L0 ${H - B} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Power today">
      <defs>
        <linearGradient id="mm-curve" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--brand))" stopOpacity="0.35" />
          <stop offset="1" stopColor="rgb(var(--brand))" stopOpacity="0" />
        </linearGradient>
        <clipPath id="mm-reveal">
          <rect x="0" y="0" width={W} height={H} style={{ transform: on ? 'scaleX(1)' : 'scaleX(0)', transformOrigin: '0 0', transition: 'transform 1.2s ease-out' }} />
        </clipPath>
      </defs>
      {normal > 0 && <line x1="0" x2={W} y1={y(normal)} y2={y(normal)} stroke="rgb(var(--faint))" strokeDasharray="4 4" />}
      <g clipPath="url(#mm-reveal)">
        <path d={area} fill="url(#mm-curve)" />
        <path d={line} fill="none" stroke="rgb(var(--brand))" strokeWidth="2" strokeLinejoin="round" />
      </g>
      <line x1="0" x2={W} y1={H - B} y2={H - B} stroke="rgb(var(--line))" />
      {[0, 6, 12, 18, 24].map((h) => (
        <text key={h} x={Math.min(W - 2, Math.max(2, x(h)))} y={H - 3} fontSize="9.5" fill="rgb(var(--faint))" textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}>
          {String(h).padStart(2, '0')}:00
        </text>
      ))}
    </svg>
  )
}

