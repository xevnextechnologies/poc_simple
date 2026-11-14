// Cost & savings, in the same chart-card language as Mill today:
// cost → cost per kg → solar; where the money goes → used vs expected;
// power used while stopped → savings ledger.
import clsx from 'clsx'
import ReactECharts from 'echarts-for-react'
import { ClipboardEdit, Info } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HandOff, LayerFrame } from '../components/layout/LayerFrame'
import { C, FONT, axisLabel, tooltipBase } from '../components/charts/theme'
import { fmt, pkr } from '../lib/format'
import {
  AREA_DAY_KWH,
  BASELINE,
  BLENDED_RS,
  CLEANING_VERDICT,
  CO2_PER_KG_YARN,
  ESTIMATED_RS,
  LEDGER,
  PRODUCTION_TODAY,
  SAVED_TO_DATE_RS,
  SAVING_NOW_RS,
  VERIFIED_RS,
  last30,
} from '../sim/costs'
import { TARIFF } from '../sim/engine'
import { Card } from './MillToday'

type Days = ReturnType<typeof last30>

const dayLabel = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short' }).format(t)
const lakh = (v: number) => (v ? fmt(v / 1e5, v < 1e6 ? 1 : 0) : '0')
const gridY = (fmtv: (v: number) => string, extra = {}) => ({
  type: 'value',
  axisLabel: { ...axisLabel, formatter: fmtv },
  splitLine: { lineStyle: { color: C.line, type: 'dashed' } },
  ...extra,
})
const dayX = (days: Days, every = 6) => ({
  type: 'category',
  data: days.map((d) => dayLabel(d.t)),
  axisTick: { show: false },
  axisLine: { lineStyle: { color: C.line } },
  axisLabel: { ...axisLabel, interval: every },
})

const VERDICT_HEX = { avoidable: '#B83A2C', partly: '#E0A100', needed: '#8FD3AE', standby: '#C9D2CC' }
const SHORT: Record<string, string> = { lights: 'Lighting timer', 'ac-night': 'AC night setting', 'waste-plant': 'Waste plant off' }

export function CostSavings() {
  const days = useMemo(() => last30(), [])
  const month = days.reduce((a, d) => ({ cost: a.cost + d.cost, kwh: a.kwh + d.kwh, kg: a.kg + d.kg, solar: a.solar + d.solarKwh }), { cost: 0, kwh: 0, kg: 0, solar: 0 })

  return (
    <LayerFrame
      layer={2}
      title="Cost & savings"
      subtitle="Where the money goes, how efficient the mill is for the yarn it makes, and a record of every saving."
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <CostTrend days={days} total={month.cost} />
        <CostPerKg rsPerKg={month.cost / month.kg} />
        <SolarSaved days={days} total={month.solar * TARIFF.gridRs} share={month.solar / month.kwh} />

        <WhereMoneyGoes />
        <div className="xl:col-span-2">
          <UsedVsExpected days={days} />
        </div>

        <WhileStopped />
        <div className="xl:col-span-2">
          <Ledger />
        </div>
      </div>

      <div className="mt-5 flex gap-2.5 text-[12px] text-muted px-1">
        <Info size={14} className="text-brand shrink-0 mt-0.5" />
        <span>
          Counts electricity from the LESCO grid and Din's own solar plant. Carbon is about {fmt(CO2_PER_KG_YARN, 2)} kg CO₂ per kg of yarn (estimated).
        </span>
      </div>

      <HandOff text="the biggest open waste is the 04:00 restart peak and the autocone compressor at night. Both cost nothing to fix." to="/advisor" label="See what to fix first" />
    </LayerFrame>
  )
}

function Chip({ color, label, dashed }: { color: string; label: ReactNode; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted">
      {dashed ? (
        <svg width="14" height="4" aria-hidden>
          <line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
        </svg>
      ) : (
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      )}
      {label}
    </span>
  )
}

/* ------------------------------ row 1 ------------------------------ */

function CostTrend({ days, total }: { days: Days; total: number }) {
  const avg = total / days.length
  const option = {
    animation: false,
    grid: { left: 40, right: 12, top: 20, bottom: 22 },
    tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: number) => pkr(v) },
    xAxis: { ...dayX(days, 9), boundaryGap: false },
    yAxis: gridY(lakh, { min: 2_000_000, max: 3_000_000, interval: 500_000, name: 'Rs lakh', nameTextStyle: { ...axisLabel, padding: [0, 0, -4, 14] } }),
    series: [
      {
        name: 'Grid bill',
        type: 'line',
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { width: 2.5, color: C.grid },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(61,127,196,0.28)' }, { offset: 1, color: 'rgba(61,127,196,0.02)' }] } },
        data: days.map((d) => Math.round(d.cost)),
        markLine: { silent: true, symbol: 'none', lineStyle: { color: C.ink, type: 'dashed', width: 1, opacity: 0.5 }, label: { show: false }, data: [{ yAxis: Math.round(avg) }] },
      },
    ],
  }
  return (
    <Card
      title="Electricity cost"
      info="What the mill paid for electricity each day. Dashed line: the daily average."
      period="30 days"
      chips={
        <>
          <Chip color={C.grid} label={<b className="text-fg num">{pkr(total)}</b>} />
          <Chip color={C.ink} label={`avg ${pkr(avg)}/day`} dashed />
        </>
      }
    >
      <ReactECharts option={option} style={{ height: 160 }} notMerge />
    </Card>
  )
}

function CostPerKg({ rsPerKg }: { rsPerKg: number }) {
  const option = {
    animation: false,
    grid: { left: 36, right: 12, top: 26, bottom: 22 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: { dataIndex: number }[]) => {
        const c = PRODUCTION_TODAY[p[0].dataIndex]
        return `<b>${c.count}</b> · ${c.frames}<br/>Rs ${fmt(c.rsPerKg)} per kg · ${fmt(c.ukg, 2)} units per kg<br/>${fmt(c.kg)} kg yesterday`
      },
    },
    xAxis: { type: 'category', data: PRODUCTION_TODAY.map((c) => c.count), axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { ...axisLabel, fontSize: 12, color: C.muted } },
    yAxis: gridY((v) => `${v}`, { min: 0, max: 180, interval: 60 }),
    series: [
      {
        type: 'bar',
        barWidth: 38,
        data: PRODUCTION_TODAY.map((c, i) => ({ value: Math.round(c.rsPerKg), itemStyle: { color: ['#8FD3AE', '#4FA67D', '#237A57'][i], borderRadius: [6, 6, 0, 0] } })),
        label: { show: true, position: 'top', formatter: (x: { value: number }) => `Rs ${x.value}`, fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.ink },
      },
    ],
  }
  return (
    <Card
      title="Cost per kg of yarn"
      info="Electricity cost for each kg of yarn, by count, from yesterday's production entry. Finer counts need more spinning per kg, so they cost more. "
      period="Yesterday"
      chips={
        <>
          <Chip color="#237A57" label={<b className="text-fg num">Rs {fmt(rsPerKg)}/kg · 30 days</b>} />
          <span className="inline-flex items-center gap-1 text-muted">
            <ClipboardEdit size={12} className="text-brand" /> supervisor entry
          </span>
        </>
      }
    >
      <ReactECharts option={option} style={{ height: 160 }} notMerge />
    </Card>
  )
}

function SolarSaved({ days, total, share }: { days: Days; total: number; share: number }) {
  const option = {
    animation: false,
    grid: { left: 36, right: 12, top: 20, bottom: 22 },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${pkr(v)} saved` },
    xAxis: dayX(days, 9),
    yAxis: gridY(lakh, { min: 0, max: 900_000, interval: 300_000, name: 'Rs lakh', nameTextStyle: { ...axisLabel, padding: [0, 0, -4, 14] } }),
    series: [{ type: 'bar', barWidth: '60%', itemStyle: { color: C.solar, borderRadius: [3, 3, 0, 0] }, data: days.map((d) => Math.round(d.solarKwh * TARIFF.gridRs)) }],
  }
  return (
    <Card
      title="Saved by solar"
      info="What the grid would have charged for the units Din's own 5.1 MWp solar plant produced each day."
      period="30 days"
      chips={
        <>
          <Chip color={C.solar} label={<b className="text-fg num">{pkr(total)}</b>} />
          <span className="text-muted">{fmt(share * 100)}% of all units</span>
        </>
      }
    >
      <ReactECharts option={option} style={{ height: 160 }} notMerge />
    </Card>
  )
}

/* ------------------------------ row 2 ------------------------------ */

function WhereMoneyGoes() {
  const total = AREA_DAY_KWH.reduce((s, a) => s + a.kwh, 0)
  const rows = [...AREA_DAY_KWH].reverse()
  const top4 = (AREA_DAY_KWH.slice(0, 4).reduce((s, a) => s + a.kwh, 0) / total) * 100
  const option = {
    animation: false,
    grid: { left: 150, right: 92, top: 4, bottom: 4 },
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: (p: { dataIndex: number }) => {
        const a = rows[p.dataIndex]
        return `<b>${a.label}</b><br/>${pkr(a.kwh * 30 * BLENDED_RS)} a month · ${fmt((a.kwh / total) * 100)}%`
      },
    },
    xAxis: { type: 'value', show: false, max: AREA_DAY_KWH[0].kwh * 1.02 },
    yAxis: { type: 'category', data: rows.map((a) => a.label), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisLabel, color: C.ink, fontSize: 12, width: 142, overflow: 'truncate' } },
    series: [
      {
        type: 'bar',
        barWidth: 12,
        data: rows.map((a) => {
          const top = AREA_DAY_KWH.indexOf(a) < 4
          return { value: Math.round(a.kwh), itemStyle: { color: top ? '#237A57' : '#BFE3CE', borderRadius: [0, 4, 4, 0] } }
        }),
        label: {
          show: true,
          position: 'right',
          fontFamily: FONT,
          fontSize: 11,
          color: C.muted,
          formatter: (p: { value: number }) => `${pkr(p.value * 30 * BLENDED_RS).replace('Rs ', '')} · ${fmt((p.value / total) * 100)}%`,
        },
      },
    ],
  }
  return (
    <Card
      title="Where the money goes"
      info="Monthly electricity cost by area of the mill. Dark bars: the four biggest areas, where savings matter most."
      period="This month"
      chips={
        <>
          <Chip color="#237A57" label={`Top 4 areas: ${fmt(top4)}% of the bill`} />
        </>
      }
    >
      <ReactECharts option={option} style={{ height: 300 }} notMerge />
    </Card>
  )
}

function UsedVsExpected({ days }: { days: Days }) {
  const week = days.slice(-7)
  const idx = (week.reduce((s, d) => s + d.kwh, 0) / week.reduce((s, d) => s + d.expected, 0) - 1) * 100
  const option = {
    animation: false,
    grid: { left: 52, right: 16, top: 26, bottom: 26 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      formatter: (p: { dataIndex: number }[]) => {
        const d = days[p[0].dataIndex]
        const dv = (d.index - 1) * 100
        return `<b>${dayLabel(d.t)}</b> · ${fmt(d.kg)} kg yarn<br/>Used <b>${fmt(d.kwh)}</b> units<br/>Expected ${fmt(d.expected)} units<br/>${dv >= 0 ? '+' : ''}${fmt(dv, 1)}%`
      },
    },
    xAxis: { ...dayX(days, 6), boundaryGap: false },
    yAxis: gridY((v) => `${v / 1000}k`, { min: 92000, max: 102000, interval: 2000, name: 'Units / day', nameTextStyle: { ...axisLabel, padding: [0, 0, -4, 30] } }),
    series: [
      { name: 'Expected', type: 'line', symbol: 'none', smooth: 0.3, lineStyle: { width: 2, color: C.grid, type: 'dashed' }, data: days.map((d) => Math.round(d.expected)) },
      {
        name: 'Used',
        type: 'line',
        symbol: 'none',
        smooth: 0.3,
        lineStyle: { width: 2.5, color: C.alarm },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(184,58,44,0.16)' }, { offset: 1, color: 'rgba(184,58,44,0.01)' }] } },
        data: days.map((d) => Math.round(d.kwh)),
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(224,161,0,0.10)' },
          label: { show: true, position: 'insideTop', formatter: 'Ring 34 drift + card restarts', color: C.warn, fontFamily: FONT, fontSize: 11 },
          data: [[{ xAxis: dayLabel(days[20].t) }, { xAxis: dayLabel(days[29].t) }]],
        },
      },
    ],
  }
  return (
    <Card
      title="Used vs expected"
      info={`Units used each day compared with what the mill should use for the yarn it actually made. If production rises 10% and units rise 10%, nothing got worse. Expected = ${fmt(BASELINE.fixed)} fixed units + ${fmt(BASELINE.perKg, 2)} units per kg, learned from ${BASELINE.period}.`}
      period="30 days"
      chips={
        <>
          <Chip color={C.alarm} label="Used" />
          <Chip color={C.grid} label="Expected for the yarn made" dashed />
          <span className={clsx('font-semibold num', idx > 0.5 ? 'text-warn' : 'text-brand')}>
            This week {idx >= 0 ? '+' : ''}
            {fmt(idx, 1)}%
          </span>
        </>
      }
    >
      <ReactECharts option={option} style={{ height: 300 }} notMerge />
    </Card>
  )
}

/* ------------------------------ row 3 ------------------------------ */

function WhileStopped() {
  const areas = AREA_DAY_KWH.filter((a) => a.cleaningKwh > 50)
  const rs = (kwh: number) => kwh * 30 * TARIFF.gridRs
  const named = areas.filter((a) => CLEANING_VERDICT[a.id]).map((a) => ({ label: a.label, v: rs(a.cleaningKwh), verdict: CLEANING_VERDICT[a.id].verdict as keyof typeof VERDICT_HEX, why: CLEANING_VERDICT[a.id].why }))
  const standby = { label: 'Machine standby', v: areas.filter((a) => !CLEANING_VERDICT[a.id]).reduce((s, a) => s + rs(a.cleaningKwh), 0), verdict: 'standby' as const, why: 'Small loads on stopped machines.' }
  const rows = [...named, standby].sort((a, b) => a.v - b.v)
  const total = rows.reduce((s, r) => s + r.v, 0)
  const avoid = rows.filter((r) => r.verdict === 'avoidable' || r.verdict === 'partly').reduce((s, r) => s + r.v, 0)
  const option = {
    animation: false,
    grid: { left: 140, right: 60, top: 4, bottom: 4 },
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: { dataIndex: number }) => `<b>${rows[p.dataIndex].label}</b><br/>${pkr(rows[p.dataIndex].v)} a month<br/>${rows[p.dataIndex].why}` },
    xAxis: { type: 'value', show: false, max: Math.max(...rows.map((r) => r.v)) * 1.05 },
    yAxis: { type: 'category', data: rows.map((r) => r.label), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisLabel, color: C.ink, fontSize: 12, width: 132, overflow: 'truncate' } },
    series: [
      {
        type: 'bar',
        barWidth: 14,
        data: rows.map((r) => ({ value: Math.round(r.v), itemStyle: { color: VERDICT_HEX[r.verdict], borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.ink, formatter: (p: { value: number }) => pkr(p.value).replace('Rs ', '') },
      },
    ],
  }
  return (
    <Card
      title="Used while stopped"
      info="Cost of the power used during the 3-hour night cleaning (01:00–04:00), when production is stopped. Humidity has to be held, so some of it is needed."
      period="Per month"
      chips={
        <>
          <span className="text-muted">
            <b className="text-fg num">{pkr(total)}</b> total · <b className="text-alarm num">{pkr(avoid)}</b> avoidable
          </span>
        </>
      }
    >
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] mt-2">
        <Chip color={VERDICT_HEX.avoidable} label="Avoidable" />
        <Chip color={VERDICT_HEX.partly} label="Partly avoidable" />
        <Chip color={VERDICT_HEX.needed} label="Needed" />
        <Chip color={VERDICT_HEX.standby} label="Standby" />
      </div>
    </Card>
  )
}

function Ledger() {
  const beat = (VERIFIED_RS / ESTIMATED_RS - 1) * 100
  const option = {
    animation: false,
    grid: { left: 44, right: 12, top: 30, bottom: 24 },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${pkr(v)} / month` },
    xAxis: { type: 'category', data: LEDGER.map((r) => SHORT[r.id] ?? r.action), axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { ...axisLabel, fontSize: 12, color: C.ink } },
    yAxis: gridY((v) => (v ? `${fmt(v / 1e5, 1)}` : '0'), { name: 'Rs lakh / month', nameTextStyle: { ...axisLabel, padding: [0, 0, -4, 40] } }),
    series: [
      { name: 'Estimated before', type: 'bar', barWidth: 22, barGap: '25%', itemStyle: { color: '#C9D2CC', borderRadius: [4, 4, 0, 0] }, data: LEDGER.map((r) => r.estRs) },
      { name: 'Measured after', type: 'bar', barWidth: 22, itemStyle: { color: '#8FD3AE', borderRadius: [4, 4, 0, 0] }, data: LEDGER.map((r) => r.verifiedRs) },
      {
        name: 'Saving now',
        type: 'bar',
        barWidth: 22,
        data: LEDGER.map((r) => ({ value: r.nowRs, itemStyle: { color: r.status === 'slipping' ? '#E0A100' : '#237A57', borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: 'top', fontFamily: FONT, fontSize: 12, fontWeight: 700, color: C.ink, formatter: (p: { value: number }) => pkr(p.value).replace('Rs ', '') },
      },
    ],
  }
  return (
    <Card
      title="Savings ledger"
      info={`Every fix: the saving estimated before the work, the saving measured after it, and what it is saving now. Estimates are kept low on purpose; so far measured savings came in ${fmt(beat)}% higher.`}
      period="Per month"
      chips={
        <>
          <Chip color="#C9D2CC" label="Estimated" />
          <Chip color="#8FD3AE" label="Measured" />
          <Chip color="#237A57" label="Saving now" />
          <Chip color="#E0A100" label="Slipping" />
          <span className="text-muted">
            <b className="text-fg num">{pkr(SAVING_NOW_RS)}/mo</b> now · {pkr(SAVED_TO_DATE_RS)} saved so far
          </span>
        </>
      }
    >
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
      <div className="divide-y divide-line mt-1">
        {LEDGER.map((r) => (
          <div key={r.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1.6fr_1fr_auto] gap-x-4 gap-y-0.5 py-2 text-[12px] items-center">
            <span className="font-semibold text-[13px] truncate">{r.action}</span>
            <span className="text-muted hidden md:block truncate">
              since {r.done.toLowerCase()} · cost {r.costRs ? pkr(r.costRs) : 'nothing'}
            </span>
            {r.status === 'holding' ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-brand justify-self-end">
                <span className="w-2 h-2 rounded-full bg-brand" /> Holding
              </span>
            ) : (
              <Link to={`/advisor#${r.insightId}`} className="inline-flex items-center gap-1.5 font-semibold text-warn justify-self-end hover:underline">
                <span className="w-2 h-2 rounded-full bg-solar" /> Slipping: see why
              </Link>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
