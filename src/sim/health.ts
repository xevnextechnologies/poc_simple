// Machine performance (compare sister machines doing the same work) and
// machine health (electrical stress and slow degradation).
import { MACHINES, machineById } from '../data/din'
import type { Machine } from '../data/din'
import { loadType } from './pq'

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}
const BLENDED_RS = 28

export type Level = 'ok' | 'watch' | 'act'

/* =============================== PERFORMANCE =============================== */

export interface PeerGroup {
  id: string
  label: string
  work: string
  /** Normal units (kWh) per kg for this group on this count */
  baseUkg: number
  ids: string[]
}

const ids = (pred: (m: Machine) => boolean) => MACHINES.filter(pred).map((m) => m.id)
const num = (id: string) => Number(id.replace(/\D/g, ''))

export const PEER_GROUPS: PeerGroup[] = [
  { id: 'ring-1200', label: 'Ring frames 32–39', work: '1,200 spindles · 30s combed', baseUkg: 2.1, ids: ids((m) => m.kind === 'ring-frame' && num(m.id) >= 32) },
  { id: 'ring-1056', label: 'Ring frames 25–30', work: '1,056 spindles · 40s combed', baseUkg: 2.65, ids: ids((m) => m.kind === 'ring-frame' && num(m.id) >= 25 && num(m.id) <= 30) },
  { id: 'ring-1008', label: 'Ring frames 1–24', work: '1,008 spindles · 20s carded', baseUkg: 1.55, ids: ids((m) => m.kind === 'ring-frame' && num(m.id) <= 24) },
  { id: 'cards', label: 'Cards 1–30', work: 'Carded sliver · ~55 kg/h', baseUkg: 0.21, ids: ids((m) => m.kind === 'card' && !m.id.startsWith('MX')) },
  { id: 'autoconers', label: 'Autoconers 1–16', work: '60 drums · cone winding', baseUkg: 0.24, ids: ids((m) => m.kind === 'autoconer') },
  { id: 'simplex', label: 'Simplex 1–10', work: '120 spindles · roving', baseUkg: 0.16, ids: ids((m) => m.kind === 'simplex' && !m.id.startsWith('MX') && m.id !== 'SX-11') },
]

/** % more (or less) energy per kg than the group's normal */
const DEVIATION: Record<string, number> = { 'RF-34': 10.5, 'CD-17': 6.2, 'AW-09': 5.4 }

export function deviation(id: string): number {
  return DEVIATION[id] ?? +((hash(`dev:${id}`) - 0.5) * 5).toFixed(1)
}
export function perfLevel(dev: number): Level {
  return dev > 8 ? 'act' : dev > 5 ? 'watch' : 'ok'
}
/** Extra money per month from using more than the group normal */
export function extraRsMonth(id: string): number {
  const m = machineById[id]
  const d = deviation(id)
  if (d <= 5) return 0 // inside the normal range: not counted as waste
  return m.ratedKw * m.typicalLoad * (d / 100) * 21 * 30 * BLENDED_RS
}

export function groupRows(g: PeerGroup) {
  return g.ids.map((id) => {
    const dev = deviation(id)
    return { id, name: machineById[id].name, dev, ukg: g.baseUkg * (1 + dev / 100), level: perfLevel(dev), rs: extraRsMonth(id) }
  })
}

export const PERF_FLAGGED = PEER_GROUPS.flatMap((g) => groupRows(g).map((r) => ({ ...r, group: g }))).filter((r) => r.level !== 'ok')

/* ================================= HEALTH ================================= */

export interface Indicator {
  key: string
  label: string
  plain: string
  unit: string
  /** Higher is worse unless `lowerIsWorse` */
  watch: number
  act: number
  lowerIsWorse?: boolean
  applies?: (m: Machine) => boolean
}

export const INDICATORS: Indicator[] = [
  { key: 'imbalance', label: 'Current imbalance', plain: 'Are the three phases sharing the load evenly?', unit: '%', watch: 5, act: 8 },
  { key: 'vimb', label: 'Voltage imbalance', plain: 'Is the supply to this machine even on all phases?', unit: '%', watch: 1, act: 2 },
  { key: 'load', label: 'Load vs rated', plain: 'Is it working harder than it was built for?', unit: '%', watch: 90, act: 100 },
  { key: 'thdi', label: 'Harmonics (THDi)', plain: 'How distorted is the current the drive draws?', unit: '%', watch: 45, act: 60, applies: (m) => loadType(m) === 'vfd' },
  { key: 'pf', label: 'Power factor', plain: 'How much of the current does useful work?', unit: '', watch: 0.85, act: 0.8, lowerIsWorse: true },
  { key: 'drift', label: 'Energy drift', plain: 'More power than its own normal for the same work?', unit: '%', watch: 5, act: 8 },
  { key: 'trips', label: 'Trips (30 days)', plain: 'How often has it stopped unexpectedly?', unit: '', watch: 3, act: 20 },
  { key: 'service', label: 'Hours since service', plain: 'Run hours against the service interval. Upcoming services are tracked in Maintenance.', unit: '%', watch: 100, act: 100 },
]

export interface HealthRecord {
  id: string
  values: Record<string, number | null>
  levels: Record<string, Level | null>
  score: number
  level: Level
  /** Plain-language headline for the worst indicator */
  headline?: string
  /** Which indicator to trend, and the trend itself (6 weeks, daily) */
  trendKey?: string
  trend?: number[]
  note?: string
}

function lvl(ind: Indicator, v: number): Level {
  if (ind.lowerIsWorse) return v < ind.act ? 'act' : v < ind.watch ? 'watch' : 'ok'
  return v > ind.act ? 'act' : v > ind.watch ? 'watch' : 'ok'
}

type Ov = { values?: Record<string, number>; headline?: string; trendKey?: string; trend?: (i: number) => number; note?: string }

const OV: Record<string, Ov> = {
  'BR-L1-CN': {
    values: { imbalance: 9.1 },
    headline: 'Phase imbalance has tripled in 3 weeks (3% → 9%)',
    trendKey: 'imbalance',
    trend: (i) => (i < 21 ? 2.8 + 0.2 * Math.sin(i) : 3 + (6.1 * (i - 21)) / 20),
    note: 'Typical early sign of a loose terminal, a worn contactor or a winding fault. Motors overheat quickly above 8–10% imbalance.',
  },
  'RF-34': {
    values: { drift: 10.5, service: 97 },
    headline: 'Uses 10.5% more power than normal for the same yarn',
    trendKey: 'drift',
    trend: (i) => (i < 32 ? 0.5 * Math.sin(i * 1.7) : Math.min(10.5, (10.5 * (i - 31)) / 7)),
    note: 'Mechanical drag (spindle tapes, rollers, bearings) shows up as extra electrical load long before it shows up in quality.',
  },
  'OE-01': {
    values: { thdi: 52 },
    headline: 'Drive input harmonics rising: 41% → 52% in 6 weeks',
    trendKey: 'thdi',
    trend: (i) => 41 + (11 * i) / 41 + 0.8 * Math.sin(i),
    note: 'A rising THDi on the same drive often means its DC-bus capacitors or input choke are ageing.',
  },
  'CP-02': {
    values: { service: 104, load: 88 },
    headline: 'Service overdue: 4,160 of 4,000 hours',
    trendKey: 'service',
    trend: (i) => 75 + (29 * i) / 41,
    note: 'Also runs through night cleaning, which uses up service hours faster.',
  },
  'CD-06': {
    values: { trips: 14 },
    headline: 'Tripped 14 times in 30 days, all during supply dips',
    trendKey: 'trips',
    trend: (i) => Math.floor((i / 41) * 26),
    note: 'The card itself is healthy. The trips are caused by the supply (see Power quality).',
  },
  'CD-05': { values: { trips: 14 }, headline: 'Tripped 14 times in 30 days, all during supply dips', note: 'Caused by supply dips, not the card.' },
  'CD-07': { values: { trips: 14 }, headline: 'Tripped 14 times in 30 days, all during supply dips', note: 'Caused by supply dips, not the card.' },
  'CD-17': { values: { drift: 6.2 }, headline: 'Uses 6% more power than the other cards', trendKey: 'drift', trend: (i) => (i < 20 ? 0.6 * Math.sin(i) : (6.2 * (i - 20)) / 21) },
  'AW-09': { values: { drift: 5.4 }, headline: 'Uses 5% more power than the other autoconers', trendKey: 'drift', trend: (i) => (i < 25 ? 0.5 * Math.sin(i) : (5.4 * (i - 25)) / 16) },
}

function baseValues(m: Machine): Record<string, number | null> {
  const r = (k: string) => hash(`${k}:${m.id}`)
  const vfd = loadType(m) === 'vfd'
  return {
    imbalance: +(1 + r('i') * 2.6).toFixed(1),
    vimb: +(0.2 + r('v') * 0.5).toFixed(2),
    load: Math.round(m.typicalLoad * 100 * (0.95 + r('l') * 0.08)),
    thdi: vfd ? Math.round(28 + r('t') * 12) : null,
    pf: +(vfd ? 0.9 + r('p') * 0.05 : 0.86 + r('p') * 0.06).toFixed(2),
    drift: +((r('d') - 0.5) * 3).toFixed(1),
    trips: r('tr') > 0.85 ? 1 : 0,
    // Position in the service cycle, spread evenly; shared with the Maintenance pages
    service: Math.round(3 + r('s') * 96),
  }
}

function build(m: Machine): HealthRecord {
  const o = OV[m.id]
  const values = { ...baseValues(m), ...(o?.values ?? {}) }
  const levels: Record<string, Level | null> = {}
  let score = 100
  for (const ind of INDICATORS) {
    const v = values[ind.key]
    if (v == null || (ind.applies && !ind.applies(m))) {
      levels[ind.key] = null
      values[ind.key] = null
      continue
    }
    const l = lvl(ind, v)
    levels[ind.key] = l
    score -= l === 'act' ? 30 : l === 'watch' ? 12 : 0
  }
  score = Math.max(5, Math.min(100, Math.round(score - hash(`sc:${m.id}`) * 6)))
  const level: Level = Object.values(levels).includes('act') ? 'act' : Object.values(levels).includes('watch') ? 'watch' : 'ok'
  return {
    id: m.id,
    values,
    levels,
    score,
    level,
    headline: o?.headline,
    trendKey: o?.trendKey,
    trend: o?.trend ? Array.from({ length: 42 }, (_, i) => +o.trend!(i).toFixed(2)) : undefined,
    note: o?.note,
  }
}

export const HEALTH: Record<string, HealthRecord> = Object.fromEntries(MACHINES.map((m) => [m.id, build(m)]))

export const HEALTH_LIST = MACHINES.map((m) => HEALTH[m.id])
export const healthCounts = () => ({
  ok: HEALTH_LIST.filter((h) => h.level === 'ok').length,
  watch: HEALTH_LIST.filter((h) => h.level === 'watch').length,
  act: HEALTH_LIST.filter((h) => h.level === 'act').length,
})
