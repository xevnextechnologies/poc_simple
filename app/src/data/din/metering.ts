// Enervtek metering points installed at Spinning Unit DIL.
import { FEEDERS } from './feeders'
import { MACHINES } from './machines'
import { LT_BUSES, SOLAR_ARRAYS } from './plant'
import type { MeteringTier } from './types'

export interface MeterPoint {
  id: string
  tier: MeteringTier | 'incomer'
  device: string
  location: string
  protocol: string
  pollSec: number
}

const PQ_DEVICE = 'Class-A PQ analyser · harmonics to 63rd · event capture'
const EM_DEVICE = '3-phase multifunction meter · Class 0.5S'

export const METER_POINTS: MeterPoint[] = [
  { id: 'PQ-11K-01', tier: 'incomer', device: PQ_DEVICE, location: '11 kV metering cubicle (via PT/CT)', protocol: 'Modbus TCP', pollSec: 1 },
  ...LT_BUSES.map((b) => ({
    id: `PQ-${b.id}-INC`,
    tier: 'incomer' as const,
    device: PQ_DEVICE,
    location: `${b.name} incomer ACB`,
    protocol: 'Modbus TCP',
    pollSec: 1,
  })),
  ...SOLAR_ARRAYS.map((s) => ({
    id: `INV-${s.id}`,
    tier: 'derived' as const,
    device: 'Inverter data logger',
    location: `${s.inverter} · ${s.name}`,
    protocol: 'Modbus TCP',
    pollSec: 10,
  })),
  ...FEEDERS.map((f) => ({
    id: f.meterId,
    tier: f.metering,
    device: f.metering === 'pq' ? PQ_DEVICE : EM_DEVICE,
    location: `${f.bus === 'LT34' ? 'LT#3&4' : f.bus.replace('LT', 'LT#')} · ${f.sldName}`,
    protocol: 'Modbus RTU (RS485)',
    pollSec: f.metering === 'pq' ? 1 : 5,
  })),
  ...MACHINES.filter((m) => m.metering === 'machine').map((m) => ({
    id: m.meterId!,
    tier: 'machine' as const,
    device: EM_DEVICE,
    location: `${m.name} · machine panel`,
    protocol: 'Modbus RTU (RS485)',
    pollSec: 5,
  })),
  ...MACHINES.filter((m) => m.metering === 'pq').map((m) => ({
    id: m.meterId!,
    tier: 'pq' as const,
    device: PQ_DEVICE,
    location: `${m.name} · drive input`,
    protocol: 'Modbus TCP',
    pollSec: 1,
  })),
]

export const METERING_LABEL: Record<MeteringTier | 'incomer', string> = {
  pq: 'Power quality',
  machine: 'Machine meter',
  feeder: 'Feeder share',
  derived: 'Derived',
  incomer: 'Incomer PQ',
}

export const METERING_HINT: Record<MeteringTier | 'incomer', string> = {
  pq: 'Class-A analyser: V, I, power, harmonics, waveform and events',
  machine: 'Dedicated meter on this machine: V, I, power, PF, energy',
  feeder: 'Apportioned from the feeder meter at the LT panel',
  derived: 'Calculated from other measurements or controller data',
  incomer: 'Power-quality analyser on the bus incomer',
}
