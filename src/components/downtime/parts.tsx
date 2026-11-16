import clsx from 'clsx'
import { ClipboardEdit, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { GROUPS, REASONS, bufferOf, dur, type DtGroup, type Stop } from '../../sim/downtime'
import { reasonRgb } from '../ui/kit'

const NO_REASON_HEX = reasonRgb('none')
import { useApp } from '../../store/app'

/** The reason, as a coloured dot and a label. No reason: an amber "Reason needed". */
export function ReasonChip({ stop, onEnter }: { stop: Stop; onEnter?: () => void }) {
  if (!stop.reason) {
    return onEnter ? (
      <button onClick={onEnter} className="focus-ring inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-warn-bg text-warn text-[12px] font-semibold hover:brightness-95">
        <ClipboardEdit size={13} /> Reason needed
      </button>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: NO_REASON_HEX }} /> No reason entered
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: reasonRgb(stop.reason.group) }} />
      {stop.reason.label}
    </span>
  )
}

/** How long the machine has been down, against the standard time for the job */
export function TimeBar({ stop }: { stop: Stop }) {
  const exp = stop.expectedMin
  const scale = Math.max(stop.minutes, exp ?? stop.minutes * 1.3) * 1.12
  const within = exp != null ? Math.min(stop.minutes, exp) : stop.minutes
  const over = exp != null ? Math.max(0, stop.minutes - exp) : 0
  const pct = (v: number) => `${(v / scale) * 100}%`

  return (
    <div>
      <div className="relative h-3.5 rounded-full bg-sunken">
        <span className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: pct(within), background: exp != null ? '#4FA67D' : NO_REASON_HEX, borderTopRightRadius: over ? 0 : 999, borderBottomRightRadius: over ? 0 : 999 }} />
        {over > 0 && <span className="absolute inset-y-0 rounded-r-full bg-alarm" style={{ left: pct(within), width: pct(over) }} />}
        {exp != null && (
          <span className="absolute -top-1.5 -bottom-1.5 w-[2px] bg-fg/70 rounded" style={{ left: pct(exp) }} title={`Normal time ${dur(exp)}`} />
        )}
        {stop.ongoing && <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-panel border-2 border-fg/60" style={{ left: pct(stop.minutes) }} />}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 mt-2 text-[13px]">
        <span>
          {stop.ongoing ? 'Stopped for ' : 'Was stopped for '}
          <b className="num">{dur(stop.minutes)}</b>
          {exp != null && <span className="text-muted"> · this job normally takes {dur(exp)}</span>}
        </span>
        <StatusWord stop={stop} />
      </div>
    </div>
  )
}

/** One plain word on how the stop is going */
export function StatusWord({ stop }: { stop: Stop }) {
  const exp = stop.expectedMin
  if (exp == null) return <span className="text-warn font-semibold">Reason not given yet</span>
  const over = stop.minutes - exp
  if (stop.overMin > 0) return <b className="text-alarm num">{dur(stop.overMin)} late</b>
  if (stop.ongoing && over >= 0) return <span className="text-brand font-semibold">Should be back any minute</span>
  if (stop.ongoing) return <span className="text-brand font-semibold num">Back in about {dur(-over)}</span>
  return <span className="text-brand font-semibold">On time</span>
}

/**
 * What the stop means for production, in plain words.
 * Ring frames and Open End make yarn, so every minute stopped is yarn lost.
 * Earlier machines feed material forward; the machines after them keep
 * running on what is already made, for a while.
 */
export function ProductionEffect({ stop }: { stop: Stop }) {
  const buffer = bufferOf(stop.machine)
  if (stop.lostMin <= 0 && stop.ongoing) {
    return (
      <div>
        <div className="font-display font-bold text-[17px] text-brand leading-tight">Production not hit yet</div>
        <div className="text-[12px] text-muted mt-1 leading-snug">The next machines have material for about {dur(buffer - stop.minutes)} more</div>
      </div>
    )
  }
  return (
    <div>
      <div className="font-display font-bold text-[24px] num leading-none text-alarm">
        {Math.round(stop.kg).toLocaleString('en-PK')} <span className="text-[14px] font-semibold">kg</span>
      </div>
      <div className="text-[12px] text-muted mt-1">of yarn not made {stop.ongoing ? 'so far' : ''}</div>
    </div>
  )
}

const ENTRY_GROUPS: DtGroup[] = ['mechanical', 'electrical', 'material', 'planned']

/** The tablet form staff use to say why a machine stopped */
export function ReasonForm({ stop, onClose }: { stop: Stop; onClose: () => void }) {
  const setDtReason = useApp((s) => s.setDtReason)
  const [group, setGroup] = useState<DtGroup>('mechanical')
  const [reasonId, setReasonId] = useState<string | null>(null)
  const [part, setPart] = useState('')
  const [by, setBy] = useState('Shift supervisor')
  const reason = REASONS.find((r) => r.id === reasonId)
  const started = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }).format(stop.start)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = () => {
    if (!reasonId) return
    setDtReason(stop.id, { reasonId, part: part.trim() || undefined, by: by.trim() || undefined })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-brand-dark/40 grid place-items-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Why did ${stop.machine.name} stop?`} className="w-full max-w-[560px] rounded-2xl bg-panel shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="font-display font-bold text-[20px] leading-tight">Why did {stop.machine.name} stop?</h2>
            <p className="text-[13px] text-muted mt-1">
              The meter recorded the stop at {started} ({stop.ongoing ? `${dur(stop.minutes)} ago` : `down for ${dur(stop.minutes)}`}). Pick the reason.
            </p>
          </div>
          <button onClick={onClose} className="focus-ring w-8 h-8 grid place-items-center rounded-lg hover:bg-sunken text-muted shrink-0" title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex flex-wrap gap-1.5">
            {ENTRY_GROUPS.map((g) => (
              <button
                key={g}
                onClick={() => {
                  setGroup(g)
                  setReasonId(null)
                }}
                className={clsx(
                  'focus-ring inline-flex items-center gap-2 h-9 px-3 rounded-lg text-[13px] font-semibold border transition-colors',
                  group === g ? 'bg-brand-dark border-brand-dark text-white' : 'border-line hover:bg-sunken',
                )}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: reasonRgb(g) }} />
                {GROUPS[g].label}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-2 mt-3">
            {REASONS.filter((r) => r.group === group).map((r) => (
              <button
                key={r.id}
                onClick={() => setReasonId(r.id)}
                className={clsx(
                  'focus-ring text-left rounded-xl px-4 py-3 border-2 transition-colors',
                  reasonId === r.id ? 'border-brand bg-mint/60' : 'border-line hover:border-brand-soft',
                )}
              >
                <div className="font-semibold text-[14px]">{r.label}</div>
                <div className="text-[12px] text-muted">Normally takes {dur(r.expectedMin)}</div>
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            {reason?.askPart && (
              <label className="block text-[13px]">
                <span className="font-semibold">Part changed</span>
                <input value={part} onChange={(e) => setPart(e.target.value)} placeholder="e.g. Spindle bearing ×4" className="mt-1 w-full h-10 px-3 rounded-lg border border-line bg-panel focus-ring" />
              </label>
            )}
            <label className="block text-[13px]">
              <span className="font-semibold">Entered by</span>
              <input value={by} onChange={(e) => setBy(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-lg border border-line bg-panel focus-ring" />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 mt-4 border-t border-line">
          <span className="text-[12px] text-muted">Power dips are named by the meter. Faults need a person.</span>
          <button onClick={save} disabled={!reasonId} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
            Save reason
          </button>
        </div>
      </div>
    </div>
  )
}
