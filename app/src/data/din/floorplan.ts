// 2D floor plan of Spinning Unit DIL, following the walk order of the site
// visit. Logical layout (not to scale) until Din shares a hall sketch.
import { MACHINES } from './machines'
import type { Machine } from './types'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export interface Tile extends Box {
  id: string
  shape: 'rect' | 'circle'
  label: string
  /** Larger tiles show the name and kW inside */
  rich?: boolean
}
export interface HallBox extends Box {
  id: string
  title: string
  subtitle: string
}
export interface ZoneBox extends Box {
  title: string
}

export const VIEW = { w: 1400, h: 840 }

export const HALL_BOXES: HallBox[] = [
  { id: 'H1', title: 'Preparatory Hall', subtitle: 'Blow room → carding → drawing → simplex', x: 20, y: 20, w: 600, h: 500 },
  { id: 'H2', title: 'Ring Hall 1', subtitle: 'Frames 1–24 · dyed-fibre mixing line', x: 640, y: 20, w: 360, h: 500 },
  { id: 'H3', title: 'Ring Hall 2', subtitle: 'Frames 25–39 · winding · packing', x: 1020, y: 20, w: 360, h: 500 },
  { id: 'U1', title: 'Utilities', subtitle: 'Humidification, air, services', x: 20, y: 540, w: 980, h: 280 },
  { id: 'P1', title: 'Power House', subtitle: 'Grid and solar supply', x: 1020, y: 540, w: 360, h: 280 },
]

export const ZONE_BOXES: ZoneBox[] = []
export const TILES: Tile[] = []

const ms = (pred: (m: Machine) => boolean) => MACHINES.filter(pred)
const num = (id: string) => id.replace(/^[A-Z]+-(?:[A-Z]+-)?/, '')

function zone(title: string, b: Box) {
  ZONE_BOXES.push({ title, ...b })
  return { x: b.x + 12, y: b.y + 30 }
}

function grid(list: Machine[], o: { x: number; y: number }, cols: number, w: number, h: number, dx: number, dy: number, shape: Tile['shape'] = 'rect', rich = false, label = (m: Machine) => num(m.id)) {
  list.forEach((m, i) => {
    TILES.push({
      id: m.id,
      shape,
      rich,
      label: label(m),
      x: o.x + (i % cols) * dx,
      y: o.y + Math.floor(i / cols) * dy,
      w,
      h,
    })
  })
}

/* ---------------- Preparatory Hall ---------------- */
{
  const o = zone('Blow Room', { x: 36, y: 66, w: 568, h: 100 })
  const shortBR: Record<string, string> = {
    'BR-L1-AP': 'Plucker', 'BR-L1-B70': 'B70', 'BR-L1-B60': 'B60', 'BR-L1-JS': 'Jossi', 'BR-L1-CN': 'Condenser',
    'BR-L2-AP': 'Plucker', 'BR-L2-MX': 'Mixer', 'BR-L2-CN': 'Condenser', 'BR-L2-A78': 'A-78',
  }
  grid(ms((m) => m.id.startsWith('BR-L1')), o, 5, 96, 26, 108, 0, 'rect', false, (m) => shortBR[m.id])
  grid(ms((m) => m.id.startsWith('BR-L2')), { x: o.x, y: o.y + 34 }, 5, 96, 26, 108, 0, 'rect', false, (m) => shortBR[m.id])
}
{
  const o = zone('Carding', { x: 36, y: 178, w: 316, h: 160 })
  grid(ms((m) => /^CD-/.test(m.id)), { x: o.x + 2, y: o.y }, 10, 26, 26, 30, 38, 'circle')
}
{
  const o = zone('Drawing & combing', { x: 364, y: 178, w: 240, h: 160 })
  grid(ms((m) => /^DF-/.test(m.id)), o, 7, 26, 22, 31, 28)
  grid(ms((m) => /^CB-/.test(m.id)), { x: o.x, y: o.y + 92 }, 7, 26, 22, 31, 28, 'rect', false, (m) => 'C' + num(m.id))
}
{
  const o = zone('Simplex', { x: 36, y: 350, w: 316, h: 154 })
  grid(ms((m) => /^SX-/.test(m.id)), { x: o.x + 2, y: o.y + 6 }, 11, 22, 70, 27.5, 0)
}
{
  const o = zone('Open End', { x: 364, y: 350, w: 240, h: 154 })
  grid(ms((m) => /^OE-/.test(m.id)), { x: o.x, y: o.y + 6 }, 1, 216, 40, 0, 54, 'rect', true)
}

/* ---------------- Ring Hall 1 ---------------- */
{
  const o = zone('Mixing line (dyed fibre)', { x: 656, y: 66, w: 328, h: 78 })
  const list = ms((m) => m.id.startsWith('MX-'))
  list.forEach((m, i) => {
    const circle = m.kind === 'card'
    TILES.push({ id: m.id, shape: circle ? 'circle' : 'rect', label: num(m.id), x: o.x + i * 38, y: o.y, w: 26, h: 26 })
  })
}
{
  const o = zone('Ring frames 1–24 · 1,008 spindles each', { x: 656, y: 156, w: 328, h: 348 })
  const list = ms((m) => m.kind === 'ring-frame' && m.hallId === 'H2')
  grid(list, { x: o.x + 4, y: o.y + 4 }, 12, 18, 140, 26, 162)
}

/* ---------------- Ring Hall 2 ---------------- */
{
  const o = zone('Ring frames 25–39 · 1,056–1,200 spindles', { x: 1036, y: 66, w: 328, h: 196 })
  const list = ms((m) => (m.kind === 'ring-frame' && m.hallId === 'H3') || m.id === 'SF-01')
  grid(list, { x: o.x + 2, y: o.y + 2 }, 15, 16, 150, 20.6, 0, 'rect', false, (m) => (m.id === 'SF-01' ? 'S' : num(m.id)))
}
{
  const o = zone('Autoconer winding', { x: 1036, y: 274, w: 328, h: 110 })
  grid(ms((m) => m.kind === 'autoconer' || m.kind === 'link-coner'), o, 9, 30, 28, 34.5, 38, 'rect', false, (m) =>
    m.id === 'LC-01' ? 'L' : num(m.id),
  )
}
{
  const o = zone('UV inspection & packing', { x: 1036, y: 396, w: 328, h: 108 })
  grid(ms((m) => ['UV-01', 'PK-01', 'GD-14'].includes(m.id)), { x: o.x, y: o.y + 8 }, 3, 96, 46, 104, 0, 'rect', true)
}

/* ---------------- Utilities ---------------- */
{
  const o = zone('Humidification & AC plants', { x: 36, y: 586, w: 492, h: 218 })
  grid(ms((m) => m.stage === 'humidification'), o, 4, 112, 48, 118, 60, 'rect', true)
}
{
  const o = zone('Compressed air', { x: 540, y: 586, w: 210, h: 218 })
  grid(ms((m) => m.stage === 'compressed-air' || m.id === 'WS-01'), o, 1, 186, 40, 0, 46, 'rect', true)
}
{
  const o = zone('Services', { x: 762, y: 586, w: 226, h: 218 })
  grid(ms((m) => ['WP-01', 'WL-01', 'LAB-01', 'EX-01', 'LT-01', 'CL-01'].includes(m.id)), o, 2, 98, 48, 104, 60, 'rect', true)
}

/* ---------------- Power House ---------------- */
export const SOURCE_TILES = {
  grid: { x: 1048, y: 616, w: 148, h: 64 },
  solar: { x: 1204, y: 616, w: 148, h: 64 },
}
{
  zone('Supply', { x: 1036, y: 586, w: 328, h: 106 })
  const o = zone('Power house loads', { x: 1036, y: 702, w: 328, h: 102 })
  grid(ms((m) => ['PH-AUX', 'TB-01'].includes(m.id)), o, 2, 150, 48, 158, 0, 'rect', true)
}

export const tileById = Object.fromEntries(TILES.map((t) => [t.id, t]))

const SHORT: Record<string, string> = {
  'HV-R12': 'Ring AC 1+2', 'HV-AWB': 'Autocone AC B', 'HV-AWA': 'Autocone AC A', 'HV-NSX': 'New Simplex AC',
  'HV-NR1': 'New Ring AC', 'HV-BRC': 'Blow Room AC', 'HV-SXC': 'Simplex AC', 'HV-R34': 'Ring AC 3+4',
  'FL-NCF': 'Card Filter', 'CP-01': 'Compressor 160 kW', 'CP-02': 'Autocone Comp.', 'CP-03': 'Compressor 90 kW',
  'WS-01': 'Workshop', 'WP-01': 'Waste Plant', 'WL-01': 'Welker', 'LAB-01': 'Lab + R.O', 'EX-01': 'Exhaust Fans',
  'LT-01': 'Mill Lights', 'CL-01': 'Colony', 'UV-01': 'UV Inspection', 'PK-01': 'Packing', 'GD-14': 'Godown 14',
  'PH-AUX': 'Power House', 'TB-01': 'Turbine Aux.', 'OE-01': 'Open End 01', 'OE-02': 'Open End 02',
}
/** Short names for rich tiles */
export function shortName(m: Machine): string {
  return SHORT[m.id] ?? m.name
}
