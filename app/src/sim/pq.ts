// Power quality & harmonics model for Spinning Unit DIL.
//
// Physics used (kept honest for Din's engineers):
//  • 6-pulse VFDs (diode front end) draw current in pulses → characteristic
//    harmonics h = 6k ± 1: 5th, 7th, 11th, 13th… 5th is negative sequence
//    (counter-torque, motor heating); 7th positive sequence.
//  • Triplen harmonics (3rd, 9th) come from single-phase electronic loads
//    (lighting drivers, SMPS, UPS, colony). They are zero sequence: they ADD in
//    the neutral and circulate in the transformer's delta winding.
//  • Capacitor bank + transformer form a parallel resonance at
//       h_r ≈ √( S_tr / (Z_tr × Q_switched) )
//    If h_r lands near 5th or 7th, that harmonic is amplified.
//  • Limits: IEEE 519-2022 for buses ≤ 1 kV: THDv ≤ 8 %, individual Vh ≤ 5 %.
//    Current limits for 20 < Isc/IL < 50: h<11 ≤ 7 %, 11–17 ≤ 3.5 %,
//    17–23 ≤ 2.5 %, 23–35 ≤ 1 %, TDD ≤ 8 %. (IEEE 519 is defined at the
//    utility connection; we use it at each LT bus as an internal benchmark.)
//    Capacitors: IEC 60831 allows up to 1.3 × rated current.
import { FEEDERS, MACHINES, PF_PANELS, TRANSFORMERS, feederById } from '../data/din'
import type { BusId, Machine } from '../data/din'
import { TOTAL_SOLAR_KWP } from '../data/din'
import { isCleaning } from '../lib/time'
import { solarAt } from './engine'

/** Orders shown in charts (odd only: even harmonics are negligible here) */
export const ORDERS = [3, 5, 7, 9, 11, 13, 15, 17, 19, 23, 25] as const

export const LIMITS = {
  thdv: 8,
  vh: 5,
  tdd: 8,
  capCurrent: 130, // % of rated, IEC 60831
}
export function currentLimit(h: number): number {
  if (h % 2 === 0) return h < 11 ? 1.75 : 0.875 // even harmonics: 25 % of odd limit
  if (h < 11) return 7
  if (h < 17) return 3.5
  if (h < 23) return 2.5
  if (h < 35) return 1
  return 0.5
}

/* -------------------------- load classification -------------------------- */
export type LoadType = 'vfd' | 'single-phase' | 'linear'
export const LOAD_TYPE: Record<LoadType, { label: string; makes: string; note: string }> = {
  vfd: {
    label: '3-phase drives (VFDs)',
    makes: '5th, 7th, 11th, 13th',
    note: 'Rectifier front end draws current in pulses. Main source of harmonics in the mill.',
  },
  'single-phase': {
    label: 'Single-phase electronics',
    makes: '3rd, 9th (triplen)',
    note: 'Lighting drivers, computers, UPS, colony. Triplens add up in the neutral wire.',
  },
  linear: {
    label: 'Direct motors (DOL / star-delta)',
    makes: 'almost none',
    note: 'Draw clean current, but they suffer from harmonics: extra heating and vibration.',
  },
}

const SINGLE_PHASE_KINDS = ['lighting', 'colony', 'lab-ro', 'godown', 'workshop', 'uv-inspection', 'packing-line', 'contamination-sorter']

export function loadType(m: Machine): LoadType {
  if (m.drive === 'VFD') return 'vfd'
  if (SINGLE_PHASE_KINDS.includes(m.kind)) return 'single-phase'
  return 'linear'
}

export function busLoadMix(bus: BusId) {
  const ms = MACHINES.filter((m) => feederById[m.feederId].bus === bus)
  const total = ms.reduce((s, m) => s + m.ratedKw, 0)
  const by = (t: LoadType) => ms.filter((m) => loadType(m) === t).reduce((s, m) => s + m.ratedKw, 0)
  return { total, vfd: by('vfd'), single: by('single-phase'), linear: by('linear') }
}

/** Non-linear load register grouped the way an engineer thinks about it */
export function nonLinearRegister() {
  const groups: { name: string; type: LoadType; count: number; kw: number; buses: Set<string>; detail: string }[] = []
  const add = (name: string, type: LoadType, pred: (m: Machine) => boolean, detail: string) => {
    const ms = MACHINES.filter(pred)
    groups.push({ name, type, count: ms.length, kw: ms.reduce((s, m) => s + m.ratedKw, 0), buses: new Set(ms.map((m) => feederById[m.feederId].bus)), detail })
  }
  add('Ring frames + sample frame', 'vfd', (m) => m.kind === 'ring-frame' || m.kind === 'sample-frame', 'Largest VFD load in the mill')
  add('Cards', 'vfd', (m) => m.kind === 'card', 'Most sensitive to dips and distortion: these are the drives that trip')
  add('Open End', 'vfd', (m) => m.kind === 'open-end', 'Large rotor drives, 140 kW each')
  add('Autoconers & link coner', 'vfd', (m) => m.kind === 'autoconer' || m.kind === 'link-coner', 'Drum drives plus electronic yarn clearers')
  add('Draw frames & combers', 'vfd', (m) => m.kind === 'draw-frame' || m.kind === 'comber', 'Small drives, many of them')
  add('Blow room B60 / B70', 'vfd', (m) => m.id === 'BR-L1-B60' || m.id === 'BR-L1-B70', 'The only inverter-driven blow room machines (as told on the visit)')
  add('New AC fans & card filter', 'vfd', (m) => m.drive === 'VFD' && (m.stage === 'humidification'), 'Inverter fans on the 2009 plants')
  add('New simplex', 'vfd', (m) => m.drive === 'VFD' && m.kind === 'simplex', '2009 roving frame')
  add('Mill lighting', 'single-phase', (m) => m.kind === 'lighting', 'Electronic ballasts / LED drivers: main 3rd-harmonic source')
  add('Colony, lab, godown, packing, UV, sorter', 'single-phase', (m) => loadType(m) === 'single-phase' && m.kind !== 'lighting', 'Computers, UPS, inverter ACs, chargers, electronic controls')
  add('Compressors', 'linear', (m) => m.kind === 'compressor', 'Star-delta motors')
  add('Older AC plants, blow room motors, waste plant', 'linear', (m) => loadType(m) === 'linear' && m.kind !== 'compressor', 'Direct-on-line motors')
  return groups
}

/* ------------------------------ bus spectra ------------------------------ */
type Spectrum = Partial<Record<number, number>>

export interface BusPQ {
  bus: BusId
  /** Current harmonics, % of fundamental at full load (≈ TDD basis) */
  current: Spectrum
  /** Voltage harmonics, % of nominal */
  voltage: Spectrum
  neutralPct: number
  capCurrentPct: number
  stepsIn: number
  stepsFailed: number
  kFactor: number
  pf: number
  dpf: number
}

export const BUS_PQ: Record<BusId, BusPQ> = {
  LT1: {
    bus: 'LT1',
    current: { 2: 0.3, 3: 3.4, 4: 0.2, 5: 5.4, 7: 3.2, 9: 1.3, 11: 2.2, 13: 1.5, 15: 0.5, 17: 0.9, 19: 0.7, 23: 0.4, 25: 0.3 },
    voltage: { 3: 1.4, 5: 3.0, 7: 2.3, 9: 0.4, 11: 1.3, 13: 1.0, 17: 0.5, 19: 0.4, 23: 0.3, 25: 0.2 },
    neutralPct: 46,
    capCurrentPct: 112,
    stepsIn: 6,
    stepsFailed: 0,
    kFactor: 3.1,
    pf: 0.93,
    dpf: 0.96,
  },
  LT2: {
    bus: 'LT2',
    current: { 2: 0.4, 3: 1.7, 4: 0.3, 5: 10.2, 7: 6.9, 9: 0.5, 11: 3.1, 13: 2.2, 15: 0.3, 17: 1.1, 19: 0.9, 23: 0.5, 25: 0.4 },
    voltage: { 3: 0.6, 5: 4.4, 7: 4.9, 9: 0.2, 11: 1.6, 13: 1.2, 17: 0.6, 19: 0.5, 23: 0.3, 25: 0.2 },
    neutralPct: 14,
    capCurrentPct: 134,
    stepsIn: 8,
    stepsFailed: 2,
    kFactor: 4.2,
    pf: 0.9,
    dpf: 0.97,
  },
  LT34: {
    bus: 'LT34',
    current: { 2: 0.2, 3: 1.3, 4: 0.1, 5: 5.1, 7: 2.9, 9: 0.3, 11: 1.7, 13: 1.1, 15: 0.2, 17: 0.6, 19: 0.4, 23: 0.3, 25: 0.2 },
    voltage: { 3: 0.5, 5: 2.2, 7: 1.8, 9: 0.1, 11: 0.9, 13: 0.7, 17: 0.3, 19: 0.3, 23: 0.2, 25: 0.1 },
    neutralPct: 11,
    capCurrentPct: 104,
    stepsIn: 6,
    stepsFailed: 0,
    kFactor: 2.3,
    pf: 0.95,
    dpf: 0.97,
  },
}

export const rss = (s: Spectrum) => Math.sqrt(Object.values(s).reduce<number>((a, v) => a + (v ?? 0) ** 2, 0))
export const thdv = (b: BusPQ) => rss(b.voltage)
export const tdd = (b: BusPQ) => rss(b.current)

/* ------------------------------- resonance ------------------------------- */
export function resonanceOrder(bus: BusId, stepsIn: number): number {
  const tr = TRANSFORMERS.find((t) => t.bus === bus)!
  const pf = PF_PANELS.find((p) => p.bus === bus)!
  const q = (pf.kvar / pf.steps) * stepsIn
  if (q <= 0) return Infinity
  return Math.sqrt(tr.kva / ((tr.impedancePct / 100) * q))
}

/** How much a harmonic of order h is amplified when resonance sits at hr */
export function amplification(h: number, hr: number): number {
  return 1 + 1.6 * Math.exp(-((h - hr) ** 2) / 0.35)
}

/* ------------------------------ status logic ------------------------------ */
export type Level = 'ok' | 'watch' | 'act'
export function levelFor(value: number, limit: number, watchAt = 0.75): Level {
  if (value > limit) return 'act'
  if (value > limit * watchAt) return 'watch'
  return 'ok'
}

export function busStatus(b: BusPQ): Level {
  const levels: Level[] = [
    levelFor(thdv(b), LIMITS.thdv),
    levelFor(tdd(b), LIMITS.tdd),
    levelFor(b.capCurrentPct, LIMITS.capCurrent, 0.88),
    b.stepsFailed > 0 ? 'act' : 'ok',
  ]
  return levels.includes('act') ? 'act' : levels.includes('watch') ? 'watch' : 'ok'
}

/* ------------------------------ 24 h THDv ------------------------------ */
/**
 * THDv through the day. Drives set the base level; during the day solar
 * supplies kW but not kVAR, so the PF controller switches in more capacitor
 * steps, which moves resonance onto the 7th and amplifies it.
 */
export function thdvDay(bus: BusId): { hour: number; thdv: number; steps: number; hr: number }[] {
  const b = BUS_PQ[bus]
  const pf = PF_PANELS.find((p) => p.bus === bus)!
  const v = b.voltage
  return Array.from({ length: 96 }, (_, i) => {
    const hour = i * 0.25
    const sun = solarAt(hour + 0.125) / (TOTAL_SOLAR_KWP * 0.66)
    const cleaning = isCleaning(Math.floor(hour))
    // Base spectrum = midday (most steps in). Fewer steps at night.
    const steps = Math.max(1, Math.min(pf.steps - b.stepsFailed, Math.round(b.stepsIn - 2 + 2 * sun)))
    const hr = resonanceOrder(bus, steps)
    const hrBase = resonanceOrder(bus, b.stepsIn)
    const drive = cleaning ? 0.3 : 1 + 0.03 * Math.sin(hour * 2.3)
    const triplen = bus === 'LT1' ? (hour > 18 || hour < 6.5 ? 1.25 : 0.85) : 1 // lights at night
    const parts = {
      3: (v[3] ?? 0) * triplen,
      5: (v[5] ?? 0) * drive * (amplification(5, hr) / amplification(5, hrBase)),
      7: (v[7] ?? 0) * drive * (amplification(7, hr) / amplification(7, hrBase)),
      11: (v[11] ?? 0) * drive,
      13: (v[13] ?? 0) * drive,
      rest: Math.sqrt((v[17] ?? 0) ** 2 + (v[19] ?? 0) ** 2 + (v[23] ?? 0) ** 2 + (v[25] ?? 0) ** 2 + (v[9] ?? 0) ** 2) * drive,
    }
    const total = Math.sqrt(Object.values(parts).reduce((a, x) => a + x * x, 0))
    return { hour, thdv: +total.toFixed(2), steps, hr }
  })
}

/* ------------------------------ waveform ------------------------------ */
/** One 50 Hz cycle (20 ms) built from the spectrum. 6-pulse phase pattern. */
export function waveform(s: Spectrum, n = 200) {
  const phase: Record<number, number> = { 3: 0, 5: Math.PI, 7: 0, 9: 0, 11: Math.PI, 13: 0, 17: Math.PI, 19: 0, 23: Math.PI, 25: 0 }
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * 2 * Math.PI
    let y = Math.sin(t)
    for (const [h, pct] of Object.entries(s)) {
      const hh = Number(h)
      if (hh % 2 === 0 || !pct) continue
      y += (pct / 100) * Math.sin(hh * t + (phase[hh] ?? 0))
    }
    return { ms: +((i / n) * 20).toFixed(2), y: +y.toFixed(4), ideal: +Math.sin(t).toFixed(4) }
  })
}

/** 6-pulse drive input current without a choke: typical published shape */
export const VFD_INPUT: Spectrum = { 5: 38, 7: 19, 11: 8, 13: 5, 17: 3, 19: 2, 23: 1.4, 25: 1 }
export const VFD_INPUT_CHOKE: Spectrum = { 5: 30, 7: 12, 11: 6, 13: 4, 17: 2.5, 19: 1.6, 23: 1, 25: 0.8 }

/* ------------------------------ feeders ------------------------------ */
export interface FeederPQ {
  id: string
  name: string
  bus: BusId
  thdi: number
  dominant: number
  neutralPct?: number
  note: string
}

export const FEEDER_PQ: FeederPQ[] = [
  { id: 'LT2-F10', name: 'Card (4 to 09)', bus: 'LT2', thdi: 43, dominant: 5, note: 'Card drives, no DC choke fitted (to verify)' },
  { id: 'LT2-F04', name: 'Card (27 to 30)', bus: 'LT2', thdi: 39, dominant: 5, note: 'Card drives' },
  { id: 'LT2-F11', name: 'Card (1 to 3) + (2) Drawing + (1) Simplex', bus: 'LT2', thdi: 37, dominant: 5, note: 'Card + draw frame drives' },
  { id: 'LT1-F08', name: 'Card (10 to 15)', bus: 'LT1', thdi: 36, dominant: 5, note: 'Card drives' },
  { id: 'LT1-F01', name: 'Open End Machine', bus: 'LT1', thdi: 34, dominant: 5, note: '2 × 140 kW rotor drives' },
  { id: 'LT2-F13', name: 'Blow Room', bus: 'LT2', thdi: 31, dominant: 5, note: 'B60 + B70 inverters on a mostly DOL feeder' },
  { id: 'LT2-F14', name: 'Auto Cone (1 to 6)', bus: 'LT2', thdi: 29, dominant: 5, note: 'Drum drives + clearers' },
  { id: 'LT1-F09', name: 'Mills Light', bus: 'LT1', thdi: 27, dominant: 3, neutralPct: 68, note: 'Neutral current 68 % of phase current' },
  { id: 'LT2-F06', name: 'Ring (9 to 12)', bus: 'LT2', thdi: 24, dominant: 5, note: 'Ring main drives' },
  { id: 'LT34-F11', name: 'Ring (36 to 39)', bus: 'LT34', thdi: 22, dominant: 5, note: 'Ring main drives' },
  { id: 'LT34-F04', name: 'Compressor 160kW', bus: 'LT34', thdi: 4, dominant: 5, note: 'Star-delta motor: linear load' },
]

export function feederSldName(id: string) {
  return FEEDERS.find((f) => f.id === id)?.sldName ?? id
}

/* ------------------------------ events ------------------------------ */
export const PQ_EVENTS = [
  { when: 'Today', what: 'Voltage dip on LT#2: 80 ms, down to 0 V during line changeover', effect: 'Cards 05, 06, 07 tripped', level: 'act' as Level },
  { when: '2 days ago', what: 'THDv on LT#2 reached 7.4 % at 12:40 (8 capacitor steps in)', effect: 'No trip. Close to the 8 % limit', level: 'watch' as Level },
  { when: '6 days ago', what: 'PF.2 capacitor step 3: fuse blown', effect: 'Step out of service', level: 'act' as Level },
  { when: '9 days ago', what: 'Voltage dip on LT#2: 60 ms, 35 % depth', effect: 'Cards 05, 06, 07 tripped', level: 'act' as Level },
  { when: '17 days ago', what: 'PF.2 capacitor step 7: fuse blown', effect: 'Step out of service', level: 'act' as Level },
  { when: '21 days ago', what: 'Neutral current on Mills Light feeder 72 % of phase', effect: 'No trip. Cable temperature not measured', level: 'watch' as Level },
]
