// Machine downtime: when each production machine stopped, why, how long the
// job should take, and how much production it cost.
//
// How a stop is recorded in the real system:
//  • The machine's meter sees the stop: current drops to zero outside night
//    cleaning and doffing. Start and end times come from the meter.
//  • The reason comes from one of three places:
//      meter  – a supply dip at the same second (power dip), no one has to type
//      plan   – a planned service or count change already in the plan
//      staff  – faults (bearing, belt, gearbox…): the fitter or supervisor picks
//               the reason and the part changed on a tablet
//  • Expected time comes from the mill's normal time for that job.
//  • Production lost = the machine's share of the mill's output × time down.
import { MACHINES, hallById } from '../data/din'
import type { Machine } from '../data/din'
import { KG_PER_HOUR, pkMidnight } from './engine'
import { DEMO, DIP_CARDS, LIVE_STOPS, RELOAD_MIN } from './scenarios'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

/* ------------------------------ reasons ------------------------------ */
export type DtGroup = 'mechanical' | 'electrical' | 'power' | 'material' | 'planned'

export const GROUPS: Record<DtGroup, { label: string; hex: string; who: string }> = {
  mechanical: { label: 'Mechanical fault', hex: '#B83A2C', who: 'Entered by the fitter' },
  electrical: { label: 'Electrical fault', hex: '#8E5BB5', who: 'Entered by the electrician' },
  power: { label: 'Power dip', hex: '#3D7FC4', who: 'Found by the meter' },
  material: { label: 'Waiting for material', hex: '#E0A100', who: 'Entered by the supervisor' },
  planned: { label: 'Planned stop', hex: '#8FD3AE', who: 'From the plan' },
}
export const GROUP_ORDER: DtGroup[] = ['mechanical', 'electrical', 'power', 'material', 'planned']
export const NO_REASON_HEX = '#A3ADA7'

export interface Reason {
  id: string
  label: string
  group: DtGroup
  /** Normal time for this job, in minutes */
  expectedMin: number
  source: 'meter' | 'plan' | 'staff'
  /** Ask which part was changed */
  askPart?: boolean
}

export const REASONS: Reason[] = [
  { id: 'bearing', label: 'Bearing change', group: 'mechanical', expectedMin: 90, source: 'staff', askPart: true },
  { id: 'belt', label: 'Belt or tape change', group: 'mechanical', expectedMin: 45, source: 'staff', askPart: true },
  { id: 'roller', label: 'Roller or cot change', group: 'mechanical', expectedMin: 60, source: 'staff', askPart: true },
  { id: 'card-wire', label: 'Card wire or flats', group: 'mechanical', expectedMin: 240, source: 'staff', askPart: true },
  { id: 'gearbox', label: 'Gearbox repair', group: 'mechanical', expectedMin: 300, source: 'staff', askPart: true },
  { id: 'motor', label: 'Motor or drive fault', group: 'electrical', expectedMin: 120, source: 'staff', askPart: true },
  { id: 'sensor', label: 'Sensor or controls fault', group: 'electrical', expectedMin: 40, source: 'staff', askPart: true },
  { id: 'power-dip', label: 'Power dip', group: 'power', expectedMin: 20, source: 'meter' },
  { id: 'no-material', label: 'Waiting for material', group: 'material', expectedMin: 20, source: 'staff' },
  { id: 'count-change', label: 'Count change', group: 'planned', expectedMin: 60, source: 'plan' },
  { id: 'service', label: 'Planned service', group: 'planned', expectedMin: 120, source: 'plan' },
]
export const reasonById: Record<string, Reason> = Object.fromEntries(REASONS.map((r) => [r.id, r]))

/* ------------------------------ machines and output ------------------------------ */
const KINDS = ['ring-frame', 'open-end', 'card', 'draw-frame', 'comber', 'simplex', 'autoconer'] as const
type Kind = (typeof KINDS)[number]

export const SECTION: Record<Kind, string> = {
  'ring-frame': 'Ring spinning',
  'open-end': 'Open End',
  card: 'Carding',
  'draw-frame': 'Drawing',
  comber: 'Combing',
  simplex: 'Simplex',
  autoconer: 'Winding',
}

/** Production machines tracked for downtime (the mixing line is left out) */
export const DT_MACHINES = MACHINES.filter((m) => (KINDS as readonly string[]).includes(m.kind) && !m.id.startsWith('MX'))
const countOf = (k: Kind) => DT_MACHINES.filter((m) => m.kind === k).length
const num = (id: string) => Number(id.replace(/\D/g, ''))

// Ring frames make 88% of the yarn, Open End 12%. Finer counts make fewer kg
// per hour: 20s ≈ 30, 30s ≈ 25, 40s ≈ 15 kg/h before scaling to the mill total.
const ringRaw = (m: Machine) => (num(m.id) <= 24 ? 30 : num(m.id) <= 30 ? 15 : 25)
const RING_SCALE = (KG_PER_HOUR * 0.88) / DT_MACHINES.filter((m) => m.kind === 'ring-frame').reduce((s, m) => s + ringRaw(m), 0)

/** kg of yarn (or yarn-equivalent material) the machine makes in an hour */
export function kgPerHour(m: Machine): number {
  switch (m.kind as Kind) {
    case 'ring-frame':
      return ringRaw(m) * RING_SCALE
    case 'open-end':
      return (KG_PER_HOUR * 0.12) / countOf('open-end')
    case 'card':
      return KG_PER_HOUR / countOf('card')
    case 'draw-frame':
      return KG_PER_HOUR / countOf('draw-frame')
    case 'comber':
      return (KG_PER_HOUR * 0.63) / countOf('comber') // combed counts only
    case 'simplex':
      return (KG_PER_HOUR * 0.88) / countOf('simplex')
    case 'autoconer':
      return (KG_PER_HOUR * 0.88) / countOf('autoconer')
    default:
      return 0
  }
}
/**
 * Minutes of material in stock after each machine. Ring frames and Open End
 * lose yarn the moment they stop. Earlier machines have sliver, roving or cops
 * waiting, so a short stop costs no yarn; only the part beyond the stock does.
 */
export const BUFFER_MIN: Record<Kind, number> = {
  'ring-frame': 0,
  'open-end': 0,
  card: 60,
  'draw-frame': 45,
  comber: 60,
  simplex: 120,
  autoconer: 120,
}
export const bufferOf = (m: Machine) => BUFFER_MIN[m.kind as Kind] ?? 0

export const sectionOf = (m: Machine) => SECTION[m.kind as Kind] ?? m.kind

/** What the mill can make in 30 days if nothing stops (21 production hours a day) */
export const POSSIBLE_KG_MONTH = KG_PER_HOUR * 21 * 30

/* ------------------------------ raw stop history ------------------------------ */
interface RawStop {
  id: string
  machineId: string
  start: number
  /** End time; for a live stop, when it will end */
  end: number
  reasonId: string | null
  part?: string
  by?: string
}

// Stops per machine per month, and how often each reason comes up
const MIX: Record<Kind, { rate: number; reasons: [string, number][] }> = {
  'ring-frame': { rate: 2.2, reasons: [['roller', 0.3], ['belt', 0.3], ['bearing', 0.18], ['no-material', 0.12], ['sensor', 0.05], ['motor', 0.05]] },
  card: { rate: 1.0, reasons: [['card-wire', 0.12], ['belt', 0.25], ['bearing', 0.2], ['sensor', 0.25], ['motor', 0.18]] },
  'draw-frame': { rate: 1.0, reasons: [['roller', 0.45], ['belt', 0.3], ['sensor', 0.25]] },
  comber: { rate: 1.6, reasons: [['roller', 0.4], ['belt', 0.2], ['bearing', 0.2], ['sensor', 0.2]] },
  simplex: { rate: 1.2, reasons: [['roller', 0.3], ['belt', 0.3], ['bearing', 0.2], ['no-material', 0.2]] },
  autoconer: { rate: 1.6, reasons: [['sensor', 0.45], ['belt', 0.2], ['bearing', 0.15], ['no-material', 0.2]] },
  'open-end': { rate: 1.5, reasons: [['bearing', 0.4], ['motor', 0.2], ['belt', 0.2], ['sensor', 0.2]] },
}

/** How long a job really takes, as a multiple of its standard time */
function overrun(reasonId: string, r: number): number {
  if (reasonId === 'bearing') return 1.4 + 1.2 * r // spares fetched from the main store
  if (reasonId === 'no-material') return 0.8 + 1.6 * r
  if (reasonId === 'gearbox') return 1.0 + 0.8 * r
  if (reasonId === 'card-wire') return 0.9 + 0.6 * r
  if (reasonId === 'service') return 0.85 + 0.4 * r
  return 0.7 + 0.7 * r
}

function pick(list: [string, number][], r: number): string {
  let acc = 0
  for (const [id, w] of list) {
    acc += w
    if (r <= acc) return id
  }
  return list[list.length - 1][0]
}

/** Production start time on a day, avoiding night cleaning (01:00–04:00) */
const startAt = (dayStart: number, r: number) => {
  const h = 4.5 + r * 20.3
  return dayStart + (h >= 24 ? h - 24 : h) * HOUR
}

/** Days (0 = 29 days ago, 29 = today) when an LT#2 dip tripped Cards 05–07 */
export const DIP_DAYS = [1, 3, 6, 8, 11, 12, 15, 17, 19, 22, 24, 26, 28, 29]

const cache = new Map<number, RawStop[]>()

/** The past 30 days of stops, before anything that happens live today */
function history(mid: number): RawStop[] {
  const hit = cache.get(mid)
  if (hit) return hit
  const out: RawStop[] = []
  const dayStart = (d: number) => mid - (29 - d) * DAY

  for (let d = 0; d < 30; d++) {
    const ds = dayStart(d)
    for (const m of DT_MACHINES) {
      const mix = MIX[m.kind as Kind]
      const key = `${m.id}:${ds}`
      // Faults
      if (hash(`dt:${key}`) < mix.rate / 30) {
        const reasonId = pick(mix.reasons, hash(`rs:${key}`))
        const dur = reasonById[reasonId].expectedMin * overrun(reasonId, hash(`du:${key}`))
        const start = startAt(ds, hash(`st:${key}`))
        // About 1 in 14 fault stops has no reason entered
        const missing = hash(`ms:${key}`) < 0.07
        out.push({ id: `h-${key}`, machineId: m.id, start, end: start + dur * MIN, reasonId: missing ? null : reasonId })
      }
      // Planned services
      if (hash(`sv:${key}`) < 0.35 / 30) {
        const start = startAt(ds, hash(`svs:${key}`))
        const dur = 120 * overrun('service', hash(`svd:${key}`))
        out.push({ id: `s-${key}`, machineId: m.id, start, end: start + dur * MIN, reasonId: 'service' })
      }
    }
    // Count changes on ring frames, about one every 6 days
    if (d % 6 === 3) {
      const frames = DT_MACHINES.filter((m) => m.kind === 'ring-frame')
      const m = frames[Math.floor(hash(`cc:${d}`) * frames.length)]
      const start = startAt(ds, hash(`ccs:${d}`))
      out.push({ id: `c-${d}`, machineId: m.id, start, end: start + 60 * (0.9 + 0.6 * hash(`ccd:${d}`)) * MIN, reasonId: 'count-change' })
    }
    // Power dips that tripped Cards 05–07 (today's dip is live, below)
    if (DIP_DAYS.includes(d) && d < 29) {
      const start = ds + (6 + 14 * hash(`dip:${d}`)) * HOUR
      for (const id of DIP_CARDS) {
        const dur = RELOAD_MIN[id] + (hash(`dipd:${d}:${id}`) - 0.5) * 6
        out.push({ id: `p-${d}-${id}`, machineId: id, start, end: start + dur * MIN, reasonId: 'power-dip' })
      }
    }
  }

  // Three long jobs from this month that the team will remember
  const big: [string, number, string, number, string][] = [
    ['CB-05', 20, 'gearbox', 510, 'Detaching roller gearbox, bearing seized'],
    ['RF-07', 13, 'motor', 300, 'Main motor rewound'],
    ['OE-02', 25, 'bearing', 252, 'Rotor bearing, 2 units'],
  ]
  for (const [id, d, reasonId, mins, part] of big) {
    const start = dayStart(d) + 10.5 * HOUR
    out.push({ id: `b-${id}-${d}`, machineId: id, start, end: start + mins * MIN, reasonId, part, by: 'Maintenance' })
  }

  out.sort((a, b) => a.start - b.start)
  cache.set(mid, out)
  return out
}

/** Stops that are happening today in the demo: scripted live stops and the presenter's dip */
function liveRaw(now: number): RawStop[] {
  const out: RawStop[] = LIVE_STOPS.filter((s) => s.startedAt <= now).map((s) => ({
    id: s.id,
    machineId: s.machineId,
    start: s.startedAt,
    end: s.endsAt,
    reasonId: s.reasonId,
    part: s.part,
    by: s.by,
  }))
  if (DEMO.dipAt <= now) {
    for (const id of DIP_CARDS) {
      out.push({ id: `dip-${id}-${DEMO.dipAt}`, machineId: id, start: DEMO.dipAt, end: DEMO.dipAt + RELOAD_MIN[id] * MIN, reasonId: 'power-dip', by: 'Found by the meter' })
    }
  }
  return out
}

/* ------------------------------ stops, ready to show ------------------------------ */
export interface Stop {
  id: string
  machine: Machine
  start: number
  /** For a stop still going on: now */
  end: number
  ongoing: boolean
  reason: Reason | null
  part?: string
  by?: string
  minutes: number
  /** Minutes that actually cost production (beyond the material in stock) */
  lostMin: number
  expectedMin: number | null
  /** Minutes past the standard time (0 if within it) */
  overMin: number
  kg: number
}

/** Minutes over the normal time that still count as on time */
export const LATE_GRACE_MIN = 5

export type Entries = Record<string, { reasonId: string; part?: string; by?: string }>

const machineById = Object.fromEntries(MACHINES.map((m) => [m.id, m]))

function toStop(r: RawStop, now: number, entries: Entries): Stop {
  const e = entries[r.id]
  const reason = reasonById[e?.reasonId ?? r.reasonId ?? ''] ?? null
  const ongoing = now < r.end
  const end = ongoing ? now : r.end
  const minutes = (end - r.start) / MIN
  const m = machineById[r.machineId]
  const lostMin = Math.max(0, minutes - bufferOf(m))
  const kg = kgPerHour(m) * (lostMin / 60)
  const expectedMin = reason?.expectedMin ?? null
  return {
    id: r.id,
    machine: m,
    start: r.start,
    end,
    ongoing,
    reason,
    part: e?.part ?? r.part,
    by: e?.by ?? r.by,
    minutes,
    lostMin,
    expectedMin,
    // A few minutes over is still on time
    overMin: expectedMin != null && minutes - expectedMin > LATE_GRACE_MIN ? minutes - expectedMin : 0,
    kg,
  }
}

/** Every stop in the last 30 days, today included, up to now */
export function monthStops(now: number, entries: Entries = {}): Stop[] {
  const mid = pkMidnight(now)
  // History only holds stops that are over; anything going on now is a live stop
  const raw = [...history(mid).filter((r) => r.end <= now), ...liveRaw(now)]
  return raw.map((r) => toStop(r, now, entries))
}

/** Machines stopped right now */
export const stoppedNow = (stops: Stop[]) => stops.filter((s) => s.ongoing)
/** Stops that started today */
export const todayStops = (stops: Stop[], now: number) => stops.filter((s) => s.start >= pkMidnight(now))

/* ------------------------------ summaries ------------------------------ */
export const isPlanned = (s: Stop) => s.reason?.group === 'planned'
export const sum = (list: Stop[], f: (s: Stop) => number) => list.reduce((a, s) => a + f(s), 0)

export function totals(stops: Stop[]) {
  const unplanned = stops.filter((s) => !isPlanned(s))
  const planned = stops.filter(isPlanned)
  return {
    stops: unplanned.length,
    hours: sum(unplanned, (s) => s.minutes) / 60,
    kg: sum(unplanned, (s) => s.kg),
    overHours: sum(unplanned, (s) => s.overMin) / 60,
    overKg: sum(unplanned, (s) => (Math.min(s.overMin, s.lostMin) / 60) * kgPerHour(s.machine)),
    plannedStops: planned.length,
    plannedHours: sum(planned, (s) => s.minutes) / 60,
    plannedKg: sum(planned, (s) => s.kg),
    noReason: stops.filter((s) => !s.reason).length,
  }
}

/** kg lost per day for the last 30 days, split by reason group (plus "no reason") */
export function perDay(stops: Stop[], now: number) {
  const mid = pkMidnight(now)
  return Array.from({ length: 30 }, (_, i) => {
    const ds = mid - (29 - i) * DAY
    const day = stops.filter((s) => s.start >= ds && s.start < ds + DAY)
    const by = Object.fromEntries(GROUP_ORDER.map((g) => [g, sum(day.filter((s) => s.reason?.group === g), (s) => s.kg)])) as Record<DtGroup, number>
    return { t: ds, by, none: sum(day.filter((s) => !s.reason), (s) => s.kg) }
  })
}

/** Hours and kg by reason group */
export function byGroup(stops: Stop[]) {
  return GROUP_ORDER.map((g) => {
    const l = stops.filter((s) => s.reason?.group === g)
    return { group: g, stops: l.length, hours: sum(l, (s) => s.minutes) / 60, kg: sum(l, (s) => s.kg) }
  })
}

/** Average time taken vs the normal time, per reason (jobs done at least 3 times) */
export function byReason(stops: Stop[]) {
  return REASONS.map((r) => {
    const l = stops.filter((s) => s.reason?.id === r.id && !s.ongoing)
    return {
      reason: r,
      count: l.length,
      avgMin: l.length ? sum(l, (s) => s.minutes) / l.length : 0,
      hours: sum(l, (s) => s.minutes) / 60,
      overHours: sum(l, (s) => s.overMin) / 60,
      kg: sum(l, (s) => s.kg),
    }
  }).filter((x) => x.count >= 3)
}

/** Production lost by section */
export function bySection(stops: Stop[]) {
  const names = [...new Set(DT_MACHINES.map(sectionOf))]
  return names
    .map((name) => {
      const l = stops.filter((s) => sectionOf(s.machine) === name)
      return { name, stops: l.length, hours: sum(l, (s) => s.minutes) / 60, kg: sum(l, (s) => s.kg) }
    })
    .sort((a, b) => b.kg - a.kg)
}

/** Machines that lost the most production */
export function byMachine(stops: Stop[]) {
  const map = new Map<string, Stop[]>()
  for (const s of stops) map.set(s.machine.id, [...(map.get(s.machine.id) ?? []), s])
  return [...map.entries()]
    .map(([id, l]) => {
      const counts = new Map<string, number>()
      for (const s of l) counts.set(s.reason?.label ?? 'No reason', (counts.get(s.reason?.label ?? 'No reason') ?? 0) + s.minutes)
      const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      return { machine: machineById[id], stops: l.length, hours: sum(l, (s) => s.minutes) / 60, kg: sum(l, (s) => s.kg), main }
    })
    .sort((a, b) => b.kg - a.kg)
}

/* ------------------------------ formatting ------------------------------ */
export function dur(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}
export const where = (m: Machine) => `${sectionOf(m)} · ${hallById[m.hallId].name}`
export const groupHex = (s: Stop) => (s.reason ? GROUPS[s.reason.group].hex : NO_REASON_HEX)
