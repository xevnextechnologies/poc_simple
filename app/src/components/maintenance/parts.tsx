import clsx from 'clsx'
import { CheckCircle2, HeartPulse, Wrench, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { hallById } from '../../data/din'
import { fmt } from '../../lib/format'
import { MAINT_HEX, MAINT_WORD, type MaintRecord, type MaintStatus } from '../../sim/maintenance'
import { useApp } from '../../store/app'

export const dateShort = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short' }).format(t)

/** "in 3 days", "today", "overdue by 6 days", "done today" */
export function dueText(r: MaintRecord): string {
  if (r.status === 'done') return 'Done today'
  const d = Math.round(r.dueInDays)
  if (r.status === 'overdue') return `Overdue by ${Math.max(1, -d)} ${Math.abs(d) === 1 ? 'day' : 'days'}`
  if (d <= 0) return 'Due today'
  if (d === 1) return 'Due tomorrow'
  return `Due in ${d} days`
}

export function StatusDot({ status }: { status: MaintStatus }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: MAINT_HEX[status] }} />
}

/** Thin bar: how much of the service interval has been used */
export function IntervalBar({ r, wide }: { r: MaintRecord; wide?: boolean }) {
  const pct = Math.min(1.1, r.used)
  return (
    <div className={clsx('relative h-2 rounded-full bg-sunken', wide ? 'w-full' : 'w-28')}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(pct / 1.1) * 100}%`, background: MAINT_HEX[r.status] }} />
      <div className="absolute -top-1 -bottom-1 w-0.5 bg-fg/40 rounded" style={{ left: `${(1 / 1.1) * 100}%` }} title="Service due" />
    </div>
  )
}

export function MaintLegend({ counts }: { counts: Record<MaintStatus, number> }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(['overdue', 'soon', 'ok', 'done'] as MaintStatus[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-sunken text-[12px]">
          <StatusDot status={s} />
          {MAINT_WORD[s]}
          <b className="num">{counts[s]}</b>
        </span>
      ))}
    </div>
  )
}

export function MaintHover({ r, x, y }: { r: MaintRecord; x: number; y: number }) {
  return (
    <div className="absolute z-10 pointer-events-none card shadow-pop px-3.5 py-2.5 text-[12px] min-w-[220px]" style={{ left: x + 18, top: y + 64 }}>
      <div className="font-semibold text-[14px]">{r.m.name}</div>
      <div className="text-muted">{r.task}</div>
      <div className="flex items-center gap-2 mt-2">
        <StatusDot status={r.status} />
        <b>{dueText(r)}</b>
      </div>
      <div className="mt-2">
        <IntervalBar r={r} wide />
      </div>
      <div className="text-faint mt-1.5">Click for details</div>
    </div>
  )
}

export function MaintPanel({ r, onClose }: { r: MaintRecord; onClose?: () => void }) {
  const markDone = useApp((s) => s.markDone)
  const done = r.status === 'done'
  return (
    <div className="card overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-line">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[12px] text-muted">{hallById[r.m.hallId].name}</div>
            <h2 className="font-display font-bold text-[20px] leading-tight mt-0.5">{r.m.name}</h2>
            <span className="inline-flex items-center gap-1.5 mt-2 text-[12px] font-semibold" style={{ color: MAINT_HEX[r.status] }}>
              <StatusDot status={r.status} /> {MAINT_WORD[r.status]}
            </span>
          </div>
          {onClose && (
            <button onClick={onClose} className="focus-ring w-8 h-8 grid place-items-center rounded-lg hover:bg-sunken text-muted" title="Close">
              <X size={16} />
            </button>
          )}
        </div>
        {r.bringForward && (
          <div className="mt-3 rounded-lg bg-warn-bg text-warn px-3 py-2.5 text-[13px] flex gap-2">
            <HeartPulse size={15} className="shrink-0 mt-0.5" />
            <span>
              <b>Do it earlier:</b> {r.bringForward.toLowerCase()}.
            </span>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-b border-line">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Wrench size={14} className="text-brand" /> {r.task}
        </div>
        <div className="text-[12px] text-muted mt-0.5">Every {fmt(r.every)} running hours · {r.team}</div>
        <div className="mt-4">
          <div className="flex justify-between text-[12px] mb-1.5">
            <span className="text-muted">Running hours since last service</span>
            <b className="num">
              {fmt(r.hoursSince)} / {fmt(r.every)}
            </b>
          </div>
          <IntervalBar r={r} wide />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <div className="text-[12px] text-muted">Last done</div>
            <div className="font-display font-bold text-[18px]">{dateShort(r.lastDone)}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted">Next due</div>
            <div className="font-display font-bold text-[18px]" style={{ color: r.status === 'ok' || done ? undefined : MAINT_HEX[r.status] }}>
              {done ? `In ${Math.round(r.dueInDays)} days` : dueText(r)}
            </div>
            <div className="text-[12px] text-muted">{dateShort(r.dueAt)}</div>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 flex flex-col gap-2">
        {done ? (
          <div className="inline-flex items-center justify-center gap-2 h-9 rounded-lg bg-mint text-brand text-[13px] font-semibold">
            <CheckCircle2 size={15} /> Marked done. Enervtek will compare power use after the job.
          </div>
        ) : (
          <button onClick={() => markDone(r.id)} className="btn-primary justify-center">
            <CheckCircle2 size={15} /> Mark service done
          </button>
        )}
        <Link to={`/health?m=${r.id}`} className="btn-ghost border border-line justify-center">
          <HeartPulse size={15} /> Machine health
        </Link>
      </div>
    </div>
  )
}
