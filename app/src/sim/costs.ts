// Cost, efficiency and savings: what the owner sees in rupees, built on the
// ISO 50001 method underneath (energy review 6.3, EnPI 6.4, baseline 6.5,
// monitoring 9.1, verified savings ISO 50015) and the audit lessons
// (savings ledger, persistence alerts, Rs per kg, waste first).
import { MACHINES, SITE } from '../data/din'
import { isCleaning } from '../lib/time'
import { AREAS, DAY_CURVE, KG_PER_HOUR, TARIFF, machineAt, pkMidnight } from './engine'

const STEP = 0.25
const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

/* ------------------------------ one normal day ------------------------------ */
export const DAY_KWH = DAY_CURVE.reduce((s, x) => s + x.load * STEP, 0)
export const DAY_COST = DAY_CURVE.reduce((s, x) => s + x.cost, 0)
export const DAY_SOLAR_KWH = DAY_CURVE.reduce((s, x) => s + x.solar * STEP, 0)
export const DAY_GRID_KWH = DAY_CURVE.reduce((s, x) => s + x.grid * STEP, 0)
export const KG_PER_DAY = KG_PER_HOUR * 21
/** Average rupees per unit across grid and solar */
export const BLENDED_RS = DAY_COST / DAY_KWH

/* --------------------- energy review: significant energy uses --------------------- */
/** kWh per day for each area, from the machine model */
export const AREA_DAY_KWH = AREAS.map((a) => {
  const ms = MACHINES.filter((m) => (a.stages as readonly string[]).includes(m.stage))
  let kwh = 0
  let cleaningKwh = 0
  for (let i = 0; i < 96; i++) {
    const h = i * STEP + STEP / 2
    const kw = ms.reduce((s, m) => s + machineAt(m, h).kw, 0)
    kwh += kw * STEP
    if (isCleaning(Math.floor(h))) cleaningKwh += kw * STEP
  }
  return { id: a.id, label: a.label, kwh, cleaningKwh }
}).sort((a, b) => b.kwh - a.kwh)

/* ------------------------------ night cleaning waste ------------------------------ */
export const CLEANING_VERDICT: Record<string, { verdict: 'needed' | 'partly' | 'avoidable'; why: string }> = {
  ac: { verdict: 'needed', why: 'Humidity must be held for the yarn. Check fan speeds can be lowered.' },
  air: { verdict: 'avoidable', why: 'Autocone compressor runs with no autocones running.' },
  services: { verdict: 'partly', why: 'Lights in empty halls, exhaust fans.' },
  colony: { verdict: 'needed', why: 'Residential supply, not production.' },
}

/* ------------------------------ EnPI: 30 days ------------------------------ */
// Expected kWh = fixed + variable × kg  (ISO 50006 style regression, fitted on
// the baseline year). Efficiency index = actual ÷ expected.
export const BASELINE = { fixed: 14_000, perKg: (DAY_KWH - 14_000) / KG_PER_DAY, period: 'Nov 2025 – Oct 2026', provisional: false }
export const expectedKwh = (kg: number) => BASELINE.fixed + BASELINE.perKg * kg

export interface Day {
  t: number
  kg: number
  kwh: number
  expected: number
  index: number
  cost: number
  solarKwh: number
}

export function last30(now = Date.now()): Day[] {
  const mid = pkMidnight(now)
  return Array.from({ length: 30 }, (_, i) => {
    const t = mid - (30 - i) * 86_400_000
    const r = hash(`kg:${i}`)
    const kg = KG_PER_DAY * (0.93 + 0.1 * r)
    const exp = expectedKwh(kg)
    // Ring 34 drift and card restarts push the last 10 days up a little;
    // the lighting fix 3 weeks ago pulls it down a little.
    const drift = (i >= 20 ? 0.0014 * (i - 19) : 0) - (i >= 9 ? 0.002 : 0)
    const kwh = exp * (1 + drift + 0.006 * (hash(`n:${i}`) - 0.5))
    const sun = 0.8 + 0.25 * hash(`sun:${i}`)
    const solarKwh = DAY_SOLAR_KWH * sun
    const cost = kwh * BLENDED_RS + (DAY_SOLAR_KWH - solarKwh) * (TARIFF.gridRs - 0)
    return { t, kg, kwh, expected: exp, index: kwh / exp, cost, solarKwh }
  })
}

/* ------------------------------ production input ------------------------------ */
// Entered by the production supervisor once a day (ISO 50001 relevant variable).
export const PRODUCTION_TODAY = [
  { count: '20s Carded', frames: 'Ring 1–24', share: 0.37, ukg: 3.6 },
  { count: '30s Combed', frames: 'Ring 32–39', share: 0.4, ukg: 4.4 },
  { count: '40s Combed', frames: 'Ring 25–30', share: 0.23, ukg: 5.6 },
].map((c) => ({ ...c, kg: Math.round(KG_PER_DAY * c.share), rsPerKg: c.ukg * BLENDED_RS }))

/* ------------------------------ carbon ------------------------------ */
export const CO2 = { grid: 0.45, solar: 0 } // kg CO2 per kWh (estimated grid factor)
export const CO2_PER_KG_YARN = (DAY_GRID_KWH * CO2.grid) / KG_PER_DAY

/* ------------------------------ savings ledger ------------------------------ */
// Conservative estimate before the work, measured result after (ISO 50015).
export interface LedgerRow {
  id: string
  action: string
  area: string
  done: string
  costRs: number
  estRs: number
  verifiedRs: number
  /** What it is saving now (drops if the saving slips) */
  nowRs: number
  monthsRunning: number
  status: 'holding' | 'slipping'
  method: string
  insightId?: string
}

export const LEDGER: LedgerRow[] = [
  {
    id: 'lights',
    action: 'Daylight timer on skylight lighting rows',
    area: 'Mills Light feeder · LT#1',
    done: '3 weeks ago',
    costRs: 45_000,
    estRs: 150_000,
    verifiedRs: 176_400,
    nowRs: 176_400,
    monthsRunning: 0.75,
    status: 'holding',
    method: 'Feeder kW 09:00–16:00, 3 weeks before vs 3 weeks after',
    insightId: 'lights-verified',
  },
  {
    id: 'ac-night',
    action: 'Ring AC 1+2 fans slower at night',
    area: 'Ring AC 1+2 · LT#3&4',
    done: 'August',
    costRs: 0,
    estRs: 120_000,
    verifiedRs: 134_400,
    nowRs: 110_200,
    monthsRunning: 3,
    status: 'slipping',
    method: 'Night kW 22:00–06:00 vs baseline, adjusted for outside temperature',
    insightId: 'ac-persistence',
  },
  {
    id: 'waste-plant',
    action: 'Waste plant switched off when the bale press is idle',
    area: 'Waste Plant · LT#3&4',
    done: 'September',
    costRs: 0,
    estRs: 35_000,
    verifiedRs: 38_600,
    nowRs: 38_600,
    monthsRunning: 2,
    status: 'holding',
    method: 'Idle-hours kWh vs the month before',
  },
]

export const SAVING_NOW_RS = LEDGER.reduce((s, r) => s + r.nowRs, 0)
export const SAVED_TO_DATE_RS = LEDGER.reduce((s, r) => s + r.verifiedRs * r.monthsRunning, 0)
export const ESTIMATED_RS = LEDGER.reduce((s, r) => s + r.estRs, 0)
export const VERIFIED_RS = LEDGER.reduce((s, r) => s + r.verifiedRs, 0)

export { SITE }
