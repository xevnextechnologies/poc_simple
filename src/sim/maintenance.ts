// Preventive maintenance tracking.
// Din already services machines on a schedule. Enervtek counts the real
// running hours of every machine from its meter, so each job falls due on
// actual use (not the calendar), adds condition-based alerts from Machine
// health, and checks power use after every job.
import { MACHINES, hallById, machineById } from '../data/din'
import type { Machine, MachineKind } from '../data/din'
import { pkMidnight } from './engine'
import { HEALTH, INDICATORS } from './health'

interface Plan {
  task: string
  every: number // run hours between services
  perDay: number // typical run hours per day
  team: string
}

const P = (task: string, every: number, perDay: number, team: string): Plan => ({ task, every, perDay, team })

const PLAN: Partial<Record<MachineKind, Plan>> = {
  'ring-frame': P('Spindles, tapes, rollers and travellers', 2000, 21, 'Ring maintenance'),
  'sample-frame': P('Spindles, tapes, rollers and travellers', 2000, 14, 'Ring maintenance'),
  card: P('Wire grinding and flat setting', 900, 21, 'Carding fitters'),
  'draw-frame': P('Roller cleaning and setting', 1500, 21, 'Preparatory fitters'),
  comber: P('Comb cleaning and setting', 1200, 21, 'Preparatory fitters'),
  simplex: P('Flyers, spindles and aprons', 2000, 21, 'Preparatory fitters'),
  'open-end': P('Rotors and opening rollers', 1500, 21, 'Open End fitters'),
  autoconer: P('Splicers and drums', 1200, 21, 'Winding fitters'),
  'link-coner': P('Splicers and drums', 1200, 21, 'Winding fitters'),
  'auto-plucker': P('Beaters, belts and bearings', 1500, 21, 'Blow room electrician'),
  mixer: P('Beaters, belts and bearings', 1500, 21, 'Blow room electrician'),
  cleaner: P('Beaters, belts and bearings', 1500, 21, 'Blow room electrician'),
  condenser: P('Fan, belts and bearings', 1500, 21, 'Blow room electrician'),
  'contamination-sorter': P('Cameras, valves and lamps', 1500, 21, 'Blow room electrician'),
  compressor: P('Oil, filters and separator', 4000, 24, 'Utilities in-charge'),
  'ac-plant': P('Washers, nozzles and fan belts', 720, 24, 'Utilities in-charge'),
  'filter-plant': P('Filter drums and fan belts', 720, 24, 'Utilities in-charge'),
  'waste-plant': P('Beaters and conveyors', 1500, 18, 'Utilities in-charge'),
  'baling-press': P('Hydraulics and seals', 1500, 12, 'Utilities in-charge'),
  'uv-inspection': P('Conveyor and UV lamps', 2000, 21, 'Packing supervisor'),
  'packing-line': P('Conveyor and weighing scale', 2000, 21, 'Packing supervisor'),
  turbine: P('Pumps and bearings', 2000, 24, 'Power house'),
  'lab-ro': P('R.O. membranes and pumps', 1500, 24, 'Lab in-charge'),
  exhaust: P('Fan bearings and belts', 2000, 24, 'Electrical in-charge'),
  workshop: P('Machine tools and safety check', 2000, 10, 'Workshop'),
}

const DAY = 86_400_000
const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

export type MaintStatus = 'overdue' | 'soon' | 'ok' | 'done'

export interface MaintRecord {
  id: string
  m: Machine
  task: string
  team: string
  every: number
  hoursSince: number
  /** Share of the service interval already used (1 = due) */
  used: number
  lastDone: number
  dueAt: number
  dueInDays: number
  status: MaintStatus
  /** Machine health suggests doing it earlier than the schedule */
  bringForward?: string
}

/** Health signs (other than service hours and supply trips) that justify servicing early */
function healthReason(id: string): string | undefined {
  const h = HEALTH[id]
  if (!h) return undefined
  const bad = INDICATORS.filter((i) => !['service', 'trips'].includes(i.key) && h.levels[i.key] && h.levels[i.key] !== 'ok')
  return bad.length ? h.headline : undefined
}

export const MAINT_MACHINES = MACHINES.filter((m) => PLAN[m.kind])

export function maintFor(id: string, done: Record<string, number> = {}, now = Date.now()): MaintRecord {
  const m = machineById[id]
  const p = PLAN[m.kind]!
  const today = pkMidnight(now)
  const doneAt = done[id]
  const used = doneAt ? 0.002 : (HEALTH[id]?.values.service ?? 50) / 100
  const hoursSince = used * p.every
  const lastDone = doneAt ?? today - (hoursSince / p.perDay) * DAY
  const dueInDays = ((p.every - hoursSince) / p.perDay)
  const status: MaintStatus = doneAt ? 'done' : used >= 1 ? 'overdue' : dueInDays <= 7 ? 'soon' : 'ok'
  return {
    id,
    m,
    task: p.task,
    team: p.team,
    every: p.every,
    hoursSince,
    used,
    lastDone,
    dueAt: today + dueInDays * DAY,
    dueInDays,
    status,
    bringForward: doneAt ? undefined : healthReason(id),
  }
}

export function allMaint(done: Record<string, number> = {}, now = Date.now()) {
  return MAINT_MACHINES.map((m) => maintFor(m.id, done, now))
}

/* ------------------------------ history: jobs done recently ------------------------------ */
export interface DoneJob {
  id: string
  name: string
  hall: string
  task: string
  team: string
  at: number
  hours: number
  /** Power use change after the job, same production (negative = less power) */
  powerChange: number
}

export function recentJobs(done: Record<string, number> = {}, now = Date.now()): DoneJob[] {
  const list = allMaint(done, now)
    .filter((r) => now - r.lastDone <= 14 * DAY)
    .map((r) => ({
      id: r.id,
      name: r.m.name,
      hall: hallById[r.m.hallId].name,
      task: r.task,
      team: r.team,
      at: r.lastDone,
      hours: 2 + Math.round(hash(`h:${r.id}`) * 5),
      powerChange: done[r.id] ? NaN : -(0.4 + hash(`p:${r.id}`) * 3.2),
    }))
  return list.sort((a, b) => b.at - a.at)
}

export const MAINT_HEX: Record<MaintStatus, string> = {
  overdue: '#B83A2C',
  soon: '#E0A100',
  ok: '#4FA67D',
  done: '#3D7FC4',
}
export const MAINT_WORD: Record<MaintStatus, string> = {
  overdue: 'Overdue',
  soon: 'Due this week',
  ok: 'On schedule',
  done: 'Done today',
}
