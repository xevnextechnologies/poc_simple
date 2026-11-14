// Power quality & harmonics.
// Structure: one matrix of the three LT panels → the selected panel's harmonic
// fingerprint → the chain from drives to the machines that receive the
// distortion → what to fix → engineering evidence → sources → events.
import clsx from 'clsx'
import ReactECharts from 'echarts-for-react'
import { useMemo, useState, type ReactNode } from 'react'
import { LT_BUSES, MACHINES, PF_PANELS, TRANSFORMERS, feederById } from '../data/din'
import type { BusId } from '../data/din'
import { HandOff, LayerFrame } from '../components/layout/LayerFrame'
import { Card } from './MillToday'
import { C, FONT, axisLabel, tooltipBase } from '../components/charts/theme'
import { Disclosure } from '../components/ui/structure'
import { busLabel, fmt, hhmm } from '../lib/format'
import {
  BUS_PQ,
  FEEDER_PQ,
  LIMITS,
  ORDERS,
  PQ_EVENTS,
  VFD_INPUT,
  amplification,
  busLoadMix,
  currentLimit,
  levelFor,
  loadType,
  nonLinearRegister,
  resonanceOrder,
  tdd,
  thdv,
  thdvDay,
  waveform,
  type BusPQ,
  type Level,
} from '../sim/pq'

const ord = (h: number) => `${h}${h === 2 ? 'nd' : h === 3 ? 'rd' : 'th'}`
const HEX: Record<Level, string> = { ok: '#237A57', watch: '#E0A100', act: '#B83A2C' }
const TEXT: Record<Level, string> = { ok: 'text-brand', watch: 'text-warn', act: 'text-alarm' }
const RANK: Record<Level, number> = { act: 0, watch: 1, ok: 2 }

/* ------------------------------ per-panel facts ------------------------------ */

function busFacts(b: BusPQ) {
  const pf = PF_PANELS.find((p) => p.bus === b.bus)!
  const tr = TRANSFORMERS.find((t) => t.bus === b.bus)!
  const hr = resonanceOrder(b.bus, b.stepsIn)
  const nearest = Math.abs(hr - 5) < Math.abs(hr - 7) ? 5 : 7
  const dist = Math.abs(hr - nearest)
  const machines = MACHINES.filter((m) => feederById[m.feederId].bus === b.bus)
  const drives = machines.filter((m) => loadType(m) === 'vfd').length
  const mix = busLoadMix(b.bus)
  return {
    pf,
    tr,
    hr,
    nearest,
    resLevel: (dist < 0.6 ? 'act' : dist < 1.2 ? 'watch' : 'ok') as Level,
    amp: amplification(nearest, hr),
    machines: machines.length,
    drives,
    drivePct: (mix.vfd / mix.total) * 100,
    v: thdv(b),
    d: tdd(b),
    vLevel: levelFor(thdv(b), LIMITS.thdv),
    dLevel: levelFor(tdd(b), LIMITS.tdd),
    capLevel: (b.stepsFailed > 0 ? 'act' : levelFor(b.capCurrentPct, LIMITS.capCurrent, 0.88)) as Level,
    nLevel: (b.neutralPct > 60 ? 'act' : b.neutralPct > 25 ? 'watch' : 'ok') as Level,
    kLevel: (b.kFactor > 4 ? 'watch' : 'ok') as Level,
  }
}

interface Issue {
  level: Level
  title: string
  measured: string
  limit: string
  action: string
}

function issues(b: BusPQ): Issue[] {
  const f = busFacts(b)
  const list: Issue[] = [
    {
      level: f.resLevel,
      title: f.resLevel === 'act' ? `Capacitor bank amplifies the ${ord(f.nearest)} harmonic` : f.resLevel === 'watch' ? `Resonance close to the ${ord(f.nearest)}` : 'Capacitor resonance',
      measured: `${fmt(f.hr, 1)} with ${b.stepsIn}/${f.pf.steps} steps in`,
      limit: 'Away from 5 and 7',
      action: 'Fit 7% detuning reactors on the capacitor steps.',
    },
    {
      level: f.capLevel,
      title: b.stepsFailed ? 'Capacitors overloaded' : 'Capacitor load',
      measured: `${b.capCurrentPct}%${b.stepsFailed ? ` · ${b.stepsFailed} steps failed` : ''}`,
      limit: `${LIMITS.capCurrent}% (IEC 60831)`,
      action: 'Replace failed cans with detuned steps, not new fuses. Check for bulging.',
    },
    {
      level: f.dLevel,
      title: 'Harmonic current from drives',
      measured: `${fmt(f.d, 1)}% · 5th ${fmt(b.current[5] ?? 0, 1)}%`,
      limit: `${LIMITS.tdd}% · 5th/7th 7%`,
      action: 'Check drives for DC chokes or 3–5% line reactors. Active filter only if still above 8%.',
    },
    {
      level: f.vLevel,
      title: 'Voltage distortion',
      measured: `${fmt(f.v, 1)}%`,
      limit: `${LIMITS.thdv}% (IEEE 519)`,
      action: 'Falls most once the resonance is fixed. Re-measure after the work.',
    },
    {
      level: f.nLevel,
      title: '3rd harmonic in the neutral',
      measured: `${b.neutralPct}% of phase current`,
      limit: '60% (normal under 20%)',
      action: 'Check the Mills Light feeder neutral is at least the size of the phases.',
    },
    {
      level: f.kLevel,
      title: 'Transformer heating',
      measured: `K-factor ${fmt(b.kFactor, 1)}`,
      limit: 'K 5 (1 = no harmonics)',
      action: 'Keep loading under about 90% of nameplate until harmonics fall.',
    },
  ]
  return list.sort((a, c) => RANK[a.level] - RANK[c.level])
}

/* ---------------------------------- page ---------------------------------- */

export function PowerQuality() {
  const [bus, setBus] = useState<BusId>('LT2')
  const b = BUS_PQ[bus]

  return (
    <LayerFrame
      layer={2}
      title="Power quality & harmonics"
      subtitle="Drives draw current in pulses, which adds harmonics to the supply. Every LT panel is measured continuously against international limits."
    >
      <Disclosure label="What are harmonics?" hideLabel="Hide the explanation" className="-mt-3 mb-2 -ml-3">
        <div className="grid md:grid-cols-3 gap-8 pl-3 pt-1 pb-2 text-[13px] text-muted leading-relaxed max-w-5xl [&_b]:text-fg [&_b]:font-semibold">
          <p>
            <b>The wave.</b> Clean power is a smooth 50 Hz wave. Machines on drives pull current in short pulses, adding extra waves at 250 Hz, 350 Hz and up: the 5th, 7th and higher harmonics.
          </p>
          <p>
            <b>The sources.</b> Cards, ring frames, autoconers and Open End run on drives and make the <b>5th and 7th</b>. Lighting and offices make the <b>3rd</b>. Compressors make almost none.
          </p>
          <p>
            <b>The risk.</b> A capacitor bank can <b>amplify</b> one harmonic (resonance). Then capacitors overheat and fail, transformers run hot, and the distorted voltage reaches every machine on that panel.
          </p>
        </div>
      </Disclosure>

      <Heading title="Panel limits" note="How close each LT panel is to its limits. Click a panel to show its detail below." first />
      <PanelLimits bus={bus} setBus={setBus} />

      <Heading title={`Harmonic spectrum · ${busLabel(bus)}`} note="Harmonic current by order, against IEEE 519 limits, and one cycle of the current wave." />
      <div className="grid xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5">
        <Frame title="Harmonic current by order" legend={<LegendSpectrum />}>
          <Spectrum b={b} />
        </Frame>
        <WaveFrame b={b} />
      </div>

      <Heading title={`Distortion path · ${busLabel(bus)}`} note="From the drives to the voltage every machine on this panel receives." />
      <Chain b={b} />

      <Heading title={`Corrective actions · ${busLabel(bus)}`} note="Most urgent first." />
      <FixTable b={b} />

      <Heading title="Resonance and daily trend" note="Resonance calculated from the SLD (transformer and capacitor bank ratings)." />
      <div className="grid xl:grid-cols-2 gap-5">
        <Frame title="Resonance vs capacitor steps switched in" legend={<span className="text-muted">Red bands: 5th and 7th</span>}>
          <Resonance b={b} />
        </Frame>
        <Frame title={`Voltage distortion today · ${busLabel(bus)}`} legend={<span className="text-muted">Dashed: 8% limit</span>}>
          <Day bus={bus} />
        </Frame>
      </div>

      <Heading title="Harmonic sources" note="Load mix per panel and feeders with the highest harmonic current." />
      <Sources bus={bus} />

      <Heading title="Events · last 30 days" note="Voltage dips, distortion peaks and capacitor failures." />
      <Events />

      <HandOff
        text="these measurements become one fix plan for LT#2: detuned capacitor steps, drive chokes, and a check after the work is done."
        to="/advisor#lt2-harmonics"
        label="See the recommendation"
      />
    </LayerFrame>
  )
}

/* ------------------------------ layout pieces ------------------------------ */

function Heading({ title, note, first }: { title: string; note: string; first?: boolean }) {
  return (
    <div className={clsx(first ? 'mt-6' : 'mt-12', 'mb-4')}>
      <h2 className="font-display font-semibold text-[19px] leading-tight">{title}</h2>
      <p className="text-[13px] text-muted mt-1">{note}</p>
    </div>
  )
}

function Frame({ title, legend, children }: { title: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <section className="card px-5 pt-4 pb-3 min-w-0">
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <h3 className="font-semibold text-[14px]">{title}</h3>
        {legend}
      </div>
      {children}
    </section>
  )
}

function Dot({ level }: { level: Level }) {
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: HEX[level] }} />
}

/* ------------------------------ 1. panel limits ------------------------------ */

interface Measure {
  label: string
  value: string
  /** Measured value as a share of its limit (1 = at the limit) */
  share: number
  level: Level
}

function measures(b: BusPQ): Measure[] {
  const f = busFacts(b)
  const dist = Math.abs(f.hr - f.nearest)
  const list: Measure[] = [
    { label: 'Voltage distortion', value: `${fmt(f.v, 1)}%`, share: f.v / LIMITS.thdv, level: f.vLevel },
    { label: 'Harmonic current', value: `${fmt(f.d, 1)}%`, share: f.d / LIMITS.tdd, level: f.dLevel },
    // 100% = within 0.6 of the 5th or 7th harmonic; 0% = 2 or more away
    { label: 'Capacitor resonance', value: `${fmt(f.hr, 1)}${f.resLevel === 'act' ? ` · ${ord(f.nearest)}` : ''}`, share: Math.max(0, (2 - dist) / 1.4), level: f.resLevel },
    { label: 'Capacitor load', value: `${b.capCurrentPct}%`, share: b.capCurrentPct / LIMITS.capCurrent, level: f.capLevel },
    { label: 'Neutral current', value: `${b.neutralPct}%`, share: b.neutralPct / 60, level: f.nLevel },
    { label: 'Transformer heating', value: `K ${fmt(b.kFactor, 1)}`, share: b.kFactor / 5, level: f.kLevel },
  ]
  return list.sort((a, c) => c.share - a.share)
}

const LIMIT_INFO =
  'Each reading is shown as a share of its own limit, so different units compare on one scale. Limits: voltage distortion 8%, harmonic current 8% (IEEE 519), capacitor load 130% (IEC 60831), neutral current 60%, transformer K-factor 5, resonance kept clear of the 5th and 7th harmonic.'

function PanelLimits({ bus, setBus }: { bus: BusId; setBus: (b: BusId) => void }) {
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      {LT_BUSES.map((lb) => {
        const b = BUS_PQ[lb.id]
        const f = busFacts(b)
        const list = measures(b)
        const worst = list[0]
        const over = list.filter((m) => m.level === 'act').length
        const close = list.filter((m) => m.level === 'watch').length
        const active = bus === lb.id
        const gauge = {
          animation: false,
          series: [
            {
              type: 'gauge',
              startAngle: 200,
              endAngle: -20,
              min: 0,
              max: 150,
              radius: '100%',
              center: ['50%', '64%'],
              splitNumber: 3,
              axisLine: {
                roundCap: false,
                lineStyle: {
                  width: 14,
                  color: [
                    [75 / 150, '#CFE6D8'],
                    [100 / 150, '#F6DFA6'],
                    [1, '#F1C3BD'],
                  ],
                },
              },
              progress: { show: true, width: 14, itemStyle: { color: HEX[worst.level] } },
              pointer: { show: false },
              axisTick: { show: false },
              splitLine: { show: false },
              axisLabel: { show: false },
              anchor: { show: false },
              title: { show: false },
              detail: {
                valueAnimation: false,
                offsetCenter: [0, '-6%'],
                // Arc is capped at 150%; the number shows the real value
                formatter: () => `{v|${Math.round(worst.share * 100)}%}\n{l|of limit}`,
                rich: {
                  v: { fontFamily: FONT, fontSize: 30, fontWeight: 700, color: HEX[worst.level], lineHeight: 34 },
                  l: { fontFamily: FONT, fontSize: 12, color: C.muted, lineHeight: 18 },
                },
              },
              data: [{ value: Math.min(150, worst.share * 100) }],
            },
          ],
        }
        return (
          <div
            key={lb.id}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            onClick={() => setBus(lb.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setBus(lb.id)}
            className={clsx('focus-ring rounded-xl cursor-pointer transition-shadow', active ? 'ring-2 ring-brand shadow-pop' : 'hover:shadow-pop')}
          >
            <Card
              title={busLabel(lb.id)}
              info={LIMIT_INFO}
              period={active ? 'Selected' : 'Live'}
              chips={
                <>
                  {over > 0 && <Chip color={HEX.act} label={`${over} over limit`} />}
                  {close > 0 && <Chip color={HEX.watch} label={`${close} close`} />}
                  {over + close === 0 && <Chip color={HEX.ok} label="All within limits" />}
                  <span className="text-muted">
                    {f.machines} machines · {fmt(f.drivePct)}% on drives
                  </span>
                </>
              }
              className="h-full"
            >
              <ReactECharts option={gauge} style={{ height: 150 }} notMerge />
              <div className="text-center text-[12px] -mt-1 mb-4">
                Worst reading: <b>{worst.label}</b>
              </div>
              <div className="space-y-2">
                {list.map((m) => (
                  <div key={m.label} className="grid grid-cols-[auto_1fr_auto_52px] items-center gap-2.5 text-[13px]">
                    <span className="w-2 h-2 rounded-full" style={{ background: HEX[m.level] }} />
                    <span className={clsx('truncate', m.level === 'ok' && 'text-muted')}>{m.label}</span>
                    <span className={clsx('num font-semibold', m.level !== 'ok' && TEXT[m.level])}>{m.value}</span>
                    <span className="num text-[11px] text-muted text-right">{Math.round(m.share * 100)}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )
      })}
    </div>
  )
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap" style={{ color }}>
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

/* ------------------------------ 2. fingerprint ------------------------------ */

function LegendSpectrum() {
  return (
    <span className="flex items-center gap-3 text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: HEX.ok }} /> Within limit
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: HEX.act }} /> Over limit
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 border-t-2 border-dashed border-fg/60" /> IEEE 519 limit
      </span>
    </span>
  )
}

function Spectrum({ b }: { b: BusPQ }) {
  const option = {
    animation: false,
    grid: { left: 40, right: 8, top: 22, bottom: 30 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: { name: string; value: number }[]) => `<b>${p[0].name} harmonic</b> · ${Number(p[0].name.replace(/\D/g, '')) * 50} Hz<br/>Measured <b>${fmt(p[0].value, 1)}%</b> · limit ${fmt(p[1].value, 1)}%`,
    },
    xAxis: { type: 'category', data: ORDERS.map(ord), axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel },
    yAxis: { type: 'value', axisLabel: { ...axisLabel, formatter: '{value}%' }, splitLine: { lineStyle: { color: C.line, type: 'dashed' } } },
    series: [
      {
        type: 'bar',
        barWidth: '52%',
        data: ORDERS.map((h) => {
          const v = b.current[h] ?? 0
          const over = v > currentLimit(h)
          return {
            value: v,
            itemStyle: { color: over ? HEX.act : HEX.ok, opacity: over ? 1 : 0.85, borderRadius: [4, 4, 0, 0] },
            label: over ? { show: true, position: 'top', formatter: `${fmt(v, 1)}%`, color: HEX.act, fontWeight: 700, fontFamily: FONT, fontSize: 12 } : undefined,
          }
        }),
      },
      { type: 'line', step: 'middle', symbol: 'none', lineStyle: { color: C.ink, width: 1.5, type: 'dashed', opacity: 0.6 }, data: ORDERS.map(currentLimit) },
    ],
  }
  return <ReactECharts option={option} style={{ height: 300 }} notMerge />
}

function WaveFrame({ b }: { b: BusPQ }) {
  const [kind, setKind] = useState<'bus' | 'drive'>('bus')
  const pts = kind === 'bus' ? waveform(b.current) : waveform(VFD_INPUT)
  const option = {
    animation: false,
    grid: { left: 36, right: 8, top: 22, bottom: 30 },
    xAxis: { type: 'category', data: pts.map((p) => p.ms), axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { ...axisLabel, interval: 49, formatter: (v: string) => `${Math.round(Number(v))} ms` } },
    yAxis: { type: 'value', min: -1.8, max: 1.8, interval: 0.9, axisLabel: { ...axisLabel, formatter: (v: number) => fmt(v, 1) }, splitLine: { lineStyle: { color: C.line, type: 'dashed' } } },
    series: [
      { type: 'line', symbol: 'none', data: pts.map((p) => p.ideal), lineStyle: { width: 1.5, color: C.faint, type: 'dashed' } },
      { type: 'line', symbol: 'none', smooth: false, data: pts.map((p) => p.y), lineStyle: { width: 2.5, color: HEX.act } },
    ],
  }
  const thdi = kind === 'bus' ? tdd(b) : Math.sqrt(Object.values(VFD_INPUT).reduce<number>((s, v) => s + (v ?? 0) ** 2, 0))
  return (
    <Frame
      title="One cycle of current (20 ms)"
      legend={
        <span className="inline-flex rounded-full bg-sunken p-0.5">
          {(['bus', 'drive'] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={clsx('focus-ring h-6 px-2.5 rounded-full text-[11px] font-semibold', kind === k ? 'bg-panel text-fg shadow-card' : 'text-muted')}>
              {k === 'bus' ? 'Panel incomer' : 'One card drive'}
            </button>
          ))}
        </span>
      }
    >
      <ReactECharts option={option} style={{ height: 268 }} notMerge />
      <div className="flex items-center justify-between text-[12px] text-muted pb-1">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-faint" /> Clean wave
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded" style={{ background: HEX.act }} /> Measured
          </span>
        </span>
        <span>
          Distortion <b className="text-fg num">{fmt(thdi, 0)}%</b>
        </span>
      </div>
    </Frame>
  )
}

/* ------------------------------ 3. distortion path ------------------------------ */

/** Small drawings that show what each number in the path measures */
function Glyph({ kind, color }: { kind: 'drives' | 'spectrum' | 'resonance' | 'capacitor' | 'voltage'; color: string }) {
  const p = { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 48 28" className="w-12 h-7" aria-hidden>
      {kind === 'drives' && <path {...p} d="M2 14h6l3-10 3 20 3-10h6l3-10 3 20 3-10h6l3-6 3 6" />}
      {kind === 'spectrum' && (
        <g fill={color}>
          {[18, 24, 9, 14, 6, 10, 4, 6].map((h, i) => (
            <rect key={i} x={3 + i * 5.6} y={26 - h} width="3.4" height={h} rx="1" opacity={i === 1 ? 1 : 0.55} />
          ))}
        </g>
      )}
      {kind === 'resonance' && <path {...p} d="M2 25c8 0 12-1 15-6 3-5 4-17 7-17s4 12 7 17c3 5 7 6 15 6" />}
      {kind === 'capacitor' && (
        <g {...p}>
          <path d="M2 14h17M29 14h17" />
          <path d="M19 4v20M29 4v20" strokeWidth={3} />
        </g>
      )}
      {kind === 'voltage' && <path {...p} d="M2 14c3-9 6-11 9-9 2 1 3 3 5 1 2-2 4-1 6 4s4 14 7 13c2 0 3-3 5-1 2 2 3 4 5 1 2-3 4-9 7-9" />}
    </svg>
  )
}

function Chain({ b }: { b: BusPQ }) {
  const f = busFacts(b)
  const steps: { glyph: 'drives' | 'spectrum' | 'resonance' | 'capacitor' | 'voltage'; label: string; what: string; value: string; unit?: string; sub: string; level: Level | 'info' }[] = [
    { glyph: 'drives', label: 'Drives', what: 'Share of load on drives, which draw current in pulses', value: fmt(f.drivePct), unit: '%', sub: `${f.drives} drives on this panel`, level: 'info' },
    { glyph: 'spectrum', label: 'Harmonic current', what: 'The extra current at 250, 350 Hz… that the pulses create', value: fmt(f.d, 1), unit: '%', sub: `limit ${LIMITS.tdd}%`, level: f.dLevel },
    {
      glyph: 'resonance',
      label: 'Capacitor resonance',
      what: 'The harmonic where the capacitor bank and transformer amplify',
      value: fmt(f.hr, 1),
      sub: f.resLevel === 'ok' ? 'clear of 5th & 7th' : `${ord(f.nearest)} amplified ×${fmt(f.amp, 1)}`,
      level: f.resLevel,
    },
    { glyph: 'capacitor', label: 'Capacitor load', what: 'Current in the capacitor bank against its rating', value: String(b.capCurrentPct), unit: '%', sub: b.stepsFailed ? `${b.stepsFailed} of ${f.pf.steps} steps failed` : `limit ${LIMITS.capCurrent}%`, level: f.capLevel },
    { glyph: 'voltage', label: 'Bus voltage distortion', what: 'How bent the voltage wave is that every machine receives', value: fmt(f.v, 1), unit: '%', sub: `on all ${f.machines} machines`, level: f.vLevel },
  ]
  const color = (l: Level | 'info') => (l === 'info' ? C.brandDark : HEX[l])
  return (
    <div className="relative grid grid-cols-1 md:grid-cols-5 gap-y-8 pt-1">
      {/* the line joining the nodes */}
      <div className="hidden md:block absolute top-[27px] left-[10%] right-[10%] h-[2px] bg-line" />
      {steps.map((s) => (
        <div key={s.label} className="relative flex md:flex-col md:items-center md:text-center gap-4 md:gap-0 px-2">
          <span
            className="relative z-10 w-14 h-14 rounded-full grid place-items-center shrink-0 bg-bg"
            style={{ boxShadow: `inset 0 0 0 2px ${color(s.level)}, 0 0 0 6px rgb(var(--bg))` }}
          >
            <Glyph kind={s.glyph} color={color(s.level)} />
          </span>
          <div className="md:mt-3">
            <div className="text-[13px] font-semibold">{s.label}</div>
            <div className="text-[12px] text-muted mt-0.5 md:max-w-[190px] md:mx-auto leading-snug">{s.what}</div>
            <div className={clsx('font-display font-bold text-[30px] num leading-none mt-3', s.level !== 'info' && s.level !== 'ok' && TEXT[s.level])}>
              {s.value}
              {s.unit && <span className="text-[15px] font-semibold ml-0.5">{s.unit}</span>}
            </div>
            <div className={clsx('text-[12px] mt-1.5', s.level === 'info' || s.level === 'ok' ? 'text-muted' : TEXT[s.level])}>{s.sub}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------ 4. what to fix ------------------------------ */

function FixTable({ b }: { b: BusPQ }) {
  const list = issues(b)
  const open = list.filter((i) => i.level !== 'ok')
  const fine = list.filter((i) => i.level === 'ok')
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="px-5 py-3 font-semibold">Issue</th>
            <th className="px-4 py-3 font-semibold">Measured</th>
            <th className="px-4 py-3 font-semibold">Limit</th>
            <th className="px-5 py-3 font-semibold">What to do</th>
          </tr>
        </thead>
        <tbody>
          {open.map((i) => (
            <tr key={i.title} className="border-b border-line last:border-0 align-top">
              <td className="px-5 py-3.5">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <Dot level={i.level} />
                  {i.title}
                </span>
              </td>
              <td className={clsx('px-4 py-3.5 num font-semibold whitespace-nowrap', TEXT[i.level])}>{i.measured}</td>
              <td className="px-4 py-3.5 text-muted whitespace-nowrap">{i.limit}</td>
              <td className="px-5 py-3.5">{i.action}</td>
            </tr>
          ))}
          {open.length === 0 && (
            <tr>
              <td colSpan={4} className="px-5 py-4 text-brand font-semibold">
                Everything on this panel is within limits.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {fine.length > 0 && (
        <div className="px-5 py-3 border-t border-line text-[12px] text-muted flex flex-wrap gap-x-4 gap-y-1">
          <span className="font-semibold text-brand">Within limits:</span>
          {fine.map((i) => (
            <span key={i.title}>
              {i.title} <span className="num">({i.measured})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------ 5. evidence ------------------------------ */

function Resonance({ b }: { b: BusPQ }) {
  const pf = PF_PANELS.find((p) => p.bus === b.bus)!
  const steps = Array.from({ length: pf.steps }, (_, i) => i + 1)
  const hr = resonanceOrder(b.bus, b.stepsIn)
  const option = {
    animation: false,
    grid: { left: 44, right: 16, top: 24, bottom: 40 },
    tooltip: { ...tooltipBase, trigger: 'axis', formatter: (p: { name: string; value: number }[]) => `${p[0].name} steps in → resonance at <b>${fmt(p[0].value, 1)}</b>` },
    xAxis: { type: 'category', data: steps.map(String), name: 'Capacitor steps switched in', nameLocation: 'middle', nameGap: 26, nameTextStyle: { ...axisLabel }, axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel },
    yAxis: { type: 'value', min: 3, max: 15, interval: 2, axisLabel: { ...axisLabel, formatter: (v: number) => ord(v) }, splitLine: { lineStyle: { color: C.line, type: 'dashed' } } },
    series: [
      {
        type: 'line',
        symbolSize: 7,
        itemStyle: { color: C.brandDark },
        lineStyle: { width: 2, color: C.brandDark },
        data: steps.map((s) => ({
          value: +resonanceOrder(b.bus, s).toFixed(2),
          symbolSize: s === b.stepsIn ? 15 : 7,
          itemStyle: s === b.stepsIn ? { color: HEX.act, borderColor: '#fff', borderWidth: 2 } : undefined,
          label: s === b.stepsIn ? { show: true, position: 'top', distance: 10, formatter: `Now: ${fmt(hr, 1)}`, color: C.ink, fontWeight: 700, fontFamily: FONT, fontSize: 11 } : undefined,
        })),
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(184,58,44,0.10)' },
          label: { show: true, position: 'insideLeft', color: HEX.act, fontFamily: FONT, fontSize: 11, fontWeight: 700 },
          data: [
            [{ yAxis: 4.6, name: '5th' }, { yAxis: 5.4 }],
            [{ yAxis: 6.6, name: '7th' }, { yAxis: 7.4 }],
          ],
        },
      },
    ],
  }
  return <ReactECharts option={option} style={{ height: 250 }} notMerge />
}

function Day({ bus }: { bus: BusId }) {
  const pts = useMemo(() => thdvDay(bus), [bus])
  const option = {
    animation: false,
    grid: { left: 40, right: 16, top: 24, bottom: 30 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      formatter: (p: { dataIndex: number }[]) => {
        const x = pts[p[0].dataIndex]
        return `${hhmm(x.hour)} · distortion <b>${fmt(x.thdv, 1)}%</b><br/>${x.steps} capacitor steps in`
      },
    },
    xAxis: { type: 'category', boundaryGap: false, data: pts.map((p) => hhmm(p.hour)), axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { ...axisLabel, interval: 11 } },
    yAxis: { type: 'value', min: 0, max: 10, axisLabel: { ...axisLabel, formatter: '{value}%' }, splitLine: { lineStyle: { color: C.line, type: 'dashed' } } },
    series: [
      {
        type: 'line',
        symbol: 'none',
        smooth: 0.3,
        lineStyle: { width: 2.5, color: C.brandDark },
        areaStyle: { color: C.mint },
        data: pts.map((p) => p.thdv),
        markLine: { silent: true, symbol: 'none', lineStyle: { color: HEX.act, type: 'dashed' }, label: { show: false }, data: [{ yAxis: 8 }] },
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(224,161,0,0.10)' },
          label: { show: true, position: 'insideTop', color: C.warn, fontFamily: FONT, fontSize: 11, formatter: (p: { name: string }) => p.name },
          data: [
            [{ xAxis: '01:00', name: 'Cleaning' }, { xAxis: '04:00' }],
            [{ xAxis: '08:00', name: 'Solar hours' }, { xAxis: '16:00' }],
          ],
        },
      },
    ],
  }
  return <ReactECharts option={option} style={{ height: 250 }} notMerge />
}

/* ------------------------------ 6. sources ------------------------------ */

function Sources({ bus }: { bus: BusId }) {
  const feeders = [...FEEDER_PQ].sort((a, b) => b.thdi - a.thdi)
  const reg = nonLinearRegister()
  const colors = { vfd: HEX.act, single: '#E0A100', linear: '#C9D2CC' }
  const FRow = ({ f }: { f: (typeof FEEDER_PQ)[number] }) => (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pl-5 pr-3 font-medium">{f.name}</td>
      <td className={clsx('py-2.5 px-3 text-muted whitespace-nowrap', f.bus === bus && 'text-fg font-semibold')}>{busLabel(f.bus)}</td>
      <td className="py-2.5 px-3 w-[200px]">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-sunken overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(f.thdi / 50) * 100}%`, background: f.dominant === 3 ? colors.single : f.thdi > 35 ? HEX.act : HEX.ok }} />
          </div>
          <span className="num font-semibold w-9 text-right">{f.thdi}%</span>
        </div>
      </td>
      <td className="py-2.5 px-3 num text-muted">{ord(f.dominant)}</td>
      <td className="py-2.5 pr-5 pl-3 text-muted">{f.note}</td>
    </tr>
  )
  return (
    <div className="grid xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] gap-5">
      <section className="card p-5">
        <h3 className="font-semibold text-[14px]">Share of each panel's load</h3>
        <div className="space-y-4 mt-4">
          {LT_BUSES.map((lb) => {
            const m = busLoadMix(lb.id)
            return (
              <div key={lb.id}>
                <div className="flex justify-between text-[13px] mb-1.5">
                  <span className={clsx(lb.id === bus ? 'font-semibold' : 'text-muted')}>{busLabel(lb.id)}</span>
                  <span className="num">
                    <b>{fmt((m.vfd / m.total) * 100)}%</b> <span className="text-muted">drives</span>
                  </span>
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]">
                  <div style={{ width: `${(m.vfd / m.total) * 100}%`, background: colors.vfd }} />
                  <div style={{ width: `${(m.single / m.total) * 100}%`, background: colors.single }} />
                  <div style={{ width: `${(m.linear / m.total) * 100}%`, background: colors.linear }} />
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted mt-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors.vfd }} /> Drives · 5th, 7th
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors.single }} /> Single-phase · 3rd
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors.linear }} /> Direct motors · none
          </span>
        </div>
        <Disclosure label="Every load group" hideLabel="Hide load groups" className="mt-3 -ml-3">
          <table className="w-full text-[12px]">
            <tbody>
              {reg.map((g) => (
                <tr key={g.name} className="border-b border-line last:border-0">
                  <td className="py-1.5 pl-3">
                    <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: g.type === 'vfd' ? colors.vfd : g.type === 'single-phase' ? colors.single : colors.linear }} />
                    {g.name}
                  </td>
                  <td className="py-1.5 text-right num text-muted">{g.count}</td>
                  <td className="py-1.5 text-right num">{fmt(g.kw)} kW</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Disclosure>
      </section>

      <section className="card overflow-x-auto">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h3 className="font-semibold text-[14px]">Feeders with the most harmonic current</h3>
          <span className="text-[12px] text-muted">at each feeder meter</span>
        </div>
        <table className="w-full min-w-[700px] text-[13px]">
          <thead>
            <tr className="border-y border-line text-left text-muted">
              <th className="py-2 pl-5 pr-3 font-semibold">Feeder</th>
              <th className="py-2 px-3 font-semibold">Panel</th>
              <th className="py-2 px-3 font-semibold">Harmonic current</th>
              <th className="py-2 px-3 font-semibold">Main</th>
              <th className="py-2 pr-5 pl-3 font-semibold">Load</th>
            </tr>
          </thead>
          <tbody>
            {feeders.slice(0, 6).map((f) => (
              <FRow key={f.id} f={f} />
            ))}
          </tbody>
        </table>
        <Disclosure label={`${feeders.length - 6} more feeders`} hideLabel="Show fewer" className="px-2 py-2">
          <table className="w-full min-w-[700px] text-[13px]">
            <tbody>
              {feeders.slice(6).map((f) => (
                <FRow key={f.id} f={f} />
              ))}
            </tbody>
          </table>
        </Disclosure>
      </section>
    </div>
  )
}

/* ------------------------------ 7. events ------------------------------ */

function Events() {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        <tbody>
          {PQ_EVENTS.map((e) => (
            <tr key={e.what} className="border-b border-line last:border-0">
              <td className="py-3 pl-5 pr-3 w-[130px] whitespace-nowrap text-muted">
                <span className="inline-flex items-center gap-2">
                  <Dot level={e.level} />
                  {e.when}
                </span>
              </td>
              <td className="py-3 px-3 font-medium">{e.what}</td>
              <td className="py-3 pr-5 pl-3 text-muted">{e.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
