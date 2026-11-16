import { create } from 'zustand'
import { DEMO, DT_ENTRIES } from '../sim/scenarios'

export interface DtEntry {
  reasonId: string
  part?: string
  by?: string
  at: number
}

interface AppState {
  now: number
  /** Increments each time the presenter fires the power dip */
  dipSeq: number
  presenterOpen: boolean
  /** Maintenance jobs marked done during the session: machine id → time */
  maintDone: Record<string, number>
  /** Downtime reasons entered by staff during the session: stop id → entry */
  dtEntries: Record<string, DtEntry>
  tick: () => void
  triggerDip: () => void
  resetDemo: () => void
  togglePresenter: () => void
  markDone: (id: string) => void
  setDtReason: (stopId: string, entry: Omit<DtEntry, 'at'>) => void
}

const MIN = 60_000

export const useApp = create<AppState>((set, get) => ({
  now: Date.now(),
  dipSeq: 0,
  presenterOpen: false,
  maintDone: {},
  dtEntries: {},
  tick: () => set({ now: Date.now() }),
  triggerDip: () => {
    DEMO.dipAt = Date.now()
    set({ now: Date.now(), dipSeq: get().dipSeq + 1 })
  },
  resetDemo: () => {
    // Put the dip back to "a few minutes before the meeting"
    DEMO.dipAt = Date.now() - 6 * MIN
    for (const k of Object.keys(DT_ENTRIES)) delete DT_ENTRIES[k]
    set({ now: Date.now(), dipSeq: 0, maintDone: {}, dtEntries: {} })
  },
  togglePresenter: () => set({ presenterOpen: !get().presenterOpen }),
  markDone: (id) => set({ maintDone: { ...get().maintDone, [id]: Date.now() } }),
  setDtReason: (stopId, entry) => {
    const e = { ...entry, at: Date.now() }
    // The engine reads this registry for map notes
    DT_ENTRIES[stopId] = e
    set({ now: Date.now(), dtEntries: { ...get().dtEntries, [stopId]: e } })
  },
}))
