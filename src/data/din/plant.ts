// Site-level electrical infrastructure, taken from:
//  - "Single Line Diagram Din Industries LTD. Power Plant" (wall SLD)
//  - "SLD For Spinning Unit DIL" (feeder sheet)
//  - Tour notes (sanctioned load, solar share, operating pattern)
import type { Genset, LtBus, PfPanel, SolarArray, Transformer } from './types'

export const SITE = {
  company: 'Din Industries Ltd.',
  group: 'Din Group',
  unit: 'Spinning Unit DIL',
  location: 'Multan Road, Pattoki',
  timezone: 'Asia/Karachi',
  tzLabel: 'PKT',
  spindles: 40128,
  ringFrames: 38,
  products: 'Ring & OE yarn · 15s–100s Ne · Carded / Combed · Cotton, PC, CVC, Viscose, Melange',
  operating: '24 × 7 × 365 · 21 h production + 3 h night cleaning',
  utility: 'LESCO',
  tariff: 'B-3 Industrial (11 kV)',
  /** Grid supply / sanctioned load. Notes say 4,900 kW supply; sanctioned 4–4.4 MW to confirm with the LESCO bill */
  sanctionedKw: 4900,
  gridSupplyKw: 4900,
  supplyVoltage: '11 kV',
  lvVoltage: '410 V / 50 Hz',
  solarSharePct: 20,
  /** Units (kWh) per kg — the mill's own KPI, from the tour */
  ukgBaseline: 4.36,
  machineryVintage: 'Mostly 2005, latest 2009',
  sldApprovedBy: 'Ahmad Nadeem Siddique',
} as const

export const GRID_INTAKE = {
  id: 'GRID',
  name: 'WAPDA / LESCO 11 kV Incoming',
  meteringCubicle: 'VCB 630A — Metering cubicle',
  protectionCubicle: 'VCB 630A — Protection cubicle',
  meterId: 'PQ-11K-01',
}

export const TRANSFORMERS: Transformer[] = [
  { id: 'TR1', name: 'Transformer T-1', kva: 2500, ratio: '11 kV / 410 V', vcbA: 630, bus: 'LT1', incomerAcbA: 4000, controller: 'DEIF AGC-246', impedancePct: 6.0 },
  { id: 'TR2', name: 'Transformer T-2', kva: 2500, ratio: '11 kV / 410 V', vcbA: 630, bus: 'LT2', incomerAcbA: 4000, controller: 'DEIF AGC-246', impedancePct: 6.0 },
  { id: 'TR3', name: 'Transformer T-3', kva: 2500, ratio: '11 kV / 410 V', vcbA: 630, bus: 'LT34', incomerAcbA: 3200, controller: 'DEIF AGC-246', impedancePct: 6.0 },
]

export const PF_PANELS: PfPanel[] = [
  { id: 'PF1', name: 'PF.1 Capacitor Bank', kvar: 1000, bus: 'LT1', steps: 10, detuned: false },
  { id: 'PF2', name: 'PF.2 Capacitor Bank', kvar: 1000, bus: 'LT2', steps: 10, detuned: false },
  { id: 'PF3', name: 'PF.3 Capacitor Bank', kvar: 1250, bus: 'LT34', steps: 12, detuned: false },
]

export const SOLAR_ARRAYS: SolarArray[] = [
  { id: 'PV-2463', name: 'Solar Panel 2463', kwp: 1808, inverter: 'Solar Inverter 10', inverterKw: 1500, bus: 'LT1', mccb: 'MCCB 400A ×10', acbA: 3200 },
  { id: 'PV-2414', name: 'Solar Panel 2414', kwp: 1786, inverter: 'Solar Inverter 10', inverterKw: 1500, bus: 'LT2', mccb: 'MCCB 400A ×10', acbA: 3200 },
  { id: 'PV-2068', name: 'Solar Panel 2068', kwp: 1490, inverter: 'Solar Inverter 8', inverterKw: 1200, bus: 'LT34', mccb: 'MCCB 400A ×8', acbA: 2500 },
]

/** Din does not run generators: power comes from the grid and solar only */
export const GENSETS: Genset[] = []

export const LT_BUSES: LtBus[] = [
  { id: 'LT1', name: 'LT #1', sldLabel: 'LT # 01 / 1500kW', designKw: 1600, transformerId: 'TR1', pfPanelId: 'PF1', solarId: 'PV-2463', color: 'lt1' },
  { id: 'LT2', name: 'LT #2', sldLabel: 'LT # 02 / 1500kW', designKw: 1600, transformerId: 'TR2', pfPanelId: 'PF2', solarId: 'PV-2414', color: 'lt2' },
  { id: 'LT34', name: 'LT #3&4', sldLabel: 'LT # 3&4 / 1250kW', designKw: 1700, transformerId: 'TR3', pfPanelId: 'PF3', solarId: 'PV-2068', color: 'lt3' },
]

export const BUS_COUPLERS = [
  { id: 'BC-12', name: 'Bus Coupler LT#1 – LT#2', acbA: 3200, normallyOpen: true },
  { id: 'BC-23', name: 'Bus Coupler LT#2 – LT#3&4', acbA: 3200, normallyOpen: true },
]

export const busById = Object.fromEntries(LT_BUSES.map((b) => [b.id, b])) as Record<LtBus['id'], LtBus>

export const TOTAL_SOLAR_KWP = SOLAR_ARRAYS.reduce((s, a) => s + a.kwp, 0)
export const TOTAL_TRANSFORMER_KVA = TRANSFORMERS.reduce((s, t) => s + t.kva, 0)
