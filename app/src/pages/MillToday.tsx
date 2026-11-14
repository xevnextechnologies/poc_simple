// Home dashboard: everything the owner needs at a glance, shown as charts.
// Layout follows a card grid: 3 small trend cards, a breakdown + a big
// overview chart, then 3 cards for machines, money and demand.
import clsx from 'clsx'
import ReactECharts from 'echarts-for-react'
import { ChevronDown, Info, Sun, Target } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MACHINES, SITE } from '../data/din'
import { C, FONT, axisLabel, tooltipBase } from '../components/charts/theme'
import { STATUS_META } from '../components/ui/primitives'
import { fmt, hhmm, pkr } from '../lib/format'
import { AREA_DAY_KWH, BLENDED_RS, LEDGER, SAVING_NOW_RS, last30 } from '../sim/costs'
import { DAY_CURVE, TARIFF, type Status } from '../sim/engine'
import { INSIGHTS, MDI, OPEN_RS_MONTH } from '../sim/insights'
import { useLive } from '../sim/useLive'

const AREA_COLORS = ['#1F8A5B', '#3D7FC4', '#E0A100', '#8E6BD1', '#D9738B', '#A0AAA4']
const STATUS_HEX: Record<Status, string> = { running: '#237A57', attention: '#E0A100', stopped: '#B83A2C', idle: '#A0AAA4' }
const dayLabel = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short' }).format(t)
const gradient = (rgb: string, top = 0.35) => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: `rgba(${rgb},${top})` },
    { offset: 1, color: `rgba(${rgb},0.02)` },
  ],
})
const hourAxis = (every = 23) => ({
  type: 'category',
  boundaryGap: false,
  data: DAY_CURVE.map((s) => hhmm(s.hour)),
  axisTick: { show: false },
  axisLine: { lineStyle: { color: C.line } },
  axisLabel: { ...axisLabel, interval: every },
})
const yAxis = (fmtv?: (v: number) => string, extra = {}) => ({
  type: 'value',
  axisLabel: { ...axisLabel, formatter: fmtv },
  splitLine: { lineStyle: { color: C.line, type: 'dashed' } },
  ...extra,
})

export function MillToday() {
  const live = useLive()
  const slot = Math.floor(live.hour * 4)
  const days = useMemo(() => last30(), [])

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <PowerNow live={live} slot={slot} />
      <GridSolar slot={slot} />
      <Ukg days={days} />

      <WherePowerGoes />
      <div className="xl:col-span-2">
        <CostOverview days={days} />
      </div>

      <MachinesNow live={live} />
      <MoneyFound />
      <DemandToday slot={slot} />
    </div>
  )
}

/* ------------------------------ card chrome ------------------------------ */

export function Card({ title, info, to, chips, period, children, className }: {
  title: string
  info: string
  to?: string
  chips?: ReactNode
  period: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={clsx('card p-5 flex flex-col min-w-0', className)}>
      <header className="mb-2">
        <div className="flex items-center gap-3 min-h-[28px]">
        <div className="flex items-center gap-1.5 min-w-0">
          {to ? (
            <Link to={to} className="font-display font-semibold text-[16px] truncate hover:text-brand">
              {title}
            </Link>
          ) : (
            <h2 className="font-display font-semibold text-[16px] truncate">{title}</h2>
          )}
          <span title={info} className="text-faint hover:text-muted cursor-help shrink-0">
            <Info size={14} />
          </span>
        </div>
        <span className="ml-auto shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-line text-[12px] text-muted">
          {period} <ChevronDown size={12} />
        </span>
        </div>
        {chips && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] mt-1">{chips}</div>}
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  )
}

function Chip({ color, label, dashed }: { color: string; label: ReactNode; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted">
      {dashed ? <span className="w-3 border-t-2 border-dashed" style={{ borderColor: color }} /> : <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
      {label}
    </span>
  )
}

/* ------------------------------ row 1 ------------------------------ */

export function PowerNow({ live, slot, h = 150 }: { live: ReturnType<typeof useLive>; slot: number; h?: number }) {
  const option = useMemo(() => {
    const pts = DAY_CURVE.slice(0, slot + 1).map((s) => Math.round(s.load))
    pts[pts.length - 1] = Math.round(live.mix.load)
    return {
      animation: false,
      grid: { left: 40, right: 12, top: 18, bottom: 22 },
      tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: number) => `${fmt(v)} kW` },
      xAxis: hourAxis(),
      yAxis: yAxis((v) => (v ? `${v / 1000}` : '0'), { max: 5000, interval: 2500, name: 'MW', nameTextStyle: { ...axisLabel, padding: [0, 24, -6, 0] } }),
      series: [
        {
          name: 'Mill load',
          type: 'line',
          smooth: 0.4,
          symbol: 'none',
          lineStyle: { width: 2.5, color: C.brand },
          areaStyle: { color: gradient('35,122,87') },
          data: pts,
          markPoint: {
            symbol: 'circle',
            symbolSize: 10,
            itemStyle: { color: C.brand, borderColor: '#fff', borderWidth: 2 },
            label: { show: false },
            data: [{ coord: [pts.length - 1, pts[pts.length - 1]] }],
          },
        },
      ],
    }
  }, [slot, Math.round(live.mix.load / 10)]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title="Mill load" info="Total power the whole mill is using, live from the incomer meters." to="/map" period="Today" chips={<Chip color={C.brand} label={<b className="text-fg num">{fmt(live.mix.load / 1000, 2)} MW</b>} />}>
      <ReactECharts option={option} style={{ height: h }} notMerge />
    </Card>
  )
}

export function GridSolar({ slot, h = 150 }: { slot: number; h?: number }) {
  const option = useMemo(() => {
    const pts = DAY_CURVE.slice(0, slot + 1)
    return {
      animation: false,
      grid: { left: 40, right: 12, top: 18, bottom: 22 },
      tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: number) => `${fmt(v)} kW` },
      xAxis: hourAxis(),
      yAxis: yAxis((v) => (v ? `${v / 1000}` : '0'), { max: 5000, interval: 2500, name: 'MW', nameTextStyle: { ...axisLabel, padding: [0, 24, -6, 0] } }),
      series: [
        { name: 'Grid (LESCO)', type: 'line', smooth: 0.4, symbol: 'none', lineStyle: { width: 2.5, color: C.grid }, data: pts.map((s) => Math.round(s.grid)) },
        { name: 'Solar', type: 'line', smooth: 0.4, symbol: 'none', lineStyle: { width: 2.5, color: C.solar, type: 'dashed' }, areaStyle: { color: gradient('224,161,0', 0.18) }, data: pts.map((s) => Math.round(s.solar)) },
      ],
    }
  }, [slot])
  return (
    <Card
      title="Grid & solar"
      info="Where the power comes from: the LESCO grid and Din's own 5.1 MWp solar plant."
      to="/savings"
      period="Today"
      chips={
        <>
          <Chip color={C.grid} label="Grid" />
          <Chip color={C.solar} label="Solar" dashed />
        </>
      }
    >
      <ReactECharts option={option} style={{ height: h }} notMerge />
    </Card>
  )
}

export function Ukg({ days, h = 150 }: { days: ReturnType<typeof last30>; h?: number }) {
  const d = days.slice(-14)
  const option = {
    animation: false,
    grid: { left: 40, right: 12, top: 18, bottom: 22 },
    tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: number) => `${fmt(v, 2)} kWh/kg` },
    xAxis: { type: 'category', data: d.map((x) => dayLabel(x.t)), axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { ...axisLabel, interval: 4 } },
    yAxis: yAxis((v) => fmt(v, 1), { min: 4.2, max: 4.5, interval: 0.1 }),
    series: [
      { name: 'Normal', type: 'line', symbol: 'none', lineStyle: { width: 2, color: C.grid, type: 'dashed' }, data: d.map(() => SITE.ukgBaseline) },
      {
        name: 'Daily',
        type: 'line',
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: C.alarm },
        itemStyle: { color: C.alarm },
        data: d.map((x) => +(x.kwh / x.kg).toFixed(3)),
      },
    ],
  }
  return (
    <Card
      title="Units per kg"
      info="Electricity used for every kg of yarn: your own efficiency number (UKG). Lower is better."
      to="/savings"
      period="14 days"
      chips={
        <>
          <Chip color={C.alarm} label="Daily" />
          <Chip color={C.grid} label="Normal" dashed />
        </>
      }
    >
      <ReactECharts option={option} style={{ height: h }} notMerge />
    </Card>
  )
}

/* ------------------------------ row 2 ------------------------------ */

export function WherePowerGoes({ h = 200 }: { h?: number } = {}) {
  const total = AREA_DAY_KWH.reduce((s, a) => s + a.kwh, 0)
  const top = AREA_DAY_KWH.slice(0, 5)
  const rest = AREA_DAY_KWH.slice(5).reduce((s, a) => s + a.kwh, 0)
  const items = [...top.map((a) => ({ name: a.label, kwh: a.kwh })), { name: 'Everything else', kwh: rest }]
  const option = {
    animation: false,
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: { name: string; value: number; percent: number }) => `<b>${p.name}</b><br/>${pkr(p.value * 30 * BLENDED_RS)} / month · ${fmt(p.percent)}%` },
    series: [
      {
        type: 'pie',
        radius: ['52%', '82%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: items.map((x, i) => ({ name: x.name, value: Math.round(x.kwh), itemStyle: { color: AREA_COLORS[i] } })),
      },
    ],
  }
  return (
    <Card title="Where the power goes" info="Share of this month's electricity bill by area of the mill." to="/savings" period="This month">
      <ReactECharts option={option} style={{ height: h }} notMerge />
      <div className="space-y-1.5 mt-3">
        {items.map((x, i) => (
          <div key={x.name} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 text-[12px]">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: AREA_COLORS[i] }} />
            <span className="truncate">{x.name}</span>
            <span className="num text-muted">{pkr(x.kwh * 30 * BLENDED_RS)}</span>
            <b className="num w-9 text-right">{fmt((x.kwh / total) * 100)}%</b>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function CostOverview({ days, h = 350 }: { days: ReturnType<typeof last30>; h?: number }) {
  const solarRs = days.map((d) => d.solarKwh * TARIFF.gridRs)
  const bill = days.map((d) => d.cost)
  const avg = bill.reduce((s, x) => s + x, 0) / bill.length
  const solarTotal = solarRs.reduce((s, x) => s + x, 0)
  const option = {
    animation: false,
    grid: { left: 52, right: 40, top: 34, bottom: 28 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: { dataIndex: number }[]) => {
        const i = p[0].dataIndex
        return `<b>${dayLabel(days[i].t)}</b><br/><span style="color:${C.grid}">●</span> Grid bill: <b>${pkr(bill[i])}</b><br/><span style="color:${C.solar}">●</span> Saved by solar: <b>${pkr(solarRs[i])}</b><br/>${fmt(days[i].kg)} kg yarn`
      },
    },
    xAxis: { type: 'category', data: days.map((d) => dayLabel(d.t)), axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { ...axisLabel, interval: 3 } },
    yAxis: yAxis((v) => (v ? `${fmt(v / 1e5)}` : '0'), { name: 'Rs lakh', nameTextStyle: { ...axisLabel, padding: [0, 0, 0, 10] }, max: 4_000_000, interval: 1_000_000 }),
    series: [
      {
        name: 'Grid bill',
        type: 'bar',
        stack: 'c',
        barWidth: '58%',
        itemStyle: { color: C.grid },
        label: { show: false },
        data: bill.map(Math.round),
        markLine: {
          silent: true,
          symbol: ['none', 'circle'],
          symbolSize: 6,
          lineStyle: { color: C.ink, type: 'dashed', width: 1 },
          label: { show: false },
          data: [{ yAxis: Math.round(avg) }],
        },
      },
      {
        name: 'Saved by solar',
        type: 'bar',
        stack: 'c',
        itemStyle: { color: C.solar, borderRadius: [4, 4, 0, 0] },
        data: solarRs.map(Math.round),
      },
    ],
  }
  return (
    <Card
      title="Electricity cost"
      info="What the grid bill is each day (blue), and how much more it would be without your solar plant (amber). Dashed line: daily average."
      to="/savings"
      period="30 days"
      chips={
        <>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Sun size={14} className="text-solar" />
            <span className="text-muted">Solar saved:</span> <b className="num">{pkr(solarTotal)}</b>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Target size={14} className="text-muted" />
            <span className="text-muted">Average:</span> <b className="num">{pkr(avg)}/day</b>
          </span>
          <Chip color={C.grid} label="Grid bill" />
          <Chip color={C.solar} label="Saved by solar" />
        </>
      }
    >
      <ReactECharts option={option} style={{ height: h }} notMerge />
    </Card>
  )
}

/* ------------------------------ row 3 ------------------------------ */

export function MachinesNow({ live, h = 220 }: { live: ReturnType<typeof useLive>; h?: number }) {
  const counts: Record<Status, number> = { running: 0, attention: 0, stopped: 0, idle: 0 }
  for (const m of MACHINES) counts[live.machines[m.id].status]++
  const order: Status[] = ['running', 'attention', 'stopped', 'idle']
  const running = counts.running + counts.attention
  const option = {
    animation: false,
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: { name: string; value: number }) => `${p.name}: <b>${p.value}</b> machines` },
    graphic: [
      { type: 'text', left: 'center', top: '40%', style: { text: String(running), fill: C.ink, font: `700 26px ${FONT}`, textAlign: 'center' } },
      { type: 'text', left: 'center', top: '56%', style: { text: `of ${MACHINES.length} running`, fill: C.muted, font: `12px ${FONT}`, textAlign: 'center' } },
    ],
    series: [
      {
        type: 'pie',
        radius: ['62%', '84%'],
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: order.filter((s) => counts[s] > 0).map((s) => ({ name: STATUS_META[s].label, value: counts[s], itemStyle: { color: STATUS_HEX[s] } })),
      },
    ],
  }
  return (
    <Card title="Machines" info="Every machine's live state. Amber: using more than normal or showing wear. Red: stopped." to="/map" period="Live">
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <ReactECharts option={option} style={{ height: h }} notMerge />
        <div className="space-y-2.5 pr-2">
          {order.map((s) => (
            <div key={s} className="flex items-center gap-2 text-[12px]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_HEX[s] }} />
              <span className="text-muted w-[84px]">{STATUS_META[s].label}</span>
              <b className="num">{counts[s]}</b>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

const SHORT: Record<string, string> = {
  'restart-peak': 'Restart peak',
  'compressor-night': 'Compressor at night',
  'ring-34': 'Ring Frame 34',
  'ac-persistence': 'AC saving slipping',
  lights: 'Lighting timer',
  'ac-night': 'AC night setting',
  'waste-plant': 'Waste plant off',
}

export function MoneyFound({ h = 220 }: { h?: number } = {}) {
  const waste = INSIGHTS.filter((i) => i.kind === 'waste').sort((a, b) => a.rsMonth - b.rsMonth)
  const saved = [...LEDGER].sort((a, b) => a.nowRs - b.nowRs)
  const rows = [...saved.map((r) => ({ name: SHORT[r.id], v: r.nowRs, c: C.brand })), ...waste.map((i) => ({ name: SHORT[i.id], v: i.rsMonth, c: '#E0A100' }))]
  const option = {
    animation: false,
    grid: { left: 132, right: 56, top: 4, bottom: 4 },
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: { name: string; value: number; color: string }) => `<b>${p.name}</b><br/>${pkr(p.value)} / month ${p.color === C.brand ? 'saved' : 'to save'}` },
    xAxis: { type: 'value', show: false, max: Math.max(...rows.map((r) => r.v)) * 1.05 },
    yAxis: { type: 'category', data: rows.map((r) => r.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisLabel, color: C.muted, fontSize: 12, width: 124, overflow: 'truncate' } },
    series: [
      {
        type: 'bar',
        barWidth: 12,
        data: rows.map((r) => ({ value: Math.round(r.v), itemStyle: { color: r.c, borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', color: C.ink, fontFamily: FONT, fontSize: 11, fontWeight: 600, formatter: (p: { value: number }) => pkr(p.value).replace('Rs ', '') },
      },
    ],
  }
  return (
    <Card
      title="Money"
      info="Amber: waste Enervtek found that you can still remove (per month). Green: savings already made and measured (per month)."
      to="/advisor"
      period="Per month"
      chips={
        <>
          <Chip color="#E0A100" label={<b className="text-fg num">{pkr(OPEN_RS_MONTH)}</b>} />
          <Chip color={C.brand} label={<b className="text-fg num">{pkr(SAVING_NOW_RS)}</b>} />
        </>
      }
    >
      <ReactECharts option={option} style={{ height: h }} notMerge />
    </Card>
  )
}

export function DemandToday({ slot, h = 220 }: { slot: number; h?: number }) {
  const option = useMemo(() => {
    const pts = DAY_CURVE.slice(0, slot + 1).map((s) => Math.round(s.grid))
    const peakIdx = DAY_CURVE.findIndex((s) => Math.round(s.grid) === Math.round(MDI.restartPeak))
    return {
      animation: false,
      grid: { left: 40, right: 16, top: 20, bottom: 22 },
      tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: number) => `${fmt(v)} kW` },
      xAxis: hourAxis(23),
      yAxis: yAxis((v) => (v ? `${v / 1000}` : '0'), { min: 0, max: 5500, interval: 2500, name: 'MW', nameTextStyle: { ...axisLabel, padding: [0, 24, -6, 0] } }),
      series: [
        {
          name: 'Grid demand',
          type: 'line',
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { width: 2, color: C.alarm },
          areaStyle: { color: gradient('184,58,44', 0.14) },
          data: pts,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: C.ink, type: 'dashed', width: 1 },
            label: { show: false },
            data: [{ yAxis: SITE.sanctionedKw }],
          },
          markPoint:
            slot > peakIdx
              ? { symbol: 'circle', symbolSize: 10, itemStyle: { color: C.alarm, borderColor: '#fff', borderWidth: 2 }, label: { show: false }, data: [{ coord: [peakIdx, Math.round(MDI.restartPeak)] }] }
              : undefined,
        },
      ],
    }
  }, [slot])
  return (
    <Card
      title="Grid demand"
      info={`Power drawn from LESCO, every 15 minutes. Dashed line: the ${fmt(SITE.sanctionedKw / 1000, 1)} MW supply limit. The highest 15 minutes of the month sets the demand charge.`}
      to="/advisor#restart-peak"
      period="Today"
      chips={
        <>
          <Chip color={C.alarm} label={<b className="text-fg num">Peak {fmt(MDI.restartPeak)} kW</b>} />
          <Chip color={C.ink} label="Limit" dashed />
        </>
      }
    >
      <ReactECharts option={option} style={{ height: h }} notMerge />
    </Card>
  )
}
