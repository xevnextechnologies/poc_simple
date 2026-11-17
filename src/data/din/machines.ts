// Machine register for Spinning Unit DIL.
// Machine numbering and feeder grouping follow Din's own SLD
// (e.g. "Card (4 to 09)", "Ring (32 to 35)"). Ratings are nameplate-class
// values for 2005–2009 era spinning machinery.
import { feederByName } from './feeders'
import type { BusId, Machine, MachineKind, MeteringTier, ProcessStage } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

interface Spec {
  id: string
  name: string
  kind: MachineKind
  stage: ProcessStage
  hallId: string
  zoneId: string
  bus: BusId
  feeder: string
  ratedKw: number
  typicalLoad: number
  drive: Machine['drive']
  modelYear?: number
  metering?: MeteringTier
  spindles?: number
  rotors?: number
  drums?: number
  spec?: string
  note?: string
}

const machines: Machine[] = []

function add(s: Spec) {
  const feeder = feederByName(s.bus, s.feeder)
  // Heavy machines get their own meter; small machines are apportioned from the feeder
  const metering: MeteringTier =
    s.metering ?? (feeder.metering === 'pq' && s.drive === 'VFD' ? 'machine' : s.ratedKw >= 40 ? 'machine' : 'feeder')
  machines.push({
    id: s.id,
    name: s.name,
    kind: s.kind,
    stage: s.stage,
    hallId: s.hallId,
    zoneId: s.zoneId,
    feederId: feeder.id,
    ratedKw: s.ratedKw,
    typicalLoad: s.typicalLoad,
    modelYear: s.modelYear ?? 2005,
    metering,
    meterId: metering === 'machine' ? `EM-${s.id}` : metering === 'pq' ? `PQ-${s.id}` : undefined,
    drive: s.drive,
    spindles: s.spindles,
    rotors: s.rotors,
    drums: s.drums,
    spec: s.spec,
    note: s.note,
  })
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

/* ------------------------------ Blow room ------------------------------ */
const BR = { stage: 'blowroom' as const, hallId: 'H1', zoneId: 'Z-BR', bus: 'LT2' as const, feeder: 'Blow Room' }
add({ ...BR, id: 'BR-L1-AP', name: 'Auto Plucker — Line 1 (Cotton)', kind: 'auto-plucker', ratedKw: 11, typicalLoad: 0.7, drive: 'DOL', spec: 'Bale opening, 2 sides' })
add({ ...BR, id: 'BR-L1-B70', name: 'B70 Multimixer — Line 1', kind: 'mixer', ratedKw: 18.5, typicalLoad: 0.72, drive: 'VFD', metering: 'pq', spec: '6-chamber mixer · inverter driven' })
add({ ...BR, id: 'BR-L1-B60', name: 'B60 Cleaner — Line 1', kind: 'cleaner', ratedKw: 22, typicalLoad: 0.74, drive: 'VFD', metering: 'pq', spec: 'Fine cleaner · inverter driven' })
add({ ...BR, id: 'BR-L1-JS', name: 'Jossi Contamination Sorter', kind: 'contamination-sorter', ratedKw: 7.5, typicalLoad: 0.6, drive: 'Mixed', spec: 'Optical foreign-fibre ejection' })
add({ ...BR, id: 'BR-L1-CN', name: 'Condenser — Line 1', kind: 'condenser', ratedKw: 15, typicalLoad: 0.78, drive: 'DOL', spec: 'Transport fan + condenser' })
add({ ...BR, id: 'BR-L2-AP', name: 'Auto Plucker — Line 2 (Synthetic)', kind: 'auto-plucker', ratedKw: 11, typicalLoad: 0.68, drive: 'DOL', spec: 'Bale opening' })
add({ ...BR, id: 'BR-L2-MX', name: 'Mixer — Line 2', kind: 'mixer', ratedKw: 15, typicalLoad: 0.7, drive: 'DOL' })
add({ ...BR, id: 'BR-L2-CN', name: 'Condenser — Line 2', kind: 'condenser', ratedKw: 15, typicalLoad: 0.76, drive: 'DOL' })
add({ ...BR, id: 'BR-L2-A78', name: 'A-78 Uniflex — Line 2', kind: 'cleaner', ratedKw: 18.5, typicalLoad: 0.7, drive: 'DOL', spec: 'Opener / cleaner' })

/* ------------------------------- Carding ------------------------------- */
const cardFeeder = (n: number): [BusId, string] => {
  if (n <= 3) return ['LT2', 'Card (1 to 3) + (2) Drawing + (1) Simplex']
  if (n <= 9) return ['LT2', 'Card (4 to 09)']
  if (n <= 15) return ['LT1', 'Card (10 to 15)']
  if (n <= 19) return ['LT1', 'Drawing (15 to 19) + Card (16 to 19)']
  if (n <= 26) return ['LT1', 'Card (20 to 26) + 12,13,14 Drawing']
  return ['LT2', 'Card (27 to 30)']
}
for (const n of range(1, 30)) {
  const [bus, feeder] = cardFeeder(n)
  add({
    id: `CD-${pad(n)}`,
    name: `Card ${pad(n)}`,
    kind: 'card',
    stage: 'carding',
    hallId: 'H1',
    zoneId: 'Z-CD',
    bus,
    feeder,
    ratedKw: 15,
    typicalLoad: 0.74,
    drive: 'VFD',
    modelYear: n >= 27 ? 2009 : 2005,
    spec: 'Chute-fed card · ~50 kg/h · inverter driven',
  })
}

/* ------------------------- Drawing, comber, simplex ------------------------- */
const drawFeeder = (n: number): [BusId, string] => {
  if (n <= 2) return ['LT2', 'Card (1 to 3) + (2) Drawing + (1) Simplex']
  if (n <= 11) return ['LT1', 'Drawing + Comber']
  if (n <= 14) return ['LT1', 'Card (20 to 26) + 12,13,14 Drawing']
  return ['LT1', 'Drawing (15 to 19) + Card (16 to 19)']
}
for (const n of range(1, 19)) {
  const [bus, feeder] = drawFeeder(n)
  add({
    id: `DF-${pad(n)}`,
    name: `Draw Frame ${pad(n)}`,
    kind: 'draw-frame',
    stage: 'drawing',
    hallId: 'H1',
    zoneId: 'Z-DR',
    bus,
    feeder,
    ratedKw: 9,
    typicalLoad: 0.64,
    drive: 'VFD',
    spec: n <= 8 ? 'Breaker drawing · 8-into-1 doubling' : 'Finisher drawing · auto-leveller',
  })
}
for (const n of range(1, 6)) {
  add({
    id: `CB-${pad(n)}`,
    name: `Comber ${pad(n)}`,
    kind: 'comber',
    stage: 'combing',
    hallId: 'H1',
    zoneId: 'Z-DR',
    bus: 'LT1',
    feeder: 'Drawing + Comber',
    ratedKw: 5.5,
    typicalLoad: 0.7,
    drive: 'VFD',
    spec: '8-head comber · combed (CM) counts',
  })
}
for (const n of range(1, 10)) {
  add({
    id: `SX-${pad(n)}`,
    name: `Simplex ${pad(n)}`,
    kind: 'simplex',
    stage: 'simplex',
    hallId: 'H1',
    zoneId: 'Z-SX',
    bus: 'LT1',
    feeder: 'Simplex (1 to 10)',
    ratedKw: 13,
    typicalLoad: 0.72,
    drive: 'DOL',
    spindles: 120,
    spec: '120-spindle roving frame',
  })
}
add({
  id: 'SX-11',
  name: 'Simplex 11 (New)',
  kind: 'simplex',
  stage: 'simplex',
  hallId: 'H1',
  zoneId: 'Z-SX',
  bus: 'LT2',
  feeder: 'Card (1 to 3) + (2) Drawing + (1) Simplex',
  ratedKw: 15,
  typicalLoad: 0.7,
  drive: 'VFD',
  modelYear: 2009,
  spindles: 144,
  spec: '144-spindle roving frame · inverter driven',
})

/* --------------------------------- Open end --------------------------------- */
for (const n of [1, 2]) {
  add({
    id: `OE-${pad(n)}`,
    name: `Open End ${pad(n)}`,
    kind: 'open-end',
    stage: 'openend',
    hallId: 'H1',
    zoneId: 'Z-OE',
    bus: 'LT1',
    feeder: 'Open End Machine',
    ratedKw: 140,
    typicalLoad: 0.78,
    drive: 'VFD',
    metering: 'pq',
    rotors: 480,
    spec: '480-rotor OE spinner · coarse counts 6s–20s',
  })
}

/* ------------------- Mixing line for dyed fibre (Ring Hall 1) ------------------- */
const MX = { stage: 'carding' as const, hallId: 'H2', zoneId: 'Z-MX', bus: 'LT1' as const, feeder: 'Mixing (3) Drawing + (4) Card + (1) Simplex' }
for (const n of range(1, 4)) add({ ...MX, id: `MX-CD-${pad(n)}`, name: `Mixing Card ${pad(n)}`, kind: 'card', ratedKw: 15, typicalLoad: 0.72, drive: 'VFD', spec: 'Dyed-fibre / melange carding' })
for (const n of range(1, 3)) add({ ...MX, stage: 'drawing', id: `MX-DF-${pad(n)}`, name: `Mixing Draw Frame ${pad(n)}`, kind: 'draw-frame', ratedKw: 9, typicalLoad: 0.62, drive: 'VFD', spec: 'Colour blending drawing' })
add({ ...MX, stage: 'simplex', id: 'MX-SX-01', name: 'Mixing Simplex 01', kind: 'simplex', ratedKw: 13, typicalLoad: 0.7, drive: 'DOL', spindles: 120 })

/* -------------------------------- Ring frames -------------------------------- */
const ringFeeder = (n: number): [BusId, string] => {
  if (n <= 4) return ['LT2', 'Ring (1 to 4)']
  if (n <= 8) return ['LT2', 'Ring (5 to 8)']
  if (n <= 12) return ['LT2', 'Ring (9 to 12)']
  if (n <= 16) return ['LT34', 'Ring (13 to 16) + (1) Auto Cone']
  if (n <= 20) return ['LT1', 'Ring (17 to 20) + 1 Auto Cone']
  if (n <= 24) return ['LT1', 'Ring (21 to 24)']
  if (n <= 27) return ['LT2', 'Ring (25 to 27)']
  if (n <= 30) return ['LT1', 'Ring (28 to 30) + Sample Frame']
  if (n <= 35) return ['LT34', 'Ring (32 to 35)']
  return ['LT34', 'Ring (36 to 39)']
}
for (const n of range(1, 39)) {
  if (n === 31) continue // No frame 31 on Din's SLD feeder list
  const [bus, feeder] = ringFeeder(n)
  const spindles = n <= 24 ? 1008 : n <= 30 ? 1056 : 1200
  const ratedKw = n <= 24 ? 55 : n <= 30 ? 58 : 66
  add({
    id: `RF-${pad(n)}`,
    name: `Ring Frame ${pad(n)}`,
    kind: 'ring-frame',
    stage: 'ring',
    hallId: n <= 24 ? 'H2' : 'H3',
    zoneId: n <= 24 ? 'Z-R1' : 'Z-R2',
    bus,
    feeder,
    ratedKw,
    typicalLoad: 0.8,
    drive: 'VFD',
    modelYear: n >= 32 ? 2009 : 2005,
    metering: 'machine',
    spindles,
    spec: `${spindles} spindles · main drive + suction`,
  })
}
add({
  id: 'SF-01',
  name: 'Sample Frame',
  kind: 'sample-frame',
  stage: 'ring',
  hallId: 'H3',
  zoneId: 'Z-R2',
  bus: 'LT1',
  feeder: 'Ring (28 to 30) + Sample Frame',
  ratedKw: 12,
  typicalLoad: 0.45,
  drive: 'VFD',
  spindles: 240,
  spec: 'Trial / sample lots',
})

/* --------------------------------- Autoconers --------------------------------- */
const awFeeder = (n: number): [BusId, string] => {
  if (n <= 6) return ['LT2', 'Auto Cone (1 to 6)']
  if (n <= 12) return ['LT1', 'Autocone (7 to 12)']
  if (n === 13) return ['LT34', 'Ring (13 to 16) + (1) Auto Cone']
  if (n === 14) return ['LT34', 'Auto Cone Link + (1) Auto Cone']
  if (n === 15) return ['LT2', 'New Ring AC 01 + Auto Cone']
  return ['LT1', 'Ring (17 to 20) + 1 Auto Cone']
}
for (const n of range(1, 16)) {
  const [bus, feeder] = awFeeder(n)
  add({
    id: `AW-${pad(n)}`,
    name: `Autoconer ${pad(n)}`,
    kind: 'autoconer',
    stage: 'winding',
    hallId: 'H3',
    zoneId: 'Z-AW',
    bus,
    feeder,
    ratedKw: 30,
    typicalLoad: 0.56,
    drive: 'VFD',
    modelYear: n >= 13 ? 2009 : 2005,
    drums: 60,
    spec: '60-drum automatic winder · electronic yarn clearer',
  })
}
add({
  id: 'LC-01',
  name: 'Link Coner 01',
  kind: 'link-coner',
  stage: 'winding',
  hallId: 'H3',
  zoneId: 'Z-AW',
  bus: 'LT34',
  feeder: 'Auto Cone Link + (1) Auto Cone',
  ratedKw: 22,
  typicalLoad: 0.55,
  drive: 'VFD',
  modelYear: 2009,
  drums: 24,
  spec: 'Ring-linked winder',
})

/* ------------------------- Inspection, packing, godown ------------------------- */
add({ id: 'UV-01', name: 'UV Cone Inspection Tunnel', kind: 'uv-inspection', stage: 'inspection', hallId: 'H3', zoneId: 'Z-UV', bus: 'LT1', feeder: 'Godown No 14', ratedKw: 6, typicalLoad: 0.85, drive: 'Mixed', spec: 'UV lamps + conveyor · contamination check' })
add({ id: 'PK-01', name: 'Packing Line', kind: 'packing-line', stage: 'packing', hallId: 'H3', zoneId: 'Z-PK', bus: 'LT1', feeder: 'Godown No 14', ratedKw: 18, typicalLoad: 0.55, drive: 'Mixed', spec: 'Cone packing, strapping, weighing' })
add({ id: 'GD-14', name: 'Godown No 14', kind: 'godown', stage: 'packing', hallId: 'H3', zoneId: 'Z-PK', bus: 'LT1', feeder: 'Godown No 14', ratedKw: 25, typicalLoad: 0.5, drive: 'Mixed', spec: 'Lighting, fans, forklift charging' })

/* ------------------------- Humidification & AC plants ------------------------- */
const HV = { stage: 'humidification' as const, hallId: 'U1', zoneId: 'Z-HV', kind: 'ac-plant' as const, drive: 'Star-Delta' as const, typicalLoad: 0.55 }
add({ ...HV, id: 'HV-R12', name: 'Ring AC Plant 1+2', bus: 'LT34', feeder: 'Ring AC 1+2', ratedKw: 220, spec: 'Supply/return fans, washer pumps · Ring Hall 1' })
add({ ...HV, id: 'HV-AWB', name: 'Auto Cone AC Plant (B)', bus: 'LT34', feeder: 'Auto Cone AC (B)', ratedKw: 75, spec: 'Winding hall humidification' })
add({ ...HV, id: 'HV-AWA', name: 'Auto Cone AC Plant (A)', bus: 'LT34', feeder: 'Auto Cone AC (A)', ratedKw: 75, spec: 'Winding hall humidification' })
add({ ...HV, id: 'HV-NSX', name: 'New Simplex AC Plant', bus: 'LT34', feeder: 'New Simplex AC Plant', ratedKw: 110, modelYear: 2009, drive: 'VFD', spec: 'Simplex area · inverter fans' })
add({ ...HV, id: 'HV-NR1', name: 'New Ring AC Plant 01', bus: 'LT2', feeder: 'New Ring AC 01 + Auto Cone', ratedKw: 200, modelYear: 2009, drive: 'VFD', spec: 'Ring Hall 2 · inverter fans' })
add({ ...HV, id: 'HV-BRC', name: 'Blow Room + Card Filter AC', bus: 'LT2', feeder: 'Blow Room + Card Filter AC', ratedKw: 300, spec: 'Prep hall AC + waste suction filter' })
add({ ...HV, id: 'HV-SXC', name: 'Simplex AC + Comber Filter', bus: 'LT1', feeder: 'Simp AC + Com Filter', ratedKw: 110, spec: 'Simplex AC, comber noil filter' })
add({ ...HV, id: 'HV-R34', name: 'Ring AC Plant 3+4', bus: 'LT1', feeder: 'Ring AC 3+4 & Colony', ratedKw: 240, spec: 'Ring Hall 2 humidification' })
add({ ...HV, id: 'FL-NCF', kind: 'filter-plant', name: 'New Card Filter', bus: 'LT1', feeder: 'New Card Filter', ratedKw: 110, modelYear: 2009, drive: 'VFD', typicalLoad: 0.68, spec: 'Card waste suction & filtration' })

/* ------------------------------ Compressed air ------------------------------ */
const CA = { stage: 'compressed-air' as const, hallId: 'U1', zoneId: 'Z-CA', kind: 'compressor' as const, typicalLoad: 0.66 }
add({ ...CA, id: 'CP-01', name: 'Compressor 160 kW (Main)', bus: 'LT34', feeder: 'Compressor 160kW', ratedKw: 160, drive: 'Star-Delta', metering: 'pq', spec: 'Screw · load/unload · 7.0 bar' })
add({ ...CA, id: 'CP-02', name: 'Auto Cone Compressor 160 kW', bus: 'LT34', feeder: 'Auto Cone Comp 160kW', ratedKw: 160, drive: 'Star-Delta', metering: 'pq', spec: 'Screw · load/unload · splicer air' })
add({ ...CA, id: 'CP-03', name: 'Workshop / Power House Compressor', bus: 'LT2', feeder: 'Compr + Workshop + Power House', ratedKw: 90, drive: 'Star-Delta', spec: 'Screw · load/unload' })
add({ id: 'WS-01', name: 'Workshop', kind: 'workshop', stage: 'utility', hallId: 'U1', zoneId: 'Z-UT', bus: 'LT2', feeder: 'Compr + Workshop + Power House', ratedKw: 30, typicalLoad: 0.35, drive: 'Mixed', spec: 'Lathe, welding, grinding' })
add({ id: 'PH-AUX', name: 'Power House Auxiliaries', kind: 'workshop', stage: 'utility', hallId: 'P1', zoneId: 'Z-PH', bus: 'LT2', feeder: 'Compr + Workshop + Power House', ratedKw: 40, typicalLoad: 0.55, drive: 'Mixed', spec: 'Radiator fans, pumps, battery chargers' })

/* --------------------------------- Utilities --------------------------------- */
const UT = { stage: 'utility' as const, hallId: 'U1', zoneId: 'Z-UT' }
add({ ...UT, id: 'WP-01', name: 'Waste Plant', kind: 'waste-plant', bus: 'LT34', feeder: 'Waste Plant', ratedKw: 75, typicalLoad: 0.6, drive: 'DOL', spec: 'Waste opening & recycling' })
add({ ...UT, id: 'WL-01', name: 'Welker Machine', kind: 'baling-press', bus: 'LT34', feeder: 'Welker Machine', ratedKw: 55, typicalLoad: 0.4, drive: 'DOL', spec: 'Waste baling press · intermittent' })
add({ ...UT, id: 'TB-01', name: 'Turbine Auxiliaries', kind: 'turbine', bus: 'LT1', feeder: 'Turbine', ratedKw: 55, typicalLoad: 0.5, drive: 'Mixed', hallId: 'P1', zoneId: 'Z-PH', spec: 'Turbine aux pumps & fans' })
add({ ...UT, id: 'LAB-01', name: 'Laboratory + R.O Plant', kind: 'lab-ro', bus: 'LT2', feeder: 'Laboratory + R.O Plant', ratedKw: 35, typicalLoad: 0.55, drive: 'Mixed', spec: 'Testing lab, R.O water' })
add({ ...UT, id: 'EX-01', name: 'LT Exhaust Fans', kind: 'exhaust', bus: 'LT2', feeder: 'LT Exhaust Fan', ratedKw: 22, typicalLoad: 0.8, drive: 'DOL', spec: 'LT room ventilation' })
add({ id: 'LT-01', name: 'Mills Lighting', kind: 'lighting', stage: 'lighting', hallId: 'U1', zoneId: 'Z-UT', bus: 'LT1', feeder: 'Mills Light', ratedKw: 150, typicalLoad: 0.85, drive: 'Mixed', metering: 'feeder', spec: 'All halls · tube / high-bay' })
add({ id: 'CL-01', name: 'Colony Supply', kind: 'colony', stage: 'non-production', hallId: 'U1', zoneId: 'Z-UT', bus: 'LT1', feeder: 'Ring AC 3+4 & Colony', ratedKw: 120, typicalLoad: 0.45, drive: 'Mixed', metering: 'machine', spec: 'Residential colony — non-production', note: 'Shares feeder with Ring AC 3+4' })

export const MACHINES = machines
export const machineById = Object.fromEntries(MACHINES.map((m) => [m.id, m])) as Record<string, Machine>
export const machinesByFeeder = MACHINES.reduce<Record<string, Machine[]>>((acc, m) => {
  ;(acc[m.feederId] ??= []).push(m)
  return acc
}, {})
