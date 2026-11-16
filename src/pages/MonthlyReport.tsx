// Monthly report: a document, not a dashboard. Calendar, timeline and savings
// path are visuals used only here. Below it, the audit-ready pack: the ISO 50001
// records Enervtek produces from live data, each one viewable and downloadable.
import clsx from 'clsx'
import ReactECharts from 'echarts-for-react'
import { AlertTriangle, BadgeCheck, CircleDashed, CircleDollarSign, Download, FileCheck2, Printer } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SITE } from '../data/din'
import { C, FONT, axisLabel, tooltipBase } from '../components/charts/theme'
import { PageHeader } from '../components/ui/primitives'
import { fmt, pkr } from '../lib/format'
import { CO2_PER_KG_YARN, LEDGER, SAVED_TO_DATE_RS, SAVING_NOW_RS } from '../sim/costs'
import { TARIFF } from '../sim/engine'
import { INSIGHTS, OPEN_RS_MONTH, type Kind } from '../sim/insights'
import {
  DATA_PLAN,
  DEVIATION_LOG,
  ENERGY_REVIEW,
  READINESS,
  READY_COUNT,
  RULES,
  SAVINGS_PATH,
  daysAgo,
  downloadCsv,
  enpi,
  objectives,
  ruleForInsight,
  type Ready,
} from '../sim/iso'
import { TRACK } from '../sim/tracking'

const dShort = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short' }).format(t)
const dYear = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', year: 'numeric' }).format(t)
const KIND_UI: Record<Kind, { hex: string; icon: typeof AlertTriangle }> = {
  downtime: { hex: '#B83A2C', icon: AlertTriangle },
  waste: { hex: '#E0A100', icon: CircleDollarSign },
  problem: { hex: '#B83A2C', icon: AlertTriangle },
  verified: { hex: '#237A57', icon: BadgeCheck },
}

export function MonthlyReport() {
  const e = useMemo(() => enpi(), [])
  const m = e.days.reduce((a, d) => ({ cost: a.cost + d.cost, kwh: a.kwh + d.kwh, kg: a.kg + d.kg, solar: a.solar + d.solarKwh }), { cost: 0, kwh: 0, kg: 0, solar: 0 })
  const idx = (e.index - 1) * 100
  const period = `${dShort(e.days[0].t)} – ${dShort(e.days[e.days.length - 1].t)} ${dYear(e.days[e.days.length - 1].t)}`

  return (
    <>
      <PageHeader
        layer={{ n: 3, name: 'AI advisor' }}
        title="Monthly report"
        subtitle="One document for the owner, and underneath it the records an auditor, bank or buyer asks for."
        actions={
          <button onClick={() => window.print()} className="btn-primary">
            <Printer size={15} /> Print / save as PDF
          </button>
        }
      />

      {/* ------------------------------ the report ------------------------------ */}
      <article className="bg-panel rounded-2xl shadow-card border border-line max-w-[1180px] px-6 md:px-12 py-10">
        <header className="grid lg:grid-cols-[1fr_auto] gap-8 items-end pb-8 border-b-2 border-fg">
          <div>
            <div className="text-[13px] text-muted">Monthly energy report · last 30 days · {SITE.company} · {SITE.unit}</div>
            <h2 className="font-display font-bold text-[46px] leading-none tracking-tight mt-3">{period}</h2>
            <p className="text-[17px] mt-4 max-w-[60ch] leading-relaxed">
              Efficiency held for three weeks, then slipped in the last ten days. <b>{pkr(OPEN_RS_MONTH)} a month</b> of waste is ready to remove, and fixes already made are saving{' '}
              <b className="text-brand">{pkr(SAVING_NOW_RS)} a month</b>.
            </p>
          </div>
          <div className="text-right text-[12px] text-muted leading-relaxed">
            Prepared by Enervtek
            <br />
            Reviewed by your Enervtek energy engineer
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-5 divide-x divide-line border-b border-line">
          <Figure label="Electricity cost" value={pkr(m.cost)} />
          <Figure label="Per kg of yarn" value={`Rs ${fmt(m.cost / m.kg)}`} />
          <Figure label="Against baseline" value={`${idx >= 0 ? '+' : ''}${fmt(idx, 1)}%`} tone={idx > 0.5 ? 'warn' : 'ok'} note={Math.abs(idx) < 0.5 ? 'on target' : idx > 0 ? 'more than expected' : 'better than expected'} />
          <Figure label="Solar share" value={`${fmt((m.solar / m.kwh) * 100)}%`} note={`${pkr(m.solar * TARIFF.gridRs)} saved`} />
          <Figure label="Carbon" value={`${fmt(CO2_PER_KG_YARN, 2)} kg`} note="CO₂ per kg of yarn" />
        </div>

        <ReportSection n="1" title="Every day of the month" note="Each day coloured by energy used against what the yarn made should need.">
          <Calendar days={e.days} />
        </ReportSection>

        <ReportSection n="2" title="What happened" note="Findings on the day Enervtek detected them.">
          <Timeline />
        </ReportSection>

        <ReportSection n="3" title="Savings so far, and next" note="Measured savings per month since the first fix, and the path if the open fixes are done.">
          <SavingsPath />
        </ReportSection>

        <ReportSection n="4" title="Decisions for next month" note="For the owner to approve. Each one has an owner, a date and a measured result.">
          <Decisions />
        </ReportSection>
      </article>

      {/* ------------------------------ audit-ready pack ------------------------------ */}
      <AuditPack />
    </>
  )
}

/* ------------------------------ report pieces ------------------------------ */

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="px-5 first:pl-0 py-6">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={clsx('font-display font-bold text-[26px] num leading-tight mt-1', tone === 'warn' && 'text-warn', tone === 'ok' && 'text-brand')}>{value}</div>
      {note && <div className="text-[12px] text-muted mt-0.5">{note}</div>}
    </div>
  )
}

function ReportSection({ n, title, note, children }: { n: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className="pt-10 grid lg:grid-cols-[220px_1fr] gap-x-10 gap-y-4">
      <div>
        <div className="font-display font-bold text-[40px] leading-none text-line-strong">{n}</div>
        <h3 className="font-display font-semibold text-[19px] leading-tight mt-2">{title}</h3>
        <p className="text-[13px] text-muted mt-1.5 leading-relaxed">{note}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

/** Diverging colour: green = less than expected, grey = on target, amber/red = more */
function dayColor(pct: number) {
  if (pct <= -0.6) return '#4FA67D'
  if (pct <= -0.2) return '#A7D9BD'
  if (pct < 0.2) return '#E7ECE8'
  if (pct < 0.6) return '#F6DB97'
  if (pct < 1) return '#EDB04A'
  return '#C9563F'
}

function Calendar({ days }: { days: ReturnType<typeof enpi>['days'] }) {
  const fmtDay = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short' }).format(t)
  const weekday = (t: number) => (new Date(t + 5 * 3600e3).getUTCDay() + 6) % 7 // Monday = 0
  const lead = weekday(days[0].t)
  const pct = days.map((d) => (d.index - 1) * 100)
  const worse = pct.filter((p) => p >= 0.6).length
  const best = days[pct.indexOf(Math.min(...pct))]
  const worst = days[pct.indexOf(Math.max(...pct))]
  return (
    <div className="grid md:grid-cols-[auto_1fr] gap-8 items-start">
      <div>
        <div className="grid grid-cols-7 gap-1.5 text-[11px] text-muted text-center mb-1.5">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span key={d} className="w-11">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`b${i}`} className="w-11 h-11" />
          ))}
          {days.map((d, i) => (
            <span
              key={d.t}
              title={`${fmtDay(d.t)}: ${pct[i] >= 0 ? '+' : ''}${fmt(pct[i], 1)}% against expected · ${fmt(d.kg)} kg yarn`}
              className="w-11 h-11 rounded-lg grid place-items-center text-[12px] font-semibold num"
              style={{ background: dayColor(pct[i]), color: pct[i] >= 1 ? '#fff' : C.ink }}
            >
              {new Date(d.t + 5 * 3600e3).getUTCDate()}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-3 text-[11px] text-muted">
          <span className="mr-1">Less energy</span>
          {[-1, -0.4, 0, 0.4, 0.8, 1.2].map((v) => (
            <span key={v} className="w-6 h-3 rounded-sm" style={{ background: dayColor(v) }} />
          ))}
          <span className="ml-1">More energy</span>
        </div>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-1 gap-x-6 gap-y-4 text-[13px]">
        <div>
          <dt className="text-muted">Days above expected</dt>
          <dd className="font-display font-bold text-[24px] num text-warn">{worse}</dd>
          <dd className="text-[12px] text-muted">all in the last ten days, as Ring Frame 34 drifted and cards restarted after dips</dd>
        </div>
        <div>
          <dt className="text-muted">Best day</dt>
          <dd className="font-semibold">
            {fmtDay(best.t)} · {fmt((best.index - 1) * 100, 1)}%
          </dd>
        </div>
        <div>
          <dt className="text-muted">Worst day</dt>
          <dd className="font-semibold">
            {fmtDay(worst.t)} · +{fmt((worst.index - 1) * 100, 1)}%
          </dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * Winding (S-shaped) timeline: oldest finding first, three per row, rows
 * alternate direction and are joined by curves. Each circle carries its own
 * title above and its date and money below, so nothing has to be cross-read.
 */
function Timeline() {
  const navigate = useNavigate()
  const items = INSIGHTS.map((i) => ({ i, ago: daysAgo(TRACK[i.id].found) })).sort((a, b) => b.ago - a.ago)

  const PER_ROW = 3
  const W = 1000
  const LEFT = 120
  const RIGHT = W - 120
  const ROW_GAP = 200
  const TOP = 70
  const R = ROW_GAP / 2
  const rows = Math.ceil(items.length / PER_ROW)
  const H = TOP + (rows - 1) * ROW_GAP + 90
  const slotX = (k: number, reverse: boolean) => {
    const x = LEFT + ((RIGHT - LEFT) * (k + 0.5)) / PER_ROW
    return reverse ? W - x : x
  }

  // The winding path: across, curve down, back, curve down…
  let d = `M ${LEFT - 40} ${TOP}`
  for (let r = 0; r < rows; r++) {
    const y = TOP + r * ROW_GAP
    const reverse = r % 2 === 1
    const last = r === rows - 1
    const lastCount = items.length - r * PER_ROW
    const endX = last ? (reverse ? slotX(Math.min(lastCount, PER_ROW) - 1, true) - 70 : slotX(Math.min(lastCount, PER_ROW) - 1, false) + 70) : reverse ? LEFT : RIGHT
    d += ` L ${endX} ${y}`
    if (!last) d += reverse ? ` A ${R} ${R} 0 0 0 ${LEFT} ${y + ROW_GAP}` : ` A ${R} ${R} 0 0 1 ${RIGHT} ${y + ROW_GAP}`
  }
  const lastRow = rows - 1
  const lastRev = lastRow % 2 === 1
  const lastY = TOP + lastRow * ROW_GAP
  const lastCount = items.length - lastRow * PER_ROW
  const endX = lastRev ? slotX(lastCount - 1, true) - 70 : slotX(lastCount - 1, false) + 70

  const when = (ago: number) => (ago === 0 ? 'Today' : ago === 1 ? 'Yesterday' : ago > 30 ? 'Before this period' : `${ago} days ago`)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Findings in the order they were detected">
        <path d={d} fill="none" stroke="#D5DCD7" strokeWidth={4} strokeLinecap="round" />
        {/* start and end */}
        <circle cx={LEFT - 40} cy={TOP} r={6} fill="#8A948E" />
        <text x={LEFT - 40} y={TOP + 28} textAnchor="middle" fontFamily={FONT} fontSize={15} fill={C.muted}>
          Start of period
        </text>
        <path d={`M ${endX} ${lastY - 8} l ${lastRev ? -14 : 14} 8 l ${lastRev ? 14 : -14} 8`} fill="none" stroke="#8A948E" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <text x={endX + (lastRev ? -26 : 26)} y={lastY + 5} textAnchor={lastRev ? 'end' : 'start'} fontFamily={FONT} fontSize={14} fontWeight={700} fill={C.ink}>
          Today
        </text>

        {items.map(({ i, ago }, n) => {
          const r = Math.floor(n / PER_ROW)
          const k = n % PER_ROW
          const x = slotX(k, r % 2 === 1)
          const y = TOP + r * ROW_GAP
          const ui = KIND_UI[i.kind]
          return (
            <g key={i.id} className="cursor-pointer" onClick={() => navigate(`/advisor#${i.id}`)} role="link" aria-label={i.title}>
              <title>{i.title}</title>
              <text x={x} y={y - 38} textAnchor="middle" fontFamily={FONT} fontSize={19} fontWeight={700} fill={C.ink}>
                {shortTitle(i.id)}
              </text>
              <circle cx={x} cy={y} r={24} fill="#fff" />
              <circle cx={x} cy={y} r={20} fill={ui.hex} />
              <text x={x} y={y + 5.5} textAnchor="middle" fontFamily={FONT} fontSize={15} fontWeight={700} fill="#fff">
                {n + 1}
              </text>
              <text x={x} y={y + 50} textAnchor="middle" fontFamily={FONT} fontSize={16} fill={C.muted}>
                {when(ago)}
              </text>
              <text x={x} y={y + 72} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={700} fill={i.kind === 'problem' ? '#B83A2C' : i.kind === 'verified' ? '#237A57' : C.ink}>
                {i.rsMonth > 0 ? `${pkr(i.rsMonth)} a month${i.kind === 'verified' ? ' saved' : ''}` : 'Risk to production'}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted mt-2">
        {(['waste', 'problem', 'verified'] as Kind[]).map((kk) => (
          <span key={kk} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_UI[kk].hex }} />
            {kk === 'waste' ? 'Money being wasted' : kk === 'problem' ? 'Problem caught early' : 'Saving confirmed'}
          </span>
        ))}
        <span>· Click a circle to open the finding</span>
      </div>
    </div>
  )
}

function shortTitle(id: string) {
  return (
    {
      'card-trips': 'Cards tripped on dip',
      'ring-34': 'Ring Frame 34 drift',
      'compressor-night': 'Compressor at night',
      'restart-peak': 'Restart peak',
      condenser: 'Condenser motor',
      'lt2-harmonics': 'LT#2 capacitors',
      'ac-persistence': 'AC saving slipping',
      'lights-verified': 'Lighting saving',
    } as Record<string, string>
  )[id]
}

function SavingsPath() {
  const next = SAVING_NOW_RS + OPEN_RS_MONTH
  const data = SAVINGS_PATH.map((p) => ({ ...p, value: p.projected ? next : p.saved }))
  const option = {
    animation: false,
    grid: { left: 52, right: 12, top: 30, bottom: 28 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: { dataIndex: number }[]) => {
        const d = data[p[0].dataIndex]
        return `<b>${d.month}</b><br/>${pkr(d.value)} ${d.projected ? 'a month if the open fixes are done' : d.partial ? 'so far this month' : 'saved, measured'}`
      },
    },
    xAxis: { type: 'category', data: data.map((d) => d.month), axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { ...axisLabel, fontSize: 12, color: C.ink } },
    yAxis: { type: 'value', axisLabel: { ...axisLabel, formatter: (v: number) => (v ? `${fmt(v / 1e5, 0)}` : '0') }, splitLine: { lineStyle: { color: C.line, type: 'dashed' } }, name: 'Rs lakh', nameTextStyle: { ...axisLabel, padding: [0, 0, -4, 20] } },
    series: [
      {
        type: 'bar',
        barWidth: 44,
        data: data.map((d) => ({
          value: d.value,
          itemStyle: d.projected
            ? { color: 'rgba(35,122,87,0.12)', borderColor: '#237A57', borderType: 'dashed', borderWidth: 1.5, borderRadius: [6, 6, 0, 0] }
            : { color: d.partial ? '#4FA67D' : '#237A57', borderRadius: [6, 6, 0, 0] },
        })),
        label: { show: true, position: 'top', fontFamily: FONT, fontSize: 12, fontWeight: 700, color: C.ink, formatter: (p: { value: number }) => pkr(p.value).replace('Rs ', '') },
      },
    ],
  }
  return (
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-1">
        <div>
          <div className="text-[12px] text-muted">Saved so far</div>
          <div className="font-display font-bold text-[24px] num text-brand">{pkr(SAVED_TO_DATE_RS)}</div>
        </div>
        <div>
          <div className="text-[12px] text-muted">Saving now</div>
          <div className="font-display font-bold text-[24px] num">{pkr(SAVING_NOW_RS)}/mo</div>
        </div>
        <div>
          <div className="text-[12px] text-muted">After the open fixes</div>
          <div className="font-display font-bold text-[24px] num">{pkr(next)}/mo</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted mt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-brand" /> Measured
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#4FA67D]" /> November so far
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border border-dashed border-brand bg-mint" /> If the 4 open fixes are done from December
        </span>
      </div>
      <ReactECharts option={option} style={{ height: 260 }} notMerge />
    </div>
  )
}

function Decisions() {
  const focus = INSIGHTS.filter((i) => i.kind !== 'verified' && i.rsMonth > 0).sort((a, b) => b.rsMonth - a.rsMonth).slice(0, 3)
  return (
    <div>
      <ul className="divide-y divide-line border-y border-line">
        {focus.map((i) => {
          const rule = ruleForInsight(i.id)
          return (
            <li key={i.id} className="grid grid-cols-[22px_1fr_auto] gap-4 py-4 items-start">
              <span className="w-[18px] h-[18px] rounded-[4px] border-2 border-fg/60 mt-0.5" />
              <div>
                <div className="font-semibold text-[15px]">{i.nextStep}</div>
                <div className="text-[12px] text-muted mt-1">
                  {TRACK[i.id].owner} · due {TRACK[i.id].due.toLowerCase()}
                  {rule && ` · rule ${rule.id} broken ${rule.breaches} of ${rule.of} days`}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display font-bold text-[17px] num">{pkr(i.rsMonth)}</div>
                <div className="text-[11px] text-muted">a month</div>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="grid grid-cols-2 gap-10 mt-12 text-[12px] text-muted">
        <div className="border-t border-fg/50 pt-2">Owner / Managing Director · signature and date</div>
        <div className="border-t border-fg/50 pt-2">Energy in-charge · signature and date</div>
      </div>
    </div>
  )
}

/* ------------------------------ audit-ready pack ------------------------------ */

type RecordId = 'review' | 'enpi' | 'data' | 'rules' | 'log' | 'targets' | 'savings'
const RECORDS: { id: RecordId; label: string; clause: string }[] = [
  { id: 'review', label: 'Energy review', clause: '6.3' },
  { id: 'enpi', label: 'Indicator and baseline', clause: '6.4 · 6.5' },
  { id: 'data', label: 'Metering plan', clause: '6.6' },
  { id: 'rules', label: 'Operating rules', clause: '8.1' },
  { id: 'log', label: 'Deviation log', clause: '9.1 · 10.1' },
  { id: 'targets', label: 'Targets', clause: '6.2' },
  { id: 'savings', label: 'Verified savings', clause: 'ISO 50015' },
]

const READY_UI: Record<Ready, { label: string; hex: string; icon: typeof BadgeCheck }> = {
  ready: { label: 'Produced by Enervtek', hex: '#237A57', icon: BadgeCheck },
  partly: { label: 'Partly: needs a step from Din', hex: '#E0A100', icon: CircleDashed },
  din: { label: "Din's team", hex: '#8A948E', icon: CircleDashed },
}

function AuditPack() {
  const [rec, setRec] = useState<RecordId>('review')
  const ring = {
    animation: false,
    graphic: [
      { type: 'text', left: 'center', top: '38%', style: { text: `${READY_COUNT.ready}/${READY_COUNT.total}`, fill: C.ink, font: `700 28px ${FONT}`, textAlign: 'center' } },
      { type: 'text', left: 'center', top: '56%', style: { text: 'ready', fill: C.muted, font: `12px ${FONT}`, textAlign: 'center' } },
    ],
    series: [
      {
        type: 'pie',
        radius: ['66%', '86%'],
        silent: true,
        label: { show: false },
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        data: [
          { value: READY_COUNT.ready, itemStyle: { color: READY_UI.ready.hex } },
          { value: READY_COUNT.partly, itemStyle: { color: READY_UI.partly.hex } },
          { value: READY_COUNT.din, itemStyle: { color: '#D5DCD7' } },
        ],
      },
    ],
  }

  return (
    <section className="mt-12 max-w-[1180px]">
      <div className="flex items-end justify-between gap-6 flex-wrap mb-5">
        <div>
          <h2 className="font-display font-semibold text-[22px] flex items-center gap-2">
            <FileCheck2 size={20} className="text-brand" /> Audit-ready pack
          </h2>
          <p className="text-[14px] text-muted mt-1 max-w-[70ch]">
            The records ISO 50001 asks for, kept by Enervtek from your meters every day. Open any record, or download it as a spreadsheet for an auditor, PEECA, a bank or a buyer.
          </p>
        </div>
      </div>

      <div className="grid xl:grid-cols-[340px_minmax(0,1fr)] gap-5">
        {/* readiness */}
        <div className="card p-5 self-start">
          <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
            <ReactECharts option={ring} style={{ height: 120 }} notMerge />
            <div className="space-y-1.5 text-[12px]">
              <Legend hex={READY_UI.ready.hex} label={`${READY_COUNT.ready} produced by Enervtek`} />
              <Legend hex={READY_UI.partly.hex} label={`${READY_COUNT.partly} need one step from Din`} />
              <Legend hex="#D5DCD7" label={`${READY_COUNT.din} done by Din's team`} />
            </div>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {READINESS.map((r) => {
              const ui = READY_UI[r.status]
              return (
                <li key={r.clause} className="py-2.5 grid grid-cols-[18px_1fr] gap-2.5">
                  <ui.icon size={16} style={{ color: ui.hex }} className="mt-0.5" />
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold">{r.item}</span>
                      <span className="text-[10px] text-faint num whitespace-nowrap">{r.clause}</span>
                    </div>
                    <div className="text-[12px] text-muted leading-snug">{r.how}</div>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            Enervtek covers the data, analysis and evidence parts of ISO 50001. Using it does not by itself make the mill certified.
          </p>
        </div>

        {/* record viewer */}
        <div className="card min-w-0 overflow-hidden">
          <div className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2" role="tablist">
            {RECORDS.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={rec === r.id}
                onClick={() => setRec(r.id)}
                className={clsx(
                  'focus-ring h-11 px-3.5 -mb-px border-b-2 text-[13px] font-semibold whitespace-nowrap transition-colors',
                  rec === r.id ? 'border-brand text-brand-dark' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="p-5">
            <RecordView id={rec} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Legend({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: hex }} />
      {label}
    </div>
  )
}

function RecordHead({ title, clause, note, onCsv }: { title: string; clause: string; note: string; onCsv: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <div className="font-display font-semibold text-[16px]">
          {title} <span className="ml-1 text-[11px] font-sans font-semibold text-muted bg-sunken rounded-full px-2 py-0.5 align-middle">ISO 50001 {clause}</span>
        </div>
        <div className="text-[13px] text-muted mt-1">{note}</div>
      </div>
      <button onClick={onCsv} className="btn-ghost border border-line !h-8 !px-3 !text-[12px] shrink-0">
        <Download size={14} /> Download CSV
      </button>
    </div>
  )
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={clsx('py-2 px-2 font-semibold text-muted whitespace-nowrap', right ? 'text-right' : 'text-left')}>{children}</th>
}

function RecordView({ id }: { id: RecordId }) {
  if (id === 'review') {
    return (
      <>
        <RecordHead
          title="Energy review"
          clause="6.3"
          note="Where energy goes, ranked from metered data. Significant uses are watched more closely and each has an owner."
          onCsv={() =>
            downloadCsv(
              'energy-review',
              ENERGY_REVIEW.map((r) => ({ area: r.area, machines: r.machines, kwh_per_month: Math.round(r.kwhMonth), rs_per_month: Math.round(r.rsMonth), share_pct: +(r.share * 100).toFixed(1), significant: r.significant ? 'yes' : 'no', driven_by: r.variable, owner: r.owner })),
            )
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="border-b border-line">
              <tr>
                <Th>Area</Th>
                <Th right>Units / month</Th>
                <Th>Share of bill</Th>
                <Th>Driven by</Th>
                <Th>Owner</Th>
              </tr>
            </thead>
            <tbody>
              {ENERGY_REVIEW.map((r) => (
                <tr key={r.area} className="border-b border-line last:border-0">
                  <td className="py-2 px-2">
                    <span className="font-semibold">{r.area}</span>
                    {r.significant && <span className="ml-2 text-[10px] font-bold text-brand uppercase tracking-wide">Significant</span>}
                    <div className="text-[11px] text-muted">{r.machines} machines</div>
                  </td>
                  <td className="py-2 px-2 text-right num">{fmt(r.kwhMonth)}</td>
                  <td className="py-2 px-2 w-[200px]">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-sunken overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(r.share / 0.4) * 100}%`, background: r.significant ? '#237A57' : '#BFE3CE' }} />
                      </div>
                      <span className="num w-9 text-right">{fmt(r.share * 100)}%</span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-muted">{r.variable}</td>
                  <td className="py-2 px-2">{r.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  if (id === 'enpi') {
    const e = enpi()
    const option = {
      animation: false,
      grid: { left: 48, right: 12, top: 16, bottom: 24 },
      tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: number) => `${fmt(v)} units` },
      xAxis: { type: 'category', boundaryGap: false, data: e.days.map((d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short' }).format(d.t)), axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { ...axisLabel, interval: 6 } },
      yAxis: { type: 'value', min: 92000, max: 102000, axisLabel: { ...axisLabel, formatter: (v: number) => `${v / 1000}k` }, splitLine: { lineStyle: { color: C.line, type: 'dashed' } } },
      series: [
        { name: 'Expected', type: 'line', symbol: 'none', lineStyle: { width: 2, color: C.grid, type: 'dashed' }, data: e.days.map((d) => Math.round(d.expected)) },
        { name: 'Used', type: 'line', symbol: 'none', lineStyle: { width: 2.5, color: C.alarm }, data: e.days.map((d) => Math.round(d.kwh)) },
      ],
    }
    return (
      <>
        <RecordHead
          title="Energy indicator and baseline"
          clause="6.4 · 6.5"
          note="Raw units rise with production, so efficiency is judged against what the yarn made should need."
          onCsv={() => downloadCsv('enpi-daily', e.days.map((d) => ({ date: new Date(d.t).toISOString().slice(0, 10), kg_yarn: Math.round(d.kg), units_used: Math.round(d.kwh), units_expected: Math.round(d.expected), index: +d.index.toFixed(4) })))}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <Mini label="Baseline model" value={e.model} small />
          <Mini label="Baseline period" value={e.period} small />
          <Mini label="Model fit (R²)" value={fmt(e.r2, 2)} />
          <Mini label="Index this month" value={fmt(e.index, 3)} note="1.000 = exactly as expected" />
        </div>
        <ReactECharts option={option} style={{ height: 220 }} notMerge />
        <div className="text-[12px] text-muted">Red: units used. Blue dashed: units expected for the yarn made. Re-baselined when machines or products change.</div>
      </>
    )
  }

  if (id === 'data') {
    return (
      <>
        <RecordHead
          title="Metering and data plan"
          clause="6.6"
          note="What is measured, where, and how often. Gaps are flagged automatically."
          onCsv={() => downloadCsv('metering-plan', DATA_PLAN.rows.map((r) => ({ meter: r.what, location: r.where, count: r.count, interval: r.every, measures: r.measures })))}
        />
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Mini label="Metering points" value={String(DATA_PLAN.total)} />
          <Mini label="Online now" value={`${DATA_PLAN.online} of ${DATA_PLAN.total}`} />
          <Mini label="Data complete, 30 days" value={`${fmt(DATA_PLAN.completeness * 100, 1)}%`} />
        </div>
        <table className="w-full text-[13px]">
          <thead className="border-b border-line">
            <tr>
              <Th>Meter</Th>
              <Th>Where</Th>
              <Th right>Count</Th>
              <Th>Every</Th>
              <Th>Measures</Th>
            </tr>
          </thead>
          <tbody>
            {DATA_PLAN.rows.map((r) => (
              <tr key={r.what} className="border-b border-line last:border-0">
                <td className="py-2 px-2 font-semibold">{r.what}</td>
                <td className="py-2 px-2 text-muted">{r.where}</td>
                <td className="py-2 px-2 text-right num">{r.count}</td>
                <td className="py-2 px-2 whitespace-nowrap">{r.every}</td>
                <td className="py-2 px-2 text-muted">{r.measures}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )
  }

  if (id === 'rules') {
    return (
      <>
        <RecordHead
          title="Operating rules"
          clause="8.1"
          note="Rules Enervtek checks automatically. A broken rule opens or updates a finding, so nothing waits for the next audit."
          onCsv={() => downloadCsv('operating-rules', RULES.map((r) => ({ id: r.id, rule: r.rule, checked: r.checked, days_broken: r.breaches, days_checked: r.of })))}
        />
        <div className="space-y-2.5">
          {RULES.map((r) => {
            const broken = r.breaches > 0
            const finding = broken && INSIGHTS.find((i) => i.id === r.insightId)
            return (
              <div key={r.id} className="grid md:grid-cols-[40px_1fr_220px_auto] gap-3 items-center py-2 border-b border-line last:border-0">
                <span className="text-[12px] font-bold text-muted num">{r.id}</span>
                <div>
                  <div className="text-[13px] font-semibold">{r.rule}</div>
                  <div className="text-[11px] text-muted">Checked {r.checked.toLowerCase()}</div>
                </div>
                <div>
                  <div className="flex gap-[2px]">
                    {Array.from({ length: r.of }, (_, d) => (
                      <span key={d} className="h-4 flex-1 rounded-[2px]" style={{ background: d >= r.of - r.breaches ? '#C9563F' : '#BFE3CE' }} />
                    ))}
                  </div>
                  <div className={clsx('text-[11px] mt-1', broken ? 'text-alarm font-semibold' : 'text-brand font-semibold')}>
                    {broken ? `Broken ${r.breaches} of ${r.of} days` : `Kept all ${r.of} days`}
                  </div>
                </div>
                {finding ? (
                  <Link to={`/advisor#${finding.id}`} className="text-[12px] font-semibold text-brand hover:underline whitespace-nowrap">
                    Open finding
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  if (id === 'log') {
    return (
      <>
        <RecordHead
          title="Deviation and investigation log"
          clause="9.1 · 10.1"
          note="Every significant deviation, with its cause, action, owner and whether it is closed."
          onCsv={() => downloadCsv('deviation-log', DEVIATION_LOG.map((r) => ({ detected_days_ago: r.detected, deviation: r.deviation, cause: r.cause, action: r.action, owner: r.owner, status: r.status, closed: r.closed ? 'yes' : 'no' })))}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="border-b border-line">
              <tr>
                <Th>Detected</Th>
                <Th>Deviation</Th>
                <Th>Cause</Th>
                <Th>Owner</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {DEVIATION_LOG.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 align-top">
                  <td className="py-2 px-2 text-muted whitespace-nowrap">{r.detected === 0 ? 'Today' : `${r.detected} days ago`}</td>
                  <td className="py-2 px-2 font-semibold">{r.deviation}</td>
                  <td className="py-2 px-2 text-muted">{r.cause}</td>
                  <td className="py-2 px-2 whitespace-nowrap">{r.owner}</td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full', r.closed ? 'bg-mint text-brand' : 'bg-warn-bg text-warn')}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  if (id === 'targets') {
    const list = objectives()
    return (
      <>
        <RecordHead
          title="Objectives and targets"
          clause="6.2"
          note="Measurable targets with a date, tracked automatically from the same data."
          onCsv={() => downloadCsv('targets', list.map((t) => ({ target: t.target, by: t.by, now: t.now, progress_pct: Math.round(t.progress * 100) })))}
        />
        <div className="space-y-4">
          {list.map((t) => (
            <div key={t.target}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-semibold">{t.target}</span>
                <span className="text-muted whitespace-nowrap">
                  by {t.by} · <b className="text-fg">{t.now}</b>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-sunken mt-1.5 overflow-hidden">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, t.progress * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }

  // savings
  return (
    <>
      <RecordHead
        title="Verified savings"
        clause="ISO 50015"
        note="Each saving measured against the baseline before and after the fix, and watched afterwards."
        onCsv={() => downloadCsv('verified-savings', LEDGER.map((r) => ({ fix: r.action, area: r.area, done: r.done, cost_rs: r.costRs, estimated_rs_month: r.estRs, measured_rs_month: r.verifiedRs, saving_now_rs_month: r.nowRs, status: r.status, method: r.method })))}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="border-b border-line">
            <tr>
              <Th>Fix</Th>
              <Th>Measured by</Th>
              <Th right>Estimated</Th>
              <Th right>Measured</Th>
              <Th right>Now</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {LEDGER.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 align-top">
                <td className="py-2 px-2">
                  <div className="font-semibold">{r.action}</div>
                  <div className="text-[11px] text-muted">since {r.done.toLowerCase()} · cost {r.costRs ? pkr(r.costRs) : 'nothing'}</div>
                </td>
                <td className="py-2 px-2 text-muted">{r.method}</td>
                <td className="py-2 px-2 text-right num text-muted">{pkr(r.estRs)}</td>
                <td className="py-2 px-2 text-right num font-semibold">{pkr(r.verifiedRs)}</td>
                <td className={clsx('py-2 px-2 text-right num font-semibold', r.status === 'slipping' ? 'text-warn' : 'text-brand')}>{pkr(r.nowRs)}</td>
                <td className="py-2 px-2">
                  <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full', r.status === 'holding' ? 'bg-mint text-brand' : 'bg-warn-bg text-warn')}>
                    {r.status === 'holding' ? 'Holding' : 'Slipping'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Mini({ label, value, note, small }: { label: string; value: string; note?: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-sunken px-4 py-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={clsx('font-semibold mt-0.5', small ? 'text-[12px] leading-snug' : 'font-display text-[20px] num')}>{value}</div>
      {note && <div className="text-[11px] text-muted">{note}</div>}
    </div>
  )
}
