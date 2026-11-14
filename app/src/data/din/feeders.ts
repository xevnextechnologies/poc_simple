// All 43 outgoing feeders, exactly as written on "SLD For Spinning Unit DIL".
// Order follows the drawing (top to bottom on each LT panel).
import type { BusId, Feeder, ProcessStage } from './types'

type Row = [sldName: string, breakerA: number, stage: ProcessStage, vfdLoad?: boolean, note?: string]

const LT34: Row[] = [
  ['Ring (13 to 16) + (1) Auto Cone', 1000, 'ring'],
  ['Waste Plant', 250, 'utility'],
  ['Welker Machine', 250, 'utility'],
  ['Compressor 160kW', 630, 'compressed-air'],
  ['Ring AC 1+2', 630, 'humidification'],
  ['Auto Cone AC (B)', 250, 'humidification'],
  ['Auto Cone AC (A)', 250, 'humidification'],
  ['New Simplex AC Plant', 400, 'humidification'],
  ['Auto Cone Link + (1) Auto Cone', 400, 'winding', true],
  ['Auto Cone Comp 160kW', 630, 'compressed-air'],
  ['Ring (36 to 39)', 1000, 'ring'],
  ['Ring (32 to 35)', 1000, 'ring'],
]

const LT2: Row[] = [
  ['Laboratory + R.O Plant', 100, 'utility'],
  ['New Ring AC 01 + Auto Cone', 630, 'humidification'],
  ['Blow Room + Card Filter AC', 1000, 'humidification'],
  ['Card (27 to 30)', 400, 'carding', true],
  ['LT Exhaust Fan', 63, 'utility'],
  ['Ring (9 to 12)', 1600, 'ring'],
  ['Ring (5 to 8)', 630, 'ring'],
  ['Ring (1 to 4)', 630, 'ring'],
  ['Ring (25 to 27)', 630, 'ring'],
  ['Card (4 to 09)', 630, 'carding', true],
  ['Card (1 to 3) + (2) Drawing + (1) Simplex', 630, 'carding', true],
  ['Compr + Workshop + Power House', 630, 'compressed-air'],
  ['Blow Room', 630, 'blowroom', true],
  ['Auto Cone (1 to 6)', 630, 'winding', true],
]

const LT1: Row[] = [
  ['Open End Machine', 630, 'openend', true],
  ['Godown No 14', 250, 'packing'],
  ['Ring (17 to 20) + 1 Auto Cone', 630, 'ring'],
  ['Autocone (7 to 12)', 630, 'winding', true],
  ['Mixing (3) Drawing + (4) Card + (1) Simplex', 250, 'carding', true],
  ['Drawing (15 to 19) + Card (16 to 19)', 250, 'carding', true],
  ['Simp AC + Com Filter', 400, 'humidification'],
  ['Card (10 to 15)', 630, 'carding', true],
  ['Mills Light', 630, 'lighting'],
  ['Drawing + Comber', 250, 'drawing'],
  ['Simplex (1 to 10)', 250, 'simplex'],
  ['Ring AC 3+4 & Colony', 1000, 'humidification', false, 'Colony load shares a production feeder'],
  ['Ring (28 to 30) + Sample Frame', 630, 'ring'],
  ['Ring (21 to 24)', 630, 'ring'],
  ['Card (20 to 26) + 12,13,14 Drawing', 630, 'carding', true],
  ['New Card Filter', 630, 'humidification'],
  ['Turbine', 250, 'utility'],
]

function build(bus: BusId, rows: Row[]): Feeder[] {
  const code = bus === 'LT34' ? 'LT34' : bus
  return rows.map(([sldName, breakerA, stage, vfdLoad, note], i) => {
    const n = String(i + 1).padStart(2, '0')
    const pq = Boolean(vfdLoad)
    return {
      id: `${code}-F${n}`,
      bus,
      sldName,
      breakerA,
      breaker: breakerA >= 1000 ? 'ACB' : 'MCCB',
      stage,
      metering: pq ? 'pq' : 'feeder',
      meterId: `${pq ? 'PQ' : 'EM'}-${code}-${n}`,
      vfdLoad: Boolean(vfdLoad),
      note,
    } satisfies Feeder
  })
}

export const FEEDERS: Feeder[] = [...build('LT1', LT1), ...build('LT2', LT2), ...build('LT34', LT34)]

export const feederById = Object.fromEntries(FEEDERS.map((f) => [f.id, f])) as Record<string, Feeder>

/** Find a feeder by (part of) its SLD name — used while wiring machines */
export function feederByName(bus: BusId, sldName: string): Feeder {
  const f = FEEDERS.find((x) => x.bus === bus && x.sldName === sldName)
  if (!f) throw new Error(`Feeder not found: ${bus} / ${sldName}`)
  return f
}
