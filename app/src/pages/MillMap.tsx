import clsx from 'clsx'
import ReactECharts from 'echarts-for-react'
import { ArrowRight, Bot, Maximize, Search, Timer, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MACHINES, feederById, hallById, machineById } from '../data/din'
import type { Machine } from '../data/din'
import { HALL_BOXES, SOURCE_TILES, TILES, VIEW, ZONE_BOXES, shortName, type Box } from '../data/din/floorplan'
import { C, axisLabel, tooltipBase } from '../components/charts/theme'
import { STATUS_META, Segmented, StatusPill } from '../components/ui/primitives'
import { LayerFrame } from '../components/layout/LayerFrame'
import { Disclosure } from '../components/ui/structure'
import { busLabel, fmt, hhmm } from '../lib/format'
import { machineAt, pkMidnight, type MachineLive, type Status } from '../sim/engine'
import { insightForMachine } from '../sim/insights'
import { DT_MACHINES, monthStops } from '../sim/downtime'

const DT_IDS = new Set(DT_MACHINES.map((m) => m.id))
import { useLive } from '../sim/useLive'
import { useApp } from '../store/app'
import { MAINT_HEX, allMaint, type MaintRecord, type MaintStatus } from '../sim/maintenance'
import { MaintHover, MaintLegend, MaintPanel, dueText } from '../components/maintenance/parts'

type Mode = 'status' | 'power'

/** Sequential single-hue ramp (light → dark green) for "how hard is it working" */
const RAMP = ['#E8F2EC', '#BFE3CE', '#8FD3AE', '#4FA67D', '#237A57', '#173629']
const rampColor = (frac: number) => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.floor(frac * RAMP.length)))]

const GRAD: Record<Status, string> = { running: 'url(#g-run)', attention: 'url(#g-att)', stopped: 'url(#g-stop)', idle: 'url(#g-idle)' }
const FULL: Box = { x: 0, y: 0, w: VIEW.w, h: VIEW.h }

/** Smoothly animated viewBox for zooming into a hall */
function useViewBox(target: Box) {
  const [vb, setVb] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = performance.now()
    const a = { ...from.current }
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 450)
      const e = 1 - Math.pow(1 - k, 3)
      const next = { x: a.x + (target.x - a.x) * e, y: a.y + (target.y - a.y) * e, w: a.w + (target.w - a.w) * e, h: a.h + (target.h - a.h) * e }
      from.current = next
      setVb(next)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target.x, target.y, target.w, target.h]) // eslint-disable-line react-hooks/exhaustive-deps
  return vb
}

function fitBox(b: Box): Box {
  const pad = 24
  let w = b.w + pad * 2
  let h = b.h + pad * 2
  const ratio = VIEW.w / VIEW.h
  if (w / h > ratio) h = w / ratio
  else w = h * ratio
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h }
}

export function MillMap({ compact = false, variant = 'live' }: { compact?: boolean; variant?: 'live' | 'maintenance' } = {}) {
  const isMaint = variant === 'maintenance'
  const maintDone = useApp((st) => st.maintDone)
  const maint = useMemo(() => Object.fromEntries(allMaint(maintDone).map((r) => [r.id, r])) as Record<string, MaintRecord>, [maintDone])
  const maintCounts = useMemo(() => {
    const c: Record<MaintStatus, number> = { overdue: 0, soon: 0, ok: 0, done: 0 }
    for (const r of Object.values(maint)) c[r.status]++
    return c
  }, [maint])
  const live = useLive()
  const [params, setParams] = useSearchParams()
  const selected = compact ? null : params.get('m')
  const [mode, setMode] = useState<Mode>('status')
  const [focus, setFocus] = useState<string | null>(null)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [q, setQ] = useState('')

  const select = (id: string | null) => {
    if (compact) return
    setParams(id ? { m: id } : {}, { replace: true })
    if (id && focus && machineById[id].hallId !== focus) setFocus(null)
  }

  const hallStats = useMemo(
    () =>
      Object.fromEntries(
        HALL_BOXES.map((h) => {
          const ms = MACHINES.filter((m) => m.hallId === h.id)
          const kw = ms.reduce((s, m) => s + live.machines[m.id].kw, 0)
          const running = ms.filter((m) => ['running', 'attention'].includes(live.machines[m.id].status)).length
          const stopped = ms.filter((m) => live.machines[m.id].status === 'stopped').length
          const attention = ms.filter((m) => live.machines[m.id].status === 'attention').length
          return [h.id, { kw, running, total: ms.length, stopped, attention }]
        }),
      ),
    [live],
  )
  const counts = useMemo(() => {
    const c: Record<Status, number> = { running: 0, attention: 0, stopped: 0, idle: 0 }
    for (const m of MACHINES) c[live.machines[m.id].status]++
    return c
  }, [live])

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return []
    return MACHINES.filter((m) => m.name.toLowerCase().includes(n) || m.id.toLowerCase().includes(n)).slice(0, 6)
  }, [q])

  const focusBox = focus ? fitBox(HALL_BOXES.find((h) => h.id === focus)!) : FULL
  const vb = useViewBox(focusBox)
  const flowKw = HALL_BOXES.filter((h) => h.id !== 'P1').reduce((s, h) => s + hallStats[h.id].kw, 0)

  return (
    <>
      {!compact && !isMaint && (
        <LayerFrame
          layer={1}
          title="Mill map"
          subtitle="Every machine in the mill, live. Click a hall to zoom in, or any machine to see what it is doing and why it stopped."
          actions={
            <Segmented<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: 'status', label: 'Status' },
                { value: 'power', label: 'How hard it is working' },
              ]}
            />
          }
        >
          {null}
        </LayerFrame>
      )}

      {!compact && isMaint && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
          <MaintChip title="Whole mill" list={Object.values(maint)} active={!focus} onClick={() => setFocus(null)} />
          {HALL_BOXES.map((h) => (
            <MaintChip key={h.id} title={h.title} list={Object.values(maint).filter((r) => r.m.hallId === h.id)} active={focus === h.id} onClick={() => setFocus(focus === h.id ? null : h.id)} />
          ))}
        </div>
      )}

      {!compact && !isMaint && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
          <HallChip title="Whole mill" kw={live.mix.load} running={counts.running + counts.attention} total={MACHINES.length} stopped={counts.stopped} attention={counts.attention} active={!focus} onClick={() => setFocus(null)} />
          {HALL_BOXES.map((h) => (
            <HallChip key={h.id} title={h.title} {...hallStats[h.id]} active={focus === h.id} onClick={() => setFocus(focus === h.id ? null : h.id)} />
          ))}
        </div>
      )}

      <div className={compact ? 'relative h-full flex flex-col' : 'card p-4 relative overflow-hidden'}>
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          {isMaint ? <MaintLegend counts={maintCounts} /> : <MapLegend mode={mode} counts={counts} />}
          {!compact && (
            <div className="flex items-center gap-2">
              {focus && (
                <button onClick={() => setFocus(null)} className="btn-ghost border border-line !h-9">
                  <Maximize size={14} /> Whole mill
                </button>
              )}
              <div className="relative">
                <label className="flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-sunken w-64">
                  <Search size={15} className="text-faint" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a machine, e.g. Ring 34" className="bg-transparent outline-none text-[13px] flex-1 placeholder:text-faint" />
                </label>
                {matches.length > 0 && (
                  <div className="absolute right-0 top-10 z-20 w-64 card shadow-pop py-1">
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          select(m.id)
                          setFocus(m.hallId)
                          setQ('')
                        }}
                        className="w-full text-left px-3 py-2 text-[13px] hover:bg-sunken flex justify-between"
                      >
                        <span>{m.name}</span>
                        <span className="text-faint">{hallById[m.hallId].short}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className={clsx('w-full select-none rounded-xl', compact ? 'flex-1 min-h-0' : 'h-auto')}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <pattern id="floor-dots" width="18" height="18" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.1" fill="#D9E1DB" />
            </pattern>
            <filter id="soft" x="-5%" y="-5%" width="110%" height="115%">
              <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#18251F" floodOpacity="0.08" />
            </filter>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
            <linearGradient id="g-run" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3AA474" />
              <stop offset="1" stopColor="#237A57" />
            </linearGradient>
            <linearGradient id="g-att" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F4C443" />
              <stop offset="1" stopColor="#E0A100" />
            </linearGradient>
            <linearGradient id="g-stop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#D65645" />
              <stop offset="1" stopColor="#B83A2C" />
            </linearGradient>
            <linearGradient id="g-idle" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#C2CAC5" />
              <stop offset="1" stopColor="#A0AAA4" />
            </linearGradient>
          </defs>

          <rect x={-200} y={-200} width={VIEW.w + 400} height={VIEW.h + 400} fill="#F3F5F1" />
          <rect x={0} y={0} width={VIEW.w} height={VIEW.h} fill="url(#floor-dots)" />

          <PowerFlow kw={flowKw} />

          {HALL_BOXES.map((h) => {
            const s = hallStats[h.id]
            const dim = focus && focus !== h.id
            const hm = Object.values(maint).filter((r) => r.m.hallId === h.id)
            const mDue = hm.filter((r) => r.status === 'overdue' || r.status === 'soon').length
            const mLate = hm.some((r) => r.status === 'overdue')
            const issues = isMaint ? mDue : s.stopped + s.attention
            return (
              <g key={h.id} opacity={dim ? 0.3 : 1} style={{ transition: 'opacity .3s' }}>
                <rect x={h.x} y={h.y} width={h.w} height={h.h} rx={16} fill="#FFFFFF" stroke="#DCE4DE" filter="url(#soft)" />
                <g className={compact ? '' : 'cursor-pointer'} onClick={() => !compact && setFocus(focus === h.id ? null : h.id)}>
                  <rect x={h.x} y={h.y} width={h.w} height={44} rx={16} fill="#FFFFFF" />
                  <text x={h.x + 18} y={h.y + 29} className="font-display" fontWeight={700} fontSize={19} fill={C.ink}>
                    {h.title}
                  </text>
                  <text x={h.x + h.w - (issues ? 46 : 18)} y={h.y + 28} textAnchor="end" fontSize={13} fill={C.muted}>
                    <tspan fontWeight={700} fill={C.ink}>
                      {isMaint ? `${hm.length} machines` : `${fmt(s.kw)} kW`}
                    </tspan>
                    {isMaint ? (mDue ? ` · ${mDue} due` : ' · on schedule') : ` · ${s.running}/${s.total} running`}
                  </text>
                  {issues > 0 && (
                    <g>
                      <circle cx={h.x + h.w - 26} cy={h.y + 23} r={11} fill={(isMaint ? mLate : s.stopped) ? C.alarm : '#E0A100'} />
                      <text x={h.x + h.w - 26} y={h.y + 27.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">
                        {issues}
                      </text>
                    </g>
                  )}
                </g>
              </g>
            )
          })}

          {ZONE_BOXES.map((z) => {
            const hall = HALL_BOXES.find((h) => z.x >= h.x && z.x < h.x + h.w && z.y >= h.y && z.y < h.y + h.h)
            const dim = focus && hall && focus !== hall.id
            return (
              <g key={z.title} opacity={dim ? 0.3 : 1}>
                <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={10} fill="#F6F8F5" />
                <text x={z.x + 12} y={z.y + 20} fontSize={11.5} fontWeight={700} fill={C.muted} letterSpacing={0.6}>
                  {z.title.toUpperCase()}
                </text>
              </g>
            )
          })}

          <SourceTiles mix={live.mix} dim={!!focus && focus !== 'P1'} />

          {TILES.map((t) => {
            const m = machineById[t.id]
            const l = live.machines[t.id]
            const dim = focus && m.hallId !== focus
            const load = Math.min(1, l.kw / m.ratedKw)
            const mr = maint[t.id]
            const fill = isMaint ? (mr ? MAINT_HEX[mr.status] : '#D5DCD7') : mode === 'status' ? GRAD[l.status] : rampColor(load)
            const isSel = selected === t.id
            const flag = isMaint ? !!mr && (mr.status === 'overdue' || mr.status === 'soon' || !!mr.bringForward) : l.status === 'stopped' || l.status === 'attention'
            const haloColor = isMaint ? (mr ? (mr.bringForward && mr.status === 'ok' ? '#E0A100' : MAINT_HEX[mr.status]) : '#D5DCD7') : STATUS_META[l.status].fill
            const darkText = isMaint ? !mr || mr.status === 'soon' : mode === 'power' ? load < 0.5 : l.status === 'attention'
            const textFill = darkText ? C.ink : '#fff'
            const cx = t.x + t.w / 2
            const cy = t.y + t.h / 2
            return (
              <g
                key={t.id}
                opacity={dim ? 0.25 : 1}
                className={compact ? '' : 'cursor-pointer'}
                onClick={() => select(t.id)}
                onMouseMove={(e) => {
                  if (compact) return
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                  setHover({ id: t.id, x: e.clientX - r.left, y: e.clientY - r.top })
                }}
                onMouseLeave={() => setHover(null)}
              >
                {flag && <Shape t={t} grow={4} fill={haloColor} opacity={0.45} filter="url(#glow)" className="blink-soft" />}
                <Shape t={t} fill={fill} opacity={!isMaint && l.status === 'idle' && mode === 'status' ? 0.6 : 1} />
                {/* Machine detail: spindle lines on frames, cylinder ring on cards */}
                {t.h > 60 &&
                  Array.from({ length: Math.floor((t.h - 22) / 9) }, (_, i) => (
                    <line key={i} x1={t.x + 3} x2={t.x + t.w - 3} y1={t.y + 8 + i * 9} y2={t.y + 8 + i * 9} stroke="#fff" strokeOpacity={0.22} strokeWidth={1} />
                  ))}
                {t.shape === 'circle' && <circle cx={cx} cy={cy} r={t.w / 2 - 4} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={1.2} />}
                {isSel && <Shape t={t} grow={3} fill="none" stroke={C.brandDark} strokeWidth={3} />}
                {t.rich ? (
                  <>
                    <text x={t.x + 9} y={t.y + (t.h < 46 ? 20 : 19)} fontSize={12.5} fontWeight={700} fill={textFill}>
                      {shortName(m)}
                    </text>
                    <text
                      x={t.h < 46 ? t.x + t.w - 9 : t.x + 9}
                      y={t.h < 46 ? t.y + 20 : t.y + t.h - 13}
                      textAnchor={t.h < 46 ? 'end' : 'start'}
                      fontSize={12}
                      fill={textFill}
                      opacity={0.9}
                    >
                      {isMaint ? (mr ? dueText(mr).replace('Due in ', '').replace('Overdue by ', 'late ') : '—') : `${fmt(l.kw)} kW`}
                    </text>
                    <rect x={t.x + 9} y={t.y + t.h - 7} width={t.w - 18} height={2.5} rx={1.25} fill={textFill} opacity={0.2} />
                    <rect x={t.x + 9} y={t.y + t.h - 7} width={(t.w - 18) * Math.min(1, isMaint ? (mr?.used ?? 0) : load)} height={2.5} rx={1.25} fill={textFill} opacity={0.75} />
                  </>
                ) : t.h > 60 ? (
                  <text x={cx} y={t.y + t.h - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={textFill}>
                    {t.label}
                  </text>
                ) : (
                  <text x={cx} y={cy + 4} textAnchor="middle" fontSize={t.w > 60 ? 13 : 11.5} fontWeight={700} fill={textFill}>
                    {t.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {hover && (isMaint ? maint[hover.id] && <MaintHover r={maint[hover.id]} x={hover.x} y={hover.y} /> : <HoverCard id={hover.id} x={hover.x} y={hover.y} live={live.machines[hover.id]} />)}

        {selected && machineById[selected] && (
          <aside className="absolute right-3 top-3 bottom-3 w-[360px] max-w-[calc(100%-24px)] overflow-y-auto rounded-xl shadow-pop z-30">
            {isMaint ? (
              maint[selected] ? (
                <MaintPanel r={maint[selected]} onClose={() => select(null)} />
              ) : (
                <div className="card p-5 text-[13px] text-muted">{machineById[selected].name} has no scheduled maintenance.</div>
              )
            ) : (
              <MachinePanel m={machineById[selected]} live={live.machines[selected]} hour={live.hour} t={live.t} onClose={() => select(null)} />
            )}
          </aside>
        )}
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */

function HallChip({ title, kw, running, total, stopped, attention, active, onClick }: {
  title: string
  kw: number
  running: number
  total: number
  stopped: number
  attention: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'focus-ring text-left rounded-xl px-4 py-3 border transition-all',
        active ? 'bg-brand-dark text-white border-brand-dark shadow-pop' : 'bg-panel border-line hover:border-brand-soft shadow-card',
      )}
    >
      <div className={clsx('text-[12px] font-semibold truncate', active ? 'text-white/70' : 'text-muted')}>{title}</div>
      <div className="font-display font-bold text-[20px] num leading-tight mt-0.5">
        {kw >= 1000 ? `${fmt(kw / 1000, 2)} MW` : `${fmt(kw)} kW`}
      </div>
      <div className="flex items-center gap-2 text-[12px] mt-1">
        <span className={active ? 'text-white/70' : 'text-muted'}>
          {running}/{total} running
        </span>
        {stopped > 0 && <span className="inline-flex items-center gap-1 font-semibold text-alarm"><span className="w-1.5 h-1.5 rounded-full bg-alarm" />{stopped}</span>}
        {attention > 0 && <span className={clsx('inline-flex items-center gap-1 font-semibold', active ? 'text-solar' : 'text-warn')}><span className="w-1.5 h-1.5 rounded-full bg-solar" />{attention}</span>}
      </div>
    </button>
  )
}

function MaintChip({ title, list, active, onClick }: { title: string; list: MaintRecord[]; active: boolean; onClick: () => void }) {
  const overdue = list.filter((r) => r.status === 'overdue').length
  const soon = list.filter((r) => r.status === 'soon').length
  const early = list.filter((r) => r.bringForward).length
  return (
    <button
      onClick={onClick}
      className={clsx(
        'focus-ring text-left rounded-xl px-4 py-3 border transition-all',
        active ? 'bg-brand-dark text-white border-brand-dark shadow-pop' : 'bg-panel border-line hover:border-brand-soft shadow-card',
      )}
    >
      <div className={clsx('text-[12px] font-semibold truncate', active ? 'text-white/70' : 'text-muted')}>{title}</div>
      <div className="font-display font-bold text-[20px] num leading-tight mt-0.5">{list.length} machines</div>
      <div className="flex items-center gap-2 text-[12px] mt-1 flex-wrap">
        {overdue > 0 && <span className="inline-flex items-center gap-1 font-semibold text-alarm"><span className="w-1.5 h-1.5 rounded-full bg-alarm" />{overdue} overdue</span>}
        {soon > 0 && <span className={clsx('inline-flex items-center gap-1 font-semibold', active ? 'text-solar' : 'text-warn')}><span className="w-1.5 h-1.5 rounded-full bg-solar" />{soon} this week</span>}
        {early > 0 && <span className={active ? 'text-white/70' : 'text-muted'}>{early} early</span>}
        {overdue + soon + early === 0 && <span className={active ? 'text-white/70' : 'text-muted'}>all on schedule</span>}
      </div>
    </button>
  )
}

/** Energy flowing from the power house along the corridor to the halls */
function PowerFlow({ kw }: { kw: number }) {
  const width = 3 + Math.min(5, kw / 1000)
  const paths = ['M1200 540 V530 H320 V520', 'M820 530 V520', 'M1200 530 V520', 'M1020 680 H1000']
  return (
    <g>
      {paths.map((d) => (
        <path key={d + 'bg'} d={d} fill="none" stroke="#CFE6D8" strokeWidth={width + 3} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {paths.map((d) => (
        <path key={d} d={d} fill="none" stroke="#237A57" strokeWidth={width - 1} strokeLinecap="round" strokeDasharray="2 12" className="power-flow" />
      ))}
    </g>
  )
}

function Shape({ t, grow = 0, ...rest }: { t: { x: number; y: number; w: number; h: number; shape: string }; grow?: number } & React.SVGProps<SVGRectElement & SVGCircleElement>) {
  if (t.shape === 'circle') return <circle cx={t.x + t.w / 2} cy={t.y + t.h / 2} r={t.w / 2 + grow} {...(rest as React.SVGProps<SVGCircleElement>)} />
  return <rect x={t.x - grow} y={t.y - grow} width={t.w + grow * 2} height={t.h + grow * 2} rx={6 + grow} {...(rest as React.SVGProps<SVGRectElement>)} />
}

function SourceTiles({ mix, dim }: { mix: { grid: number; solar: number }; dim: boolean }) {
  const items = [
    { k: 'grid', label: 'Grid (LESCO)', v: mix.grid, color: C.grid },
    { k: 'solar', label: 'Solar', v: mix.solar, color: C.solar },
  ] as const
  return (
    <g opacity={dim ? 0.3 : 1}>
      {items.map((i) => {
        const b = SOURCE_TILES[i.k]
        const on = i.v > 1
        return (
          <g key={i.k}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={on ? '#FFFFFF' : '#F6F8F5'} stroke={on ? i.color : C.line} strokeWidth={on ? 1.5 : 1} />
            <circle cx={b.x + 15} cy={b.y + 17} r={5} fill={on ? i.color : C.line} className={on ? 'blink-soft' : ''} />
            <text x={b.x + 26} y={b.y + 21.5} fontSize={13} fontWeight={700} fill={C.muted}>
              {i.label}
            </text>
            <text x={b.x + 10} y={b.y + 50} fontSize={18} fontWeight={700} fill={on ? C.ink : C.faint} className="font-display">
              {on ? `${fmt(i.v)} kW` : 'Off'}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function MapLegend({ mode, counts }: { mode: Mode; counts: Record<Status, number> }) {
  if (mode === 'power')
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <span>Light load</span>
        <span className="flex gap-[2px]">
          {RAMP.map((c) => (
            <span key={c} className="w-6 h-3 rounded-sm" style={{ background: c }} />
          ))}
        </span>
        <span>Full load</span>
      </div>
    )
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(Object.keys(STATUS_META) as Status[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-sunken text-[12px]">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_META[s].fill }} />
          {STATUS_META[s].label}
          <b className="num">{counts[s]}</b>
        </span>
      ))}
    </div>
  )
}

function HoverCard({ id, x, y, live }: { id: string; x: number; y: number; live: MachineLive }) {
  const m = machineById[id]
  const ratio = live.normalKw > 0 ? (live.kw / live.normalKw - 1) * 100 : 0
  return (
    <div className="absolute z-10 pointer-events-none card shadow-pop px-3.5 py-2.5 text-[12px] min-w-[180px]" style={{ left: x + 18, top: y + 64 }}>
      <div className="font-semibold text-[14px]">{m.name}</div>
      <div className="flex items-center gap-2 mt-1">
        <span className="w-2 h-2 rounded-full" style={{ background: STATUS_META[live.status].fill }} />
        <span className="text-muted">{STATUS_META[live.status].label}</span>
      </div>
      <div className="flex items-baseline gap-2 mt-1.5">
        <b className="num text-[15px]">{fmt(live.kw, live.kw < 20 ? 1 : 0)} kW</b>
        {live.kw > 0 && Math.abs(ratio) >= 3 && <span className={ratio > 0 ? 'text-warn font-semibold' : 'text-muted'}>{ratio > 0 ? '+' : ''}{fmt(ratio)}% vs normal</span>}
      </div>
      <div className="text-faint mt-1">Click for details</div>
    </div>
  )
}

function MachinePanel({ m, live, hour, t, onClose }: { m: Machine; live: MachineLive; hour: number; t: number; onClose: () => void }) {
  const mid = pkMidnight(t)
  const feeder = feederById[m.feederId]
  const insight = insightForMachine(m.id)
  const curve = useMemo(
    () => Array.from({ length: 96 }, (_, i) => i * 0.25).filter((h) => h <= hour).map((h) => [h, Math.round(machineAt(m, h, mid + h * 3600_000).kw * 10) / 10]),
    [m, Math.floor(hour * 4)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const todayKwh = curve.reduce((s, [, kw]) => s + kw * 0.25, 0)
  const ratio = live.normalKw > 0 ? live.kw / live.normalKw : 1
  const tone = live.status === 'stopped' ? 'alarm' : live.status === 'attention' ? 'warn' : 'ok'

  return (
    <div className="card overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-line">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">{hallById[m.hallId].name}</div>
            <h2 className="font-display font-bold text-[20px] leading-tight mt-1">{m.name}</h2>
            <div className="mt-2">
              <StatusPill status={live.status} />
            </div>
          </div>
          <button onClick={onClose} className="focus-ring w-8 h-8 grid place-items-center rounded-lg hover:bg-sunken text-muted" title="Close">
            <X size={16} />
          </button>
        </div>
        {live.note && <div className={clsx('mt-3 rounded-lg px-3 py-2.5 text-[13px]', tone === 'alarm' ? 'bg-alarm-bg text-alarm' : 'bg-warn-bg text-warn')}>{live.note}</div>}
      </div>

      <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b border-line">
        <Fig label="Power now" value={fmt(live.kw, live.kw < 20 ? 1 : 0)} unit="kW" sub={`Normal ${fmt(live.normalKw, live.normalKw < 20 ? 1 : 0)} kW`} />
        <Fig
          label="Compared to normal"
          value={live.kw === 0 ? '—' : `${ratio >= 1 ? '+' : ''}${fmt((ratio - 1) * 100)}%`}
          unit=""
          sub={live.kw === 0 ? 'Not running' : Math.abs(ratio - 1) < 0.05 ? 'As expected' : ratio > 1 ? 'Higher than normal' : 'Lower than normal'}
          tone={ratio > 1.05 ? 'warn' : undefined}
        />
        <Fig label="Used today" value={fmt(todayKwh)} unit="units" />
        <Fig label="Stops this month" value={String(monthStops(t).filter((s) => s.machine.id === m.id).length)} unit="" sub={DT_IDS.has(m.id) ? 'Production machine' : 'Not tracked for downtime'} />
      </div>

      <div className="px-5 pt-4">
        <div className="eyebrow">Power today</div>
        <ReactECharts
          style={{ height: 120 }}
          notMerge
          option={{
            animation: false,
            grid: { left: 36, right: 6, top: 10, bottom: 22 },
            tooltip: { ...tooltipBase, trigger: 'axis', formatter: (p: { value: [number, number] }[]) => `${hhmm(p[0].value[0])} · <b>${fmt(p[0].value[1], 1)} kW</b>` },
            xAxis: { type: 'value', min: 0, max: 24, interval: 6, axisLabel: { ...axisLabel, formatter: (v: number) => `${v}:00` }, axisLine: { lineStyle: { color: C.line } }, splitLine: { show: false } },
            yAxis: { type: 'value', axisLabel, splitLine: { lineStyle: { color: C.line } } },
            series: [{ type: 'line', data: curve, symbol: 'none', smooth: 0.2, lineStyle: { width: 2, color: C.brand }, areaStyle: { color: C.mint } }],
          }}
        />
      </div>

      <div className="px-5 py-3 flex flex-col gap-2">
        {live.status === 'stopped' && (
          <Link to={`/downtime#${m.id}`} className="btn-primary justify-center">
            <Timer size={15} /> Why it stopped, and for how long
          </Link>
        )}
        {insight && (
          <Link to={`/advisor#${insight.id}`} className="btn-primary justify-center">
            See what to do <ArrowRight size={15} />
          </Link>
        )}
        <Link to={`/ask?m=${m.id}`} className={clsx(insight ? 'btn-ghost border border-line' : 'btn-primary', 'justify-center')}>
          <Bot size={15} /> Ask Enervtek about this machine
        </Link>
      </div>

      <Disclosure label="Machine details" hideLabel="Hide details" className="px-2 pb-3">
        <dl className="px-3 grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
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
      </Disclosure>
    </div>
  )
}

function Fig({ label, value, unit, sub, tone }: { label: string; value: string; unit: string; sub?: string; tone?: 'warn' }) {
  return (
    <div>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className={clsx('font-display font-bold text-[20px] num', tone === 'warn' && 'text-warn')}>{value}</span>
        {unit && <span className="text-[12px] text-muted">{unit}</span>}
      </div>
      {sub && <div className="text-[12px] text-muted">{sub}</div>}
    </div>
  )
}
