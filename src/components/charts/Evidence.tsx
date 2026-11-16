// One small proof chart per finding. Data is deterministic so the demo
// always shows the same story.
// Colours come from a palette: the fixed light deck colours by default, or,
// with `themed`, the current theme's colours read from the page (CSS variables).
import { Suspense, lazy, useLayoutEffect, useRef, useState } from 'react'
import { machineById } from '../../data/din'
import { fmt, hhmm } from '../../lib/format'
import { DAY_CURVE, machineAt, pkMidnight } from '../../sim/engine'
import { MDI } from '../../sim/insights'
import { bySection, dur, monthStops, reasonById } from '../../sim/downtime'
import { BUS_PQ, ORDERS, currentLimit } from '../../sim/pq'
import { C, FONT } from './theme'

// ECharts is large: load it only when a proof chart is actually shown
const ReactECharts = lazy(() => import('echarts-for-react'))

const DAY = 86_400_000
const dayLabel = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short' }).format(t)
const days = (n: number) => {
  const mid = pkMidnight(Date.now())
  return Array.from({ length: n }, (_, i) => mid - (n - 1 - i) * DAY)
}
const rnd = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

interface Palette {
  grid: string
  brand: string
  brandDark: string
  ink: string
  muted: string
  faint: string
  line: string
  warn: string
  alarm: string
  mint: string
  amber: string
  idle: string
  /** Tooltip background and the border around highlighted points */
  panel: string
  warnTint: string
  gridTint: string
  animate: boolean
}

/** The original light deck colours (used by pages not yet on the theme system) */
const LIGHT: Palette = {
  ...C,
  amber: '#E0A100',
  idle: '#A3ADA7',
  panel: '#fff',
  warnTint: 'rgba(169,104,19,0.10)',
  gridTint: 'rgba(61,127,196,0.12)',
  animate: false,
}

/** The current theme's colours, read from the CSS variables around `el` */
function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el)
  const parts = (n: string) => cs.getPropertyValue(`--${n}`).trim().split(/\s+/).join(',')
  const rgb = (n: string) => `rgb(${parts(n)})`
  const rgba = (n: string, a: number) => `rgba(${parts(n)},${a})`
  return {
    grid: C.grid,
    brand: rgb('brand'),
    brandDark: rgb('fg'),
    ink: rgb('fg'),
    muted: rgb('muted'),
    faint: rgb('faint'),
    line: rgb('line'),
    warn: rgb('warn'),
    alarm: rgb('alarm'),
    mint: rgba('brand', 0.15),
    amber: rgb('warn'),
    idle: rgb('faint'),
    panel: rgb('sunken'),
    warnTint: rgba('warn', 0.12),
    gridTint: 'rgba(61,127,196,0.18)',
    animate: true,
  }
}

function option(id: string, P: Palette) {
  const axisLabel = { color: P.faint, fontFamily: FONT, fontSize: 11 }
  const tooltipBase = {
    backgroundColor: P.panel,
    borderColor: P.line,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: P.ink, fontFamily: FONT, fontSize: 12 },
    extraCssText: 'box-shadow: 0 8px 30px rgb(0 0 0 / 0.18); border-radius: 10px;',
  }
  const base = {
    animation: P.animate,
    animationDuration: 900,
    grid: { left: 44, right: 16, top: 26, bottom: 26 },
    textStyle: { fontFamily: FONT },
  }
  const catAxis = (data: string[], every = 0) => ({
    type: 'category',
    data,
    axisTick: { show: false },
    axisLine: { lineStyle: { color: P.line } },
    axisLabel: { ...axisLabel, interval: every },
  })
  const valAxis = (fmtv?: (v: number) => string, extra = {}) => ({
    type: 'value',
    axisLabel: { ...axisLabel, formatter: fmtv },
    splitLine: { lineStyle: { color: P.line } },
    ...extra,
  })
  const dashed = (y: number, label: string, color = P.muted) => ({
    silent: true,
    symbol: 'none',
    lineStyle: { color, type: 'dashed', width: 1 },
    label: { formatter: label, position: 'insideEndTop', color, fontFamily: FONT, fontSize: 11 },
    data: [{ yAxis: y }],
  })

  switch (id) {
    case 'card-trips': {
      const d = days(30)
      // 14 dips in 30 days, today included
      const hits = new Set([1, 3, 6, 8, 11, 12, 15, 17, 19, 22, 24, 26, 28, 29])
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: { name: string; value: number }[]) => `${p[0].name}: <b>${p[0].value ? '1 dip · 3 cards stopped' : 'no dips'}</b>` },
        xAxis: catAxis(d.map(dayLabel), 6),
        yAxis: valAxis(undefined, { max: 1, interval: 1, show: false }),
        series: [
          {
            type: 'bar',
            barWidth: '55%',
            itemStyle: { color: P.alarm, borderRadius: [4, 4, 0, 0] },
            data: d.map((_, i) => (hits.has(i) ? 1 : 0)),
          },
        ],
      }
    }
    case 'ring-34': {
      const d = days(14)
      const sis = d.map((_, i) => 2.1 + 0.02 * (rnd(i) - 0.5))
      const r34 = d.map((_, i) => (i < 4 ? sis[i] + 0.01 : 2.1 * (1 + 0.105 * Math.min(1, (i - 3) / 6)) + 0.015 * (rnd(i + 40) - 0.5)))
      return {
        ...base,
        grid: { ...base.grid, right: 96 },
        tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: number) => `${fmt(v, 2)} kWh/kg` },
        xAxis: catAxis(d.map(dayLabel), 3),
        yAxis: valAxis((v) => fmt(v, 1), { min: 1.9, max: 2.4 }),
        series: [
          { name: 'Frames 32–39 average', type: 'line', symbol: 'none', lineStyle: { width: 2, color: P.faint }, itemStyle: { color: P.faint }, data: sis.map((v) => +v.toFixed(3)), endLabel: { show: true, formatter: 'Sister frames', color: P.muted, fontFamily: FONT, fontSize: 11 } },
          { name: 'Ring Frame 34', type: 'line', symbol: 'none', lineStyle: { width: 2.5, color: P.warn }, itemStyle: { color: P.warn }, data: r34.map((v) => +v.toFixed(3)), endLabel: { show: true, formatter: 'Frame 34', color: P.ink, fontWeight: 700, fontFamily: FONT, fontSize: 11 } },
        ],
      }
    }
    case 'compressor-night': {
      const m = machineById['CP-02']
      const mid = pkMidnight(Date.now())
      const hrs = Array.from({ length: 48 }, (_, i) => i * 0.5)
      const kw = hrs.map((h) => Math.round(machineAt(m, h + 0.25, mid + h * 3600_000).kw))
      const should = hrs.map((h) => (h >= 1 && h < 4 ? Math.round(m.ratedKw * m.typicalLoad * 0.15) : null))
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: number) => (v == null ? '—' : `${fmt(v)} kW`) },
        xAxis: catAxis(hrs.map(hhmm), 7),
        yAxis: valAxis((v) => `${v} kW`, { max: 160, interval: 40 }),
        series: [
          {
            name: 'Actual',
            type: 'line',
            step: 'middle',
            symbol: 'none',
            lineStyle: { width: 2, color: P.brand },
            areaStyle: { color: P.mint },
            data: kw,
            markArea: {
              silent: true,
              itemStyle: { color: P.warnTint },
              label: { show: true, position: 'insideTop', formatter: 'Cleaning: autocones stopped', color: P.warn, fontFamily: FONT, fontSize: 11 },
              data: [[{ xAxis: '01:00' }, { xAxis: '04:00' }]],
            },
          },
          { name: 'Should be', type: 'line', symbol: 'none', connectNulls: false, lineStyle: { width: 2, type: 'dashed', color: P.warn }, data: should },
        ],
      }
    }
    case 'restart-peak': {
      const pts = DAY_CURVE.filter((s) => s.hour >= 3 && s.hour < 8)
      const peak = Math.max(...pts.map((s) => s.grid))
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: number) => `${fmt(v)} kW` },
        xAxis: catAxis(pts.map((s) => hhmm(s.hour)), 3),
        yAxis: valAxis((v) => (v ? `${fmt(v / 1000, 1)} MW` : '0'), { min: 0, max: 5500 }),
        series: [
          {
            name: 'Grid demand',
            type: 'line',
            symbol: 'none',
            lineStyle: { width: 2, color: P.grid },
            areaStyle: { color: P.gridTint },
            data: pts.map((s) => Math.round(s.grid)),
            markPoint: {
              symbol: 'circle',
              symbolSize: 10,
              itemStyle: { color: P.alarm, borderColor: P.panel, borderWidth: 2 },
              label: { show: true, position: 'right', formatter: `Restart peak ${fmt(peak)} kW`, color: P.ink, fontWeight: 700, fontFamily: FONT, fontSize: 11 },
              data: [{ coord: [pts.findIndex((s) => s.grid === peak), Math.round(peak)] }],
            },
            markLine: dashed(Math.round(MDI.otherPeak), `Normal maximum ${fmt(MDI.otherPeak)} kW`),
          },
        ],
      }
    }
    case 'condenser': {
      const d = days(21)
      const v = d.map((_, i) => +(3 + (6 * i) / 20 + 0.5 * (rnd(i + 7) - 0.5)).toFixed(1))
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (x: number) => `${fmt(x, 1)}% uneven` },
        xAxis: catAxis(d.map(dayLabel), 4),
        yAxis: valAxis((x) => `${x}%`, { min: 0, max: 12 }),
        series: [
          {
            name: 'Imbalance',
            type: 'line',
            symbol: 'none',
            lineStyle: { width: 2.5, color: P.warn },
            data: v,
            markLine: dashed(5, 'Check above 5%', P.alarm),
          },
        ],
      }
    }
    case 'lt2-harmonics': {
      const s = BUS_PQ.LT2.current
      const ord = (h: number) => `${h}${h === 2 ? 'nd' : h === 3 ? 'rd' : 'th'}`
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${fmt(v, 1)}%` },
        xAxis: catAxis(ORDERS.map(ord)),
        yAxis: valAxis((v) => `${v}%`),
        series: [
          {
            name: 'Measured',
            type: 'bar',
            barWidth: '55%',
            data: ORDERS.map((h) => ({ value: s[h] ?? 0, itemStyle: { color: (s[h] ?? 0) > currentLimit(h) ? P.alarm : P.brand, borderRadius: [3, 3, 0, 0] } })),
          },
          { name: 'IEEE 519 limit', type: 'line', step: 'middle', symbol: 'none', lineStyle: { color: P.ink, width: 1.5, type: 'dashed' }, data: ORDERS.map(currentLimit) },
        ],
      }
    }
    case 'ac-persistence': {
      const weeks = Array.from({ length: 14 }, (_, i) => 'W' + (i + 1))
      const v = weeks.map((_, i) => +((i < 4 ? 136 : i < 12 ? 116 : 119.6) + 2.4 * (rnd(i + 5) - 0.5)).toFixed(1))
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (x: number) => fmt(x) + ' kW average, 22:00–06:00' },
        xAxis: catAxis(weeks),
        yAxis: valAxis((x) => String(x), { min: 100, max: 145, name: 'kW', nameTextStyle: { ...axisLabel } }),
        series: [
          {
            type: 'bar',
            barWidth: '60%',
            data: v.map((x, i) => ({ value: x, itemStyle: { color: i < 4 ? P.faint : i < 12 ? P.brand : P.amber, borderRadius: [3, 3, 0, 0] } })),
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: P.brandDark, type: 'dashed' },
              label: { position: 'end', color: P.brandDark, fontWeight: 700, fontFamily: FONT, fontSize: 11 },
              data: [
                { xAxis: 'W5', label: { formatter: 'Fix (Aug)' } },
                { xAxis: 'W13', label: { formatter: 'Slipping' } },
              ],
            },
          },
        ],
      }
    }
    case 'lights-verified': {
      const d = days(42)
      const v = d.map((_, i) => Math.round((i < 21 ? 128 : 98) + 6 * (rnd(i + 99) - 0.5)))
      return {
        ...base,
        tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (x: number) => `${fmt(x)} kW (09:00–16:00 average)` },
        xAxis: catAxis(d.map(dayLabel), 6),
        yAxis: valAxis((x) => `${x}`, { min: 0, max: 150, name: 'kW', nameTextStyle: { ...axisLabel } }),
        series: [
          {
            name: 'Daytime lighting',
            type: 'bar',
            barWidth: '60%',
            data: v.map((x, i) => ({ value: x, itemStyle: { color: i < 21 ? P.faint : P.brand, borderRadius: [3, 3, 0, 0] } })),
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: P.brandDark, type: 'dashed' },
              label: { formatter: 'Timer fitted', position: 'end', color: P.brandDark, fontWeight: 700, fontFamily: FONT, fontSize: 11 },
              data: [{ xAxis: dayLabel(d[21]) }],
            },
          },
        ],
      }
    }
    case 'bearing-overrun': {
      const jobs = monthStops(Date.now())
        .filter((s) => s.reason?.id === 'bearing' && !s.ongoing)
        .sort((a, b) => b.minutes - a.minutes)
      const std = reasonById.bearing.expectedMin / 60
      return {
        ...base,
        grid: { ...base.grid, right: 70 },
        tooltip: {
          ...tooltipBase,
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (p: { dataIndex: number }[]) => {
            const s = jobs[p[0].dataIndex]
            return `<b>${s.machine.name}</b><br/>${dur(s.minutes)} (normally ${dur(reasonById.bearing.expectedMin)})`
          },
        },
        xAxis: { ...catAxis(jobs.map(() => ''), 0), name: `${jobs.length} bearing changes, longest first`, nameLocation: 'middle', nameGap: 8, nameTextStyle: { ...axisLabel } },
        yAxis: valAxis((v) => `${v} h`, { min: 0 }),
        series: [
          {
            type: 'bar',
            barWidth: '70%',
            data: jobs.map((s) => ({ value: +(s.minutes / 60).toFixed(2), itemStyle: { color: s.minutes > reasonById.bearing.expectedMin * 1.1 ? P.alarm : P.brand, borderRadius: [3, 3, 0, 0] } })),
            markLine: { ...dashed(std, `Normal\n${dur(reasonById.bearing.expectedMin)}`, P.ink), label: { formatter: `Normal\n${dur(reasonById.bearing.expectedMin)}`, position: 'end', color: P.ink, fontFamily: FONT, fontSize: 11, fontWeight: 700, lineHeight: 14 } },
          },
        ],
      }
    }
    case 'no-reason': {
      const rows = bySection(monthStops(Date.now()).filter((s) => !s.reason)).filter((r) => r.stops > 0)
      return {
        ...base,
        grid: { left: 110, right: 40, top: 10, bottom: 10 },
        tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v} stops` },
        xAxis: { type: 'value', show: false },
        yAxis: { type: 'category', inverse: true, data: rows.map((r) => r.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisLabel, color: P.ink } },
        series: [
          {
            type: 'bar',
            barWidth: 14,
            itemStyle: { color: P.idle, borderRadius: [0, 4, 4, 0] },
            label: { show: true, position: 'right', fontFamily: FONT, fontSize: 12, fontWeight: 700, color: P.ink },
            data: rows.map((r) => r.stops),
          },
        ],
      }
    }
  }
  return null
}

/**
 * `themed`: use the current theme's colours instead of the fixed light ones.
 * Left out, the chart decides by itself: themed when it sits on a redesigned
 * (theme-dark) page, light everywhere else.
 */
export function Evidence({ id, height = 190, themed }: { id: string; height?: number; themed?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [palette, setPalette] = useState<Palette>(LIGHT)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !(themed ?? !!el.closest('.theme-dark'))) return
    setPalette(readPalette(el))
    // Recolour when the presenter switches theme
    const onTheme = () => setPalette(readPalette(el))
    window.addEventListener('themechange', onTheme)
    return () => window.removeEventListener('themechange', onTheme)
  }, [themed])

  const o = option(id, palette)
  if (!o) return null
  return (
    <div ref={ref}>
      <Suspense fallback={<div className="skeleton rounded-lg" style={{ height }} />}>
        <ReactECharts key={palette.panel} option={o} style={{ height }} notMerge />
      </Suspense>
    </div>
  )
}
