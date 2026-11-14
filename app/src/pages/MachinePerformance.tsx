// Machine performance, written for someone seeing it for the first time.
// The idea is one sentence: identical machines doing the same job should use
// the same power. Everything on the page is a direct, labelled comparison.
import clsx from 'clsx'
import ReactECharts from 'echarts-for-react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HandOff, LayerFrame } from '../components/layout/LayerFrame'
import { C, FONT, axisLabel, tooltipBase } from '../components/charts/theme'
import { Disclosure } from '../components/ui/structure'
import { fmt, pkr } from '../lib/format'
import { HEALTH, PEER_GROUPS, PERF_FLAGGED, groupRows, type Level, type PeerGroup } from '../sim/health'

const HEX: Record<Level, string> = { ok: '#4FA67D', watch: '#E0A100', act: '#B83A2C' }
const WORD: Record<Level, string> = { ok: 'Normal', watch: 'A little high', act: 'Too high' }

const ALL = PEER_GROUPS.flatMap((g) => groupRows(g).map((r) => ({ ...r, group: g })))
const FLAGGED = [...PERF_FLAGGED].sort((a, b) => b.rs - a.rs)
const RECOVERABLE = FLAGGED.reduce((s, r) => s + r.rs, 0)
/** Units per kg: 3 decimals for small values so differences stay visible */
const u = (v: number, ref = v) => fmt(v, Math.abs(ref) < 1 ? 3 : 2)

/** Days since a machine's gap started growing (from its 6-week drift record) */
function driftDays(id: string): number | null {
  const t = HEALTH[id]?.trendKey === 'drift' ? HEALTH[id].trend : undefined
  if (!t) return null
  const i = t.findIndex((v, k) => v > 2 && t.slice(k).every((x) => x > 2))
  return i > 0 ? t.length - i : null
}

export function MachinePerformance() {
  const [open, setOpen] = useState<string | null>(FLAGGED[0]?.group.id ?? null)

  return (
    <LayerFrame
      layer={2}
      title="Machine performance"
      subtitle="Identical machines doing the same job should use the same amount of power. Enervtek compares each machine with its identical neighbours every few seconds, so a machine that starts using more stands out straight away."
    >
      <Overview />

      <Block title={`The ${FLAGGED.length} machines using too much power`} note="Each one compared with the identical machines next to it, making the same yarn.">
        <div className="card divide-y divide-line">
          {FLAGGED.map((r) => (
            <Comparison
              key={r.id}
              r={r}
              onShowGroup={() => {
                setOpen(r.group.id)
                setTimeout(() => document.getElementById(`group-${r.group.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
              }}
            />
          ))}
        </div>
      </Block>

      <Block title="Every machine group" note="Click a group to see each machine in it.">
        <div className="card divide-y divide-line">
          {PEER_GROUPS.map((g) => (
            <GroupRow key={g.id} g={g} open={open === g.id} onToggle={() => setOpen(open === g.id ? null : g.id)} />
          ))}
        </div>
      </Block>

      <HandOff
        text="Ring Frame 34 is the biggest gap. Enervtek lists what to check first (spindle tapes, rollers, suction filter) and confirms the saving after the fix."
        to="/advisor#ring-34"
        label="See what to do"
      />
    </LayerFrame>
  )
}

/* ------------------------------ building blocks ------------------------------ */

function Block({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display font-semibold text-[20px] leading-tight">{title}</h2>
      <p className="text-[14px] text-muted mt-1 mb-4">{note}</p>
      {children}
    </section>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
      {(['ok', 'watch', 'act'] as Level[]).map((l) => (
        <span key={l} className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-[3px]" style={{ background: HEX[l] }} />
          {WORD[l]}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------ 1. overview: one square per machine ------------------------------ */

function Overview() {
  const order: Level[] = ['act', 'watch', 'ok']
  const sorted = [...ALL].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level))
  return (
    <section className="grid lg:grid-cols-[1fr_auto] gap-x-12 gap-y-6 items-center">
      <div>
        <p className="font-display font-semibold text-[24px] leading-snug max-w-[34ch]">
          <span className="text-alarm">
            {FLAGGED.length} of {ALL.length}
          </span>{' '}
          machines use more power than identical machines doing the same work.
        </p>
        <p className="text-[15px] text-muted mt-2">
          Together that costs about <b className="text-fg">{pkr(RECOVERABLE)} a month</b>. The other {ALL.length - FLAGGED.length} are normal.
        </p>
      </div>
      <div>
        <div className="text-[12px] text-muted mb-2">Each square is one machine</div>
        <div className="grid grid-cols-[repeat(19,14px)] gap-[4px]">
          {sorted.map((r) => (
            <span
              key={r.id}
              title={`${r.name}: ${WORD[r.level]}`}
              className="w-[14px] h-[14px] rounded-[3px]"
              style={{ background: HEX[r.level], boxShadow: r.level !== 'ok' ? `0 0 0 2px #fff, 0 0 0 3.5px ${HEX[r.level]}` : undefined }}
            />
          ))}
        </div>
        <div className="mt-3">
          <Legend />
        </div>
      </div>
    </section>
  )
}

/* ------------------------------ 2. one machine vs its neighbours ------------------------------ */

function Comparison({ r, onShowGroup }: { r: (typeof FLAGGED)[number]; onShowGroup: () => void }) {
  const normal = r.group.baseUkg
  const scale = r.ukg * 1.08
  const days = driftDays(r.id)
  const link = r.id === 'RF-34' ? { to: '/advisor#ring-34', label: 'What to do' } : { to: `/health?m=${r.id}`, label: 'Health check' }
  const neighbours = r.group.ids.length - 1

  return (
    <div className="grid lg:grid-cols-[190px_minmax(0,1fr)_220px] gap-x-8 gap-y-4 px-6 py-6 items-center">
      <div>
        <div className="font-display font-semibold text-[18px]">{r.name}</div>
        <div className="text-[13px] text-muted mt-0.5">
          {r.group.label} · {r.group.work.split(' · ')[1] ?? r.group.work}
        </div>
        <span className="inline-flex items-center gap-1.5 mt-2 text-[12px] font-semibold" style={{ color: HEX[r.level] }}>
          <span className="w-2 h-2 rounded-full" style={{ background: HEX[r.level] }} />
          {WORD[r.level]}
        </span>
      </div>

      {/* Two bars: what identical machines use, and what this one uses */}
      <div className="space-y-3">
        <BarLine label={`${neighbours} identical machines`} value={normal} scale={scale} color="#BFCAC3" />
        <BarLine label={r.name} value={r.ukg} scale={scale} color={HEX.ok} extraFrom={normal} extraColor={HEX[r.level]} strong />
        <div className="text-[13px]">
          Uses <b style={{ color: HEX[r.level] }}>{u(r.ukg - normal, normal)} more units for every kg</b> of yarn ({fmt(r.dev, 1)}% more).
        </div>
      </div>

      <div className="lg:text-right">
        <div className="font-display font-bold text-[24px] num leading-none">{pkr(r.rs)}</div>
        <div className="text-[13px] text-muted mt-1">wasted every month</div>
        <div className="text-[13px] mt-2">{days ? `Started ${days} days ago` : 'Small, steady gap'}</div>
        <div className="flex lg:justify-end gap-3 mt-3 text-[13px] font-semibold whitespace-nowrap">
          <button onClick={onShowGroup} className="focus-ring text-muted hover:text-fg">
            See its group
          </button>
          <Link to={link.to} className="text-brand hover:underline inline-flex items-center gap-1">
            {link.label} <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  )
}

function BarLine({ label, value, scale, color, extraFrom, extraColor, strong }: {
  label: string
  value: number
  scale: number
  color: string
  extraFrom?: number
  extraColor?: string
  strong?: boolean
}) {
  const base = extraFrom ?? value
  return (
    <div className="grid grid-cols-[150px_minmax(90px,1fr)_auto] items-center gap-3">
      <span className={clsx('text-[13px] truncate', strong ? 'font-semibold' : 'text-muted')}>{label}</span>
      <span className="relative h-5 rounded-[4px] bg-sunken overflow-hidden">
        <span className="absolute inset-y-0 left-0" style={{ width: `${(base / scale) * 100}%`, background: color }} />
        {extraFrom != null && (
          <span className="absolute inset-y-0" style={{ left: `${(base / scale) * 100}%`, width: `${((value - base) / scale) * 100}%`, background: extraColor }} />
        )}
      </span>
      <span className={clsx('num text-[13px] w-[104px]', strong && 'font-semibold')}>{u(value)} units / kg</span>
    </div>
  )
}

/* ------------------------------ 3. every group ------------------------------ */

function GroupRow({ g, open, onToggle }: { g: PeerGroup; open: boolean; onToggle: () => void }) {
  const rows = groupRows(g)
  const off = rows.filter((r) => r.level !== 'ok')
  const worst: Level = off.some((r) => r.level === 'act') ? 'act' : off.length ? 'watch' : 'ok'
  const verdict = off.length
    ? `${off.length} of ${rows.length} ${off.length === 1 ? 'uses' : 'use'} too much: ${off.map((r) => r.name).join(', ')}`
    : `All ${rows.length} normal`

  return (
    <div id={`group-${g.id}`} className="scroll-mt-4">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="focus-ring w-full text-left px-6 py-4 grid md:grid-cols-[230px_1fr_auto] gap-x-8 gap-y-2 items-center hover:bg-sunken/50 transition-colors"
      >
        <div>
          <div className="font-semibold text-[15px]">{g.label}</div>
          <div className="text-[12px] text-muted">{g.work}</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-wrap gap-[3px]">
            {rows.map((r) => (
              <span key={r.id} title={`${r.name}: ${WORD[r.level]}`} className="w-[11px] h-[11px] rounded-[2px]" style={{ background: HEX[r.level] }} />
            ))}
          </div>
          <span className="text-[13px] font-semibold" style={{ color: worst === 'ok' ? C.brand : HEX[worst] }}>
            {verdict}
          </span>
        </div>
        <ChevronDown size={18} className={clsx('text-faint transition-transform hidden md:block', open && 'rotate-180')} />
      </button>
      {open && <GroupDetail g={g} />}
    </div>
  )
}

function GroupDetail({ g }: { g: PeerGroup }) {
  const rows = groupRows(g)
  const lo = Math.min(...rows.map((r) => r.ukg), g.baseUkg)
  const hi = Math.max(...rows.map((r) => r.ukg), g.baseUkg)
  const pad = (hi - lo) * 0.45 + g.baseUkg * 0.015
  const option = {
    animation: false,
    grid: { left: 56, right: 72, top: 30, bottom: 40 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: { dataIndex: number }[]) => {
        const r = rows[p[0].dataIndex]
        return `<b>${r.name}</b><br/>${u(r.ukg)} units per kg<br/>${WORD[r.level]}${r.rs ? ` · ${pkr(r.rs)} a month extra` : ''}`
      },
    },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.id.replace(/^[A-Z]+-/, '')),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: C.line } },
      axisLabel: { ...axisLabel, interval: 0 },
      name: 'Machine number',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: { ...axisLabel },
    },
    yAxis: {
      type: 'value',
      min: +(lo - pad).toFixed(2),
      max: +(hi + pad).toFixed(2),
      axisLabel: { ...axisLabel, formatter: (v: number) => u(v) },
      splitLine: { lineStyle: { color: C.line, type: 'dashed' } },
      name: 'Units per kg',
      nameTextStyle: { ...axisLabel, padding: [0, 0, 0, 24] },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 26,
        data: rows.map((r) => ({
          value: +r.ukg.toFixed(3),
          itemStyle: { color: HEX[r.level], borderRadius: [4, 4, 0, 0] },
          label: r.level !== 'ok' ? { show: true, position: 'top', formatter: `+${fmt(r.dev, 1)}%`, color: C.ink, fontWeight: 700, fontFamily: FONT, fontSize: 12 } : undefined,
        })),
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: C.ink, type: 'dashed', width: 1.5 },
          label: { position: 'end', formatter: `Normal\n${u(g.baseUkg)}`, color: C.ink, fontFamily: FONT, fontSize: 11, fontWeight: 700, lineHeight: 15 },
          data: [{ yAxis: g.baseUkg }],
        },
      },
    ],
  }
  return (
    <div className="px-6 pb-6 pt-2 bg-sunken/40 border-t border-line">
      <p className="text-[13px] text-muted mt-2">
        Each bar is one machine. The dashed line is what a machine in this group normally uses: <b className="text-fg">{u(g.baseUkg)} units per kg</b>. A bar above the line means
        that machine uses more.
      </p>
      <ReactECharts option={option} style={{ height: 270 }} notMerge />
      <Disclosure label="Show the numbers" hideLabel="Hide the numbers" className="-ml-3">
        <table className="w-full text-[13px] bg-panel rounded-lg overflow-hidden">
          <thead>
            <tr className="text-left text-muted border-b border-line">
              <th className="py-2 pl-3 font-semibold">Machine</th>
              <th className="py-2 font-semibold text-right">Units per kg</th>
              <th className="py-2 font-semibold text-right">Compared with normal</th>
              <th className="py-2 pr-3 font-semibold text-right">Extra cost a month</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].sort((a, b) => b.dev - a.dev).map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="py-2 pl-3 font-medium">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: HEX[r.level] }} />
                  {r.name}
                </td>
                <td className="py-2 text-right num">{u(r.ukg)}</td>
                <td className="py-2 text-right num" style={{ color: r.level === 'ok' ? undefined : HEX[r.level] }}>
                  {r.dev >= 0 ? '+' : ''}
                  {fmt(r.dev, 1)}%
                </td>
                <td className="py-2 pr-3 text-right num">{r.rs > 0 ? pkr(r.rs) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Disclosure>
    </div>
  )
}
