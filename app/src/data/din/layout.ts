// Halls and zones as walked during the site visit:
// raw cotton at the far end → preparatory → Ring Hall 1 (with the dyed-fibre
// mixing line) → large Ring Hall 2 → autoconers → UV inspection → packing.
import type { Hall, Zone } from './types'

export const HALLS: Hall[] = [
  {
    id: 'H1',
    name: 'Preparatory Hall',
    short: 'Prep',
    description: 'Bale mixing, blow room, carding, drawing, combing, simplex and open-end',
  },
  {
    id: 'H2',
    name: 'Ring Hall 1',
    short: 'Ring-1',
    description: 'Ring frames 1–24 (1008 spindles) and the dyed-fibre mixing line',
  },
  {
    id: 'H3',
    name: 'Ring Hall 2',
    short: 'Ring-2',
    description: 'Ring frames 25–39 (1056 / 1200 spindles), autoconers, UV inspection and packing',
  },
  {
    id: 'U1',
    name: 'Utilities Block',
    short: 'Utility',
    description: 'Compressors, humidification / AC plants, filters, waste plant, workshop',
  },
  {
    id: 'P1',
    name: 'Power House & Substation',
    short: 'Power',
    description: '11 kV intake, transformers, LT panels, solar inverters',
  },
]

export const ZONES: Zone[] = [
  { id: 'Z-BR', hallId: 'H1', name: 'Blow Room', stage: 'blowroom' },
  { id: 'Z-CD', hallId: 'H1', name: 'Carding', stage: 'carding' },
  { id: 'Z-DR', hallId: 'H1', name: 'Drawing & Combing', stage: 'drawing' },
  { id: 'Z-SX', hallId: 'H1', name: 'Simplex', stage: 'simplex' },
  { id: 'Z-OE', hallId: 'H1', name: 'Open End', stage: 'openend' },
  { id: 'Z-MX', hallId: 'H2', name: 'Mixing Line (Dyed Fibre)', stage: 'carding' },
  { id: 'Z-R1', hallId: 'H2', name: 'Ring Frames 1–24', stage: 'ring' },
  { id: 'Z-R2', hallId: 'H3', name: 'Ring Frames 25–39', stage: 'ring' },
  { id: 'Z-AW', hallId: 'H3', name: 'Autoconer Winding', stage: 'winding' },
  { id: 'Z-UV', hallId: 'H3', name: 'UV Inspection', stage: 'inspection' },
  { id: 'Z-PK', hallId: 'H3', name: 'Packing & Godown 14', stage: 'packing' },
  { id: 'Z-HV', hallId: 'U1', name: 'Humidification & AC Plants', stage: 'humidification' },
  { id: 'Z-CA', hallId: 'U1', name: 'Compressor House', stage: 'compressed-air' },
  { id: 'Z-UT', hallId: 'U1', name: 'Utilities & Services', stage: 'utility' },
  { id: 'Z-PH', hallId: 'P1', name: 'Power House', stage: 'utility' },
]

export const hallById = Object.fromEntries(HALLS.map((h) => [h.id, h]))
export const zoneById = Object.fromEntries(ZONES.map((z) => [z.id, z]))

export const STAGE_LABEL: Record<string, string> = {
  blowroom: 'Blow Room',
  carding: 'Carding',
  drawing: 'Drawing',
  combing: 'Combing',
  simplex: 'Simplex',
  ring: 'Ring Spinning',
  openend: 'Open End',
  winding: 'Winding',
  inspection: 'Inspection',
  packing: 'Packing',
  humidification: 'Humidification / AC',
  'compressed-air': 'Compressed Air',
  utility: 'Utility',
  lighting: 'Lighting',
  'non-production': 'Non-production',
}

/** Order of the spinning process, used for flow strips and sorting */
export const PROCESS_FLOW = ['blowroom', 'carding', 'drawing', 'simplex', 'ring', 'winding', 'packing'] as const
