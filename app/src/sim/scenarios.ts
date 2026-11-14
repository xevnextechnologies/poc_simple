// Machine behaviour for the demo stories. Every story maps to a problem
// Din's team told us about during the site visit.
import { isCleaning } from '../lib/time'
import type { Status } from './engine'

type Override = (hour: number, t?: number) => { status?: Status; factor?: number; kw?: number; note?: string } | null

const MIN = 60_000

/**
 * Demo state the presenter can change during the meeting.
 * By default the power dip happened a few minutes before the app was opened;
 * the presenter can fire it again "now" (Shift + D).
 */
export const DEMO = {
  dipAt: Date.now() - 6 * MIN,
}

/** Sliver reload time after a trip, per card */
export const RELOAD_MIN: Record<string, number> = { 'CD-05': 17, 'CD-06': 26, 'CD-07': 20 }
export const DIP_CARDS = Object.keys(RELOAD_MIN)

const cardTrip =
  (id: string): Override =>
  (_h, t) => {
    if (t == null) return null
    const back = DEMO.dipAt + RELOAD_MIN[id] * MIN
    if (t >= DEMO.dipAt && t < back) {
      const left = Math.ceil((back - t) / MIN)
      return { status: 'stopped', kw: 0, note: `Tripped after a power dip on LT#2. Sliver being reloaded, back in about ${left} min.` }
    }
    return null
  }

/* ------------------------------ live stops (downtime) ------------------------------ */
/** When the app was opened: live stops are placed relative to this */
const T0 = Date.now()

export interface LiveStop {
  id: string
  machineId: string
  startedAt: number
  endsAt: number
  /** Reason already entered (null: staff still has to enter it) */
  reasonId: string | null
  part?: string
  by?: string
}

/** Machines that are stopped when the demo opens. The meter sees the stop; the reason comes from staff. */
export const LIVE_STOPS: LiveStop[] = [
  { id: 'live-RF-12', machineId: 'RF-12', startedAt: T0 - 112 * MIN, endsAt: T0 + 150 * MIN, reasonId: 'bearing', part: 'Spindle bearings ×6, section 3', by: 'Akram, ring fitter' },
  { id: 'live-CB-03', machineId: 'CB-03', startedAt: T0 - 190 * MIN, endsAt: T0 + 130 * MIN, reasonId: 'gearbox', part: 'Detaching roller gearbox', by: 'Naveed, comber fitter' },
  { id: 'live-CD-21', machineId: 'CD-21', startedAt: T0 - 34 * MIN, endsAt: T0 + 240 * MIN, reasonId: null },
  { id: 'live-SX-03', machineId: 'SX-03', startedAt: T0 - 40 * MIN, endsAt: T0 + 30 * MIN, reasonId: 'count-change', by: 'Production office' },
  { id: 'live-AW-04', machineId: 'AW-04', startedAt: T0 - 12 * MIN, endsAt: T0 + 40 * MIN, reasonId: 'no-material', part: 'No cops from Ring Frames 9–12', by: 'Shift supervisor' },
]

/** Reasons entered by staff during the demo (kept in sync by the store) */
export const DT_ENTRIES: Record<string, { reasonId: string; part?: string; by?: string; at: number }> = {}

const liveStop =
  (s: LiveStop): Override =>
  (_h, t) => {
    if (t == null || t < s.startedAt || t >= s.endsAt) return null
    const mins = Math.round((t - s.startedAt) / MIN)
    const reason = DT_ENTRIES[s.id]?.reasonId ?? s.reasonId
    return {
      status: 'stopped',
      kw: 0,
      note: reason ? `Stopped for ${mins} min. Reason entered: ${REASON_LABEL[reason] ?? reason}.` : `Stopped for ${mins} min. No reason entered yet.`,
    }
  }

/** Short labels for map notes (the full reason list lives in downtime.ts) */
export const REASON_LABEL: Record<string, string> = {
  'power-dip': 'power dip',
  bearing: 'bearing change',
  belt: 'belt or tape change',
  roller: 'roller or cot change',
  'card-wire': 'card wire or flats',
  gearbox: 'gearbox repair',
  motor: 'motor or drive fault',
  sensor: 'sensor or controls fault',
  'no-material': 'waiting for material',
  'count-change': 'count change',
  service: 'planned service',
}

export const OVERRIDES: Record<string, Override> = {
  ...Object.fromEntries(LIVE_STOPS.map((s) => [s.machineId, liveStop(s)])),
  'CD-05': cardTrip('CD-05'),
  'CD-06': cardTrip('CD-06'),
  'CD-07': cardTrip('CD-07'),

  'RF-34': (h) =>
    isCleaning(Math.floor(h))
      ? null
      : { status: 'attention', factor: 1.105, note: 'Using 10.5% more power than Ring Frames 32–39 on the same count.' },

  'CP-02': (h) =>
    isCleaning(Math.floor(h))
      ? { status: 'attention', factor: 0.62, note: 'Running during night cleaning while all autocones are stopped.' }
      : { status: 'attention', note: 'Keeps running during night cleaning while autocones are stopped.' },

  'BR-L1-CN': () => ({
    status: 'attention',
    factor: 1.04,
    note: 'Current is uneven across the three phases (9%) and rising. Early sign of motor trouble.',
  }),

  // Same machines the Machine health and performance pages flag as "watch"
  'CD-17': (h) => (isCleaning(Math.floor(h)) ? null : { status: 'attention', factor: 1.062, note: 'Uses 6% more power than the other cards for the same sliver.' }),
  'AW-09': (h) => (isCleaning(Math.floor(h)) ? null : { status: 'attention', factor: 1.054, note: 'Uses 5% more power than the other autoconers.' }),
  'OE-01': (h) => (isCleaning(Math.floor(h)) ? null : { status: 'attention', note: 'Drive input harmonics rising: 41% → 52% in 6 weeks.' }),
}
