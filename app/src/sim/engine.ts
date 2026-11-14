// Deterministic simulation of Spinning Unit DIL.
// Every value on every screen is computed from the machine model below, so
// machine → area → mill → (grid + solar) always add up.
// Din runs on two sources only: the LESCO grid and its own solar plant.
import { MACHINES, SITE, TOTAL_SOLAR_KWP } from '../data/din'
import type { Machine, ProcessStage } from '../data/din'
import { isCleaning } from '../lib/time'
import { OVERRIDES } from './scenarios'

/* ----------------------------- tariff ----------------------------- */
export const TARIFF = {
  gridRs: 35, // ≈ Rs 35 per unit (industrial, from the pitch deck)
  solarRs: 0,
}

/* ----------------------------- helpers ----------------------------- */
function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}
/** Smooth noise in [-1, 1] that changes every `bucketSec` seconds */
export function noise(key: string, t: number, bucketSec = 4): number {
  const b = Math.floor(t / 1000 / bucketSec)
  return hash(`${key}:${b}`) * 2 - 1
}

/** Pakistan local hour as a decimal (e.g. 14.5 = 14:30) */
export function pkHour(t: number): number {
  const d = new Date(t + 5 * 3600 * 1000) // PKT = UTC+5, no DST
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600
}
/** Epoch ms of today's 00:00 PKT */
export function pkMidnight(t: number): number {
  const shifted = t + 5 * 3600 * 1000
  return t - (shifted % (24 * 3600 * 1000))
}

const PRODUCTION: ProcessStage[] = [
  'blowroom', 'carding', 'drawing', 'combing', 'simplex', 'ring', 'openend', 'winding', 'inspection', 'packing',
]

/* ----------------------------- machine model ----------------------------- */
export type Status = 'running' | 'attention' | 'stopped' | 'idle'

export interface MachineLive {
  status: Status
  kw: number
  /** What this machine normally draws right now */
  normalKw: number
  note?: string
}

/** kW with no noise, used for history and the daily curve */
export function machineAt(m: Machine, hour: number, t?: number): MachineLive {
  const normal = m.ratedKw * m.typicalLoad
  const cleaning = isCleaning(Math.floor(hour))
  const ov = OVERRIDES[m.id]

  let status: Status = 'running'
  let kw = normal
  let normalKw = normal

  if (cleaning && PRODUCTION.includes(m.stage)) {
    status = 'idle'
    kw = normal * 0.06
    normalKw = kw
  } else if (cleaning && m.stage === 'humidification') {
    kw = normal * 0.8 // AC keeps running during cleaning (RH control)
  }
  // Natural variation through the day (doffing cycles, afternoon heat for AC)
  if (status === 'running') {
    if (m.stage === 'humidification') kw *= 0.9 + 0.2 * Math.max(0, Math.sin((Math.PI * (hour - 8)) / 14))
    else if (PRODUCTION.includes(m.stage)) kw *= 1 + 0.025 * Math.sin((2 * Math.PI * hour) / 2.7) + 0.012 * Math.sin((2 * Math.PI * hour) / 7.1)
  }
  // Restart after cleaning: everything comes back together → demand spike
  if (hour >= 4 && hour < 4.25 && PRODUCTION.includes(m.stage)) kw = normal * 1.15

  if (ov) {
    const r = ov(hour, t)
    if (r) {
      status = r.status ?? status
      kw = r.kw ?? (r.factor != null ? normal * r.factor : kw)
      return { status, kw, normalKw, note: r.note }
    }
  }
  return { status, kw, normalKw }
}

/** Live value with small realistic fluctuation */
export function machineLive(m: Machine, t: number): MachineLive {
  const base = machineAt(m, pkHour(t), t)
  if (base.kw === 0) return base
  const wobble = 1 + 0.025 * noise(m.id, t, 2) + 0.012 * noise(m.id + 'f', t, 1)
  return { ...base, kw: base.kw * wobble }
}

/* ----------------------------- sources ----------------------------- */
const SUNRISE = 6.6
const SUNSET = 17.3

export function solarAt(hour: number, t?: number): number {
  if (hour <= SUNRISE || hour >= SUNSET) return 0
  const x = (hour - SUNRISE) / (SUNSET - SUNRISE)
  let kw = TOTAL_SOLAR_KWP * 0.66 * Math.pow(Math.sin(Math.PI * x), 1.3)
  // passing clouds
  if (t != null) kw *= 1 - 0.04 * Math.abs(noise('sun', t, 20))
  return kw
}

export interface Mix {
  load: number
  solar: number
  grid: number
}

export function mixFor(load: number, hour: number, t?: number): Mix {
  // Solar first, the grid supplies the rest
  const solar = Math.min(solarAt(hour, t), load)
  return { load, solar, grid: load - solar }
}

/* ----------------------------- mill snapshots ----------------------------- */
export function millLoadAt(hour: number): number {
  return MACHINES.reduce((s, m) => s + machineAt(m, hour).kw, 0)
}

export interface LiveSnapshot {
  t: number
  hour: number
  machines: Record<string, MachineLive>
  mix: Mix
  rsPerHour: number
}

export function snapshot(t: number): LiveSnapshot {
  const hour = pkHour(t)
  const machines: Record<string, MachineLive> = {}
  let load = 0
  for (const m of MACHINES) {
    const l = machineLive(m, t)
    machines[m.id] = l
    load += l.kw
  }
  const mix = mixFor(load, hour, t)
  return { t, hour, machines, mix, rsPerHour: mixCost(mix) }
}

export function mixCost(m: Mix): number {
  return m.grid * TARIFF.gridRs + m.solar * TARIFF.solarRs
}

/* ----------------------------- daily curve & today ----------------------------- */
export interface Slot extends Mix {
  hour: number
  cost: number
}

const STEP = 0.25 // 15-minute intervals
export const DAY_CURVE: Slot[] = Array.from({ length: 96 }, (_, i) => {
  const hour = i * STEP
  const mix = mixFor(millLoadAt(hour + STEP / 2), hour + STEP / 2)
  return { hour, ...mix, cost: mixCost(mix) * STEP }
})

const DAY_KWH = DAY_CURVE.reduce((s, x) => s + x.load * STEP, 0)
const PRODUCTION_HOURS = 21
/** kg per production hour, calibrated so a normal day lands on Din's UKG */
export const KG_PER_HOUR = DAY_KWH / (SITE.ukgBaseline * PRODUCTION_HOURS)

export interface Today {
  kwh: number
  gridKwh: number
  solarKwh: number
  cost: number
  kg: number
  ukg: number
  peakGridKw: number
  peakAt: number
}

export function todaySoFar(hour: number): Today {
  let kwh = 0, gridKwh = 0, solarKwh = 0, cost = 0, kg = 0, peakGridKw = 0, peakAt = 0
  for (const s of DAY_CURVE) {
    if (s.hour >= hour) break
    const f = Math.min(STEP, hour - s.hour) / STEP
    kwh += s.load * STEP * f
    gridKwh += s.grid * STEP * f
    solarKwh += s.solar * STEP * f
    cost += s.cost * f
    if (!isCleaning(Math.floor(s.hour))) kg += KG_PER_HOUR * STEP * f
    if (s.grid > peakGridKw) {
      peakGridKw = s.grid
      peakAt = s.hour
    }
  }
  return { kwh, gridKwh, solarKwh, cost, kg, ukg: kg > 0 ? kwh / kg : SITE.ukgBaseline, peakGridKw, peakAt }
}

/* ----------------------------- areas ----------------------------- */
export const AREAS = [
  { id: 'ring', label: 'Ring spinning', stages: ['ring'] },
  { id: 'ac', label: 'Humidification & AC', stages: ['humidification'] },
  { id: 'prep', label: 'Blow room & carding', stages: ['blowroom', 'carding'] },
  { id: 'air', label: 'Compressed air', stages: ['compressed-air'] },
  { id: 'oe', label: 'Open End', stages: ['openend'] },
  { id: 'draw', label: 'Drawing, combing & simplex', stages: ['drawing', 'combing', 'simplex'] },
  { id: 'wind', label: 'Winding & packing', stages: ['winding', 'inspection', 'packing'] },
  { id: 'services', label: 'Lights, lab & services', stages: ['utility', 'lighting'] },
  { id: 'colony', label: 'Colony (not production)', stages: ['non-production'] },
] as const

export function areaOf(m: Machine) {
  return AREAS.find((a) => (a.stages as readonly string[]).includes(m.stage))!
}

export function byArea(machines: Record<string, MachineLive>) {
  return AREAS.map((a) => {
    const ms = MACHINES.filter((m) => (a.stages as readonly string[]).includes(m.stage))
    const kw = ms.reduce((s, m) => s + machines[m.id].kw, 0)
    return { ...a, kw, count: ms.length }
  })
}

/* ----------------------------- 30-day history ----------------------------- */
export interface DayRecord {
  date: number
  kwh: number
  kg: number
  ukg: number
  cost: number
  solarKwh: number
}

export function history(now: number, days = 30): DayRecord[] {
  const mid = pkMidnight(now)
  const dayCost = DAY_CURVE.reduce((s, x) => s + x.cost, 0)
  const daySolar = DAY_CURVE.reduce((s, x) => s + x.solar * STEP, 0)
  return Array.from({ length: days }, (_, i) => {
    const date = mid - (days - i) * 86400000
    const r = hash(`day:${Math.round(date / 86400000)}`)
    const sun = 0.82 + 0.22 * hash(`sun:${Math.round(date / 86400000)}`)
    const kgDay = KG_PER_HOUR * PRODUCTION_HOURS * (0.95 + 0.08 * r)
    // Ring 34 drift grows over the last 10 days
    const drift = i >= days - 10 ? 1 + 0.0009 * (i - (days - 10)) : 1
    const kwh = DAY_KWH * (0.96 + 0.06 * r) * drift
    const solarKwh = daySolar * sun
    const cost = dayCost * (kwh / DAY_KWH) + (daySolar - solarKwh) * TARIFF.gridRs
    return { date, kwh, kg: kgDay, ukg: kwh / kgDay, cost, solarKwh }
  })
}
