// ISO 50001 records that Enervtek actually produces from live data.
// The owner never needs to read the clause numbers; they are here so the same
// data is ready when an auditor, PEECA, a bank or a buyer asks for it.
//
// Clause references are paraphrased (the standard itself is sold by ISO / PSQCA).
// Enervtek supports ISO 50001; it does not by itself make the mill certified.
import { MACHINES, METER_POINTS } from '../data/din'
import { AREAS, MILL_UKG } from './engine'
import { AREA_DAY_KWH, BASELINE, BLENDED_RS, LEDGER, last30 } from './costs'
import { INSIGHTS } from './insights'
import { STAGES, TRACK } from './tracking'

/* ------------------------------ helpers ------------------------------ */
/** "Today", "Yesterday", "5 days ago", "6 weeks ago" → days ago */
export function daysAgo(found: string): number {
  const f = found.toLowerCase()
  if (f === 'today') return 0
  if (f === 'yesterday') return 1
  const n = parseInt(f, 10) || 0
  return f.includes('week') ? n * 7 : n
}

/* ------------------------------ 6.3 energy review ------------------------------ */
const RELEVANT: Record<string, { variable: string; owner: string }> = {
  ring: { variable: 'Yarn produced (kg), count spun', owner: 'Ring maintenance' },
  ac: { variable: 'Outside temperature and humidity', owner: 'Utilities in-charge' },
  prep: { variable: 'Sliver produced (kg)', owner: 'Preparatory in-charge' },
  services: { variable: 'Daylight hours, shifts worked', owner: 'Electrical in-charge' },
  wind: { variable: 'Cones wound (kg)', owner: 'Winding in-charge' },
  air: { variable: 'Running hours, production', owner: 'Utilities in-charge' },
  draw: { variable: 'Sliver and roving produced (kg)', owner: 'Preparatory in-charge' },
  oe: { variable: 'OE yarn produced (kg)', owner: 'Open End in-charge' },
  colony: { variable: 'Not production', owner: 'Admin' },
}

const TOTAL_DAY = AREA_DAY_KWH.reduce((s, a) => s + a.kwh, 0)

/** Significant energy uses: areas that together make up most of the bill */
export const ENERGY_REVIEW = AREA_DAY_KWH.map((a) => {
  const share = a.kwh / TOTAL_DAY
  return {
    area: a.label,
    machines: MACHINES.filter((m) => (AREAS.find((x) => x.id === a.id)!.stages as readonly string[]).includes(m.stage)).length,
    kwhMonth: a.kwh * 30,
    rsMonth: a.kwh * 30 * BLENDED_RS,
    share,
    significant: share >= 0.07 && a.id !== 'colony',
    ...RELEVANT[a.id],
  }
})

/* ------------------------------ 6.4 / 6.5 baseline & EnPI ------------------------------ */
function fit(days: ReturnType<typeof last30>) {
  // R² of the baseline model (expected) against what was actually used
  const mean = days.reduce((s, d) => s + d.kwh, 0) / days.length
  const ssTot = days.reduce((s, d) => s + (d.kwh - mean) ** 2, 0)
  const ssRes = days.reduce((s, d) => s + (d.kwh - d.expected) ** 2, 0)
  return Math.max(0, 1 - ssRes / ssTot)
}

export function enpi(now = Date.now()) {
  const days = last30(now)
  const used = days.reduce((s, d) => s + d.kwh, 0)
  const expected = days.reduce((s, d) => s + d.expected, 0)
  const kg = days.reduce((s, d) => s + d.kg, 0)
  return {
    days,
    index: used / expected,
    ukg: used / kg,
    r2: fit(days),
    model: `Expected units = ${BASELINE.fixed.toLocaleString('en-PK')} + ${BASELINE.perKg.toFixed(2)} × kg of yarn`,
    period: BASELINE.period,
  }
}

/* ------------------------------ 6.6 data collection ------------------------------ */
export const DATA_PLAN = (() => {
  const by = (t: string) => METER_POINTS.filter((p) => p.tier === t)
  const rows = [
    { what: 'Power-quality analysers', where: '11 kV intake, LT incomers, drive feeders', count: by('incomer').length + by('pq').length, every: '1 second', measures: 'V, I, kW, PF, harmonics to 63rd, events' },
    { what: 'Feeder meters', where: 'Every outgoing feeder in the LT rooms', count: by('feeder').length, every: '5 seconds', measures: 'V, I, kW, kWh, PF' },
    { what: 'Machine meters', where: 'Ring frames, AC plants, colony', count: by('machine').length, every: '5 seconds', measures: 'V, I, kW, kWh, PF' },
    { what: 'Solar inverter loggers', where: '3 inverters', count: by('derived').length, every: '10 seconds', measures: 'kW, kWh, inverter status' },
    { what: 'Production entry', where: 'Supervisor, once a day', count: 1, every: 'Daily', measures: 'kg of yarn by count' },
  ]
  return { rows, total: METER_POINTS.length, online: METER_POINTS.length - 2, completeness: 0.996 }
})()

/* ------------------------------ 8.1 operating rules ------------------------------ */
export interface Rule {
  id: string
  rule: string
  checked: string
  breaches: number
  of: number
  insightId: string
}

/** Rules checked automatically every day; a breach opens or updates a finding */
export const RULES: Rule[] = [
  { id: 'R1', rule: 'Autocone compressor off during night cleaning (01:00–04:00)', checked: 'Every night', breaches: 30, of: 30, insightId: 'compressor-night' },
  { id: 'R2', rule: 'Restart after cleaning in groups: grid demand under 4,600 kW', checked: 'Every morning', breaches: 30, of: 30, insightId: 'restart-peak' },
  { id: 'R3', rule: 'Ring AC 1+2 at or under 120 kW at night', checked: 'Every night', breaches: 14, of: 30, insightId: 'ac-persistence' },
  { id: 'R4', rule: 'Capacitor current on every LT panel under 130%', checked: 'Every 15 minutes', breaches: 22, of: 30, insightId: 'lt2-harmonics' },
  { id: 'R5', rule: 'Every machine within 5% of identical machines', checked: 'Every hour', breaches: 10, of: 30, insightId: 'ring-34' },
  { id: 'R6', rule: 'Skylight lighting rows off from 09:00 to 16:00', checked: 'Every day', breaches: 0, of: 30, insightId: 'lights-verified' },
  { id: 'R7', rule: 'Waste plant off when the bale press is idle', checked: 'Every hour', breaches: 0, of: 30, insightId: '' },
]
export const ruleForInsight = (id: string) => RULES.find((r) => r.insightId === id && r.breaches > 0)

/* ------------------------------ 9.1 / 10.1 deviation log ------------------------------ */
export const DEVIATION_LOG = INSIGHTS.map((i) => {
  const t = TRACK[i.id]
  return {
    id: i.id,
    detected: daysAgo(t.found),
    deviation: i.title,
    cause: t.stage >= 2 ? t.causes[0] : `Not confirmed yet · likely: ${t.causes[0].toLowerCase()}`,
    action: t.steps[0].replace(' ✓', ''),
    owner: t.owner,
    status: STAGES[t.stage],
    closed: t.stage >= 4,
  }
}).sort((a, b) => a.detected - b.detected)

/* ------------------------------ 6.2 objectives & targets ------------------------------ */
export function objectives() {
  const e = enpi()
  const openWaste = INSIGHTS.filter((i) => i.kind === 'waste')
  const fixed = openWaste.filter((i) => TRACK[i.id].stage >= 3).length
  return [
    { target: `Cut units per kg by 2%: ${MILL_UKG.toFixed(2)} → ${(MILL_UKG * 0.98).toFixed(2)}`, by: 'June 2027', now: `${e.ukg.toFixed(2)} now`, progress: Math.max(0, Math.min(1, (MILL_UKG - e.ukg) / (MILL_UKG * 0.02))) },
    { target: 'Remove the 4 open waste findings', by: 'March 2027', now: `${fixed} of ${openWaste.length} fixed`, progress: fixed / openWaste.length },
    { target: 'Keep LT#2 voltage distortion under 5%', by: 'February 2027', now: '7.0% now', progress: 0 },
    { target: 'Keep every confirmed saving holding', by: 'Ongoing', now: `${LEDGER.filter((l) => l.status === 'holding').length} of ${LEDGER.length} holding`, progress: LEDGER.filter((l) => l.status === 'holding').length / LEDGER.length },
  ]
}

/* ------------------------------ readiness ------------------------------ */
export type Ready = 'ready' | 'partly' | 'din'

export const READINESS: { clause: string; item: string; status: Ready; how: string }[] = [
  { clause: '4.3', item: 'Scope and boundaries', status: 'ready', how: `The spinning unit, ${MACHINES.length} machines, grid and solar` },
  { clause: '5.2', item: 'Energy policy', status: 'din', how: 'One-page policy signed by the owner. Enervtek provides a draft.' },
  { clause: '5.3', item: 'Energy team and roles', status: 'partly', how: 'Every action has an owner. The mill names one energy in-charge.' },
  { clause: '6.2', item: 'Objectives and action plans', status: 'ready', how: 'Targets with progress, every action with an owner and a date' },
  { clause: '6.3', item: 'Energy review', status: 'ready', how: 'Significant energy uses ranked from metered data' },
  { clause: '6.4 · 6.5', item: 'Indicators and baseline', status: 'ready', how: `Units per kg (${MILL_UKG.toFixed(2)} on a normal day) against a 12-month baseline` },
  { clause: '6.6', item: 'Data collection plan', status: 'ready', how: `${METER_POINTS.length} metering points, intervals and completeness logged` },
  { clause: '7.5', item: 'Records', status: 'ready', how: 'Every reading, finding and action kept and exportable' },
  { clause: '8.1', item: 'Operating rules', status: 'ready', how: `${RULES.length} rules checked automatically` },
  { clause: '9.1', item: 'Monitoring and deviations', status: 'ready', how: 'Every deviation logged with cause, action and closure' },
  { clause: '9.2', item: 'Internal audit', status: 'din', how: 'Once a year by the mill or a consultant, using these records' },
  { clause: '9.3', item: 'Management review', status: 'partly', how: "Enervtek's numbers are the input. The owner reviews and signs." },
  { clause: '10', item: 'Corrective action and improvement', status: 'ready', how: 'Every fix checked by measurement before it is closed (ISO 50015 method)' },
]
export const READY_COUNT = {
  ready: READINESS.filter((r) => r.status === 'ready').length,
  partly: READINESS.filter((r) => r.status === 'partly').length,
  din: READINESS.filter((r) => r.status === 'din').length,
  total: READINESS.length,
}

/* ------------------------------ savings path ------------------------------ */
/** Rupees saved per month since the first fix, and the path if open fixes are done */
export const SAVINGS_PATH = [
  { month: 'Aug', saved: 67_200, projected: false },
  { month: 'Sep', saved: 153_700, projected: false },
  { month: 'Oct', saved: 261_000, projected: false },
  { month: 'Nov', saved: 130_000, projected: false, partial: true },
  { month: 'Dec', saved: 0, projected: true },
  { month: 'Jan', saved: 0, projected: true },
  { month: 'Feb', saved: 0, projected: true },
  { month: 'Mar', saved: 0, projected: true },
]

/* ------------------------------ CSV export ------------------------------ */
export function downloadCsv(name: string, rows: Record<string, string | number>[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `din-spinning-unit-dil_${name}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
