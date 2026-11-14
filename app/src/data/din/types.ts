// Domain model for the Din Industries — Spinning Unit DIL digital twin.
// Every asset in the POC is described here once; all screens read from it.

export type BusId = 'LT1' | 'LT2' | 'LT34'

export type ProcessStage =
  | 'blowroom'
  | 'carding'
  | 'drawing'
  | 'combing'
  | 'simplex'
  | 'ring'
  | 'openend'
  | 'winding'
  | 'inspection'
  | 'packing'
  | 'humidification'
  | 'compressed-air'
  | 'utility'
  | 'lighting'
  | 'non-production'

export type MachineKind =
  | 'auto-plucker'
  | 'mixer'
  | 'cleaner'
  | 'contamination-sorter'
  | 'condenser'
  | 'card'
  | 'draw-frame'
  | 'comber'
  | 'simplex'
  | 'ring-frame'
  | 'sample-frame'
  | 'open-end'
  | 'autoconer'
  | 'link-coner'
  | 'uv-inspection'
  | 'packing-line'
  | 'ac-plant'
  | 'filter-plant'
  | 'compressor'
  | 'waste-plant'
  | 'baling-press'
  | 'turbine'
  | 'lab-ro'
  | 'exhaust'
  | 'lighting'
  | 'colony'
  | 'workshop'
  | 'godown'

/** What physically measures this asset once Enervtek is installed. */
export type MeteringTier =
  | 'pq' // Class-A style power-quality analyser: harmonics, waveforms, events
  | 'machine' // Dedicated 3-phase energy meter on the machine
  | 'feeder' // Feeder meter at the LT panel; machine values are apportioned
  | 'derived' // Calculated from other measurements

export interface Hall {
  id: string
  name: string
  short: string
  description: string
}

export interface Zone {
  id: string
  hallId: string
  name: string
  stage: ProcessStage
}

export interface Feeder {
  id: string
  bus: BusId
  /** Name exactly as written on Din's SLD for Spinning Unit DIL */
  sldName: string
  breakerA: number
  /** Breaker type written / implied on the SLD */
  breaker: 'MCCB' | 'ACB'
  stage: ProcessStage
  /** Meter installed by Enervtek on this feeder */
  metering: Exclude<MeteringTier, 'machine' | 'derived'>
  meterId: string
  /** VFD-heavy feeders get a power-quality analyser */
  vfdLoad?: boolean
  note?: string
}

export interface Machine {
  id: string
  name: string
  kind: MachineKind
  stage: ProcessStage
  hallId: string
  zoneId: string
  feederId: string
  ratedKw: number
  /** Typical running load as fraction of rated */
  typicalLoad: number
  modelYear: number
  metering: MeteringTier
  meterId?: string
  drive: 'VFD' | 'DOL' | 'Star-Delta' | 'Soft-starter' | 'Mixed'
  spindles?: number
  rotors?: number
  drums?: number
  /** Short spec line shown in tables */
  spec?: string
  note?: string
}

export interface Transformer {
  id: string
  name: string
  kva: number
  ratio: string
  vcbA: number
  bus: BusId
  incomerAcbA: number
  controller: string
  impedancePct: number
}

export interface PfPanel {
  id: string
  name: string
  kvar: number
  bus: BusId
  steps: number
  detuned: boolean
}

export interface SolarArray {
  id: string
  name: string
  kwp: number
  inverter: string
  inverterKw: number
  bus: BusId
  mccb: string
  acbA: number
}

export interface Genset {
  id: string
  name: string
  controller: string
  acbA: number
  kw: number
  fuel: string
}

export interface LtBus {
  id: BusId
  name: string
  sldLabel: string
  designKw: number
  transformerId: string
  pfPanelId: string
  solarId: string
  color: string
}
