import clsx from 'clsx'
import { useEffect } from 'react'
import { Factory } from 'lucide-react'
import { CLEANING, isCleaning, pkParts, shiftAt } from '../../lib/time'
import { useApp } from '../../store/app'

export function TopBar() {
  const now = useApp((s) => s.now)
  const tick = useApp((s) => s.tick)

  useEffect(() => {
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [tick])

  const p = pkParts(new Date(now))
  const shift = shiftAt(p.hour)
  const cleaning = isCleaning(p.hour)

  return (
    <header className="h-16 shrink-0 flex items-center gap-4 px-6 border-b border-line bg-panel">
      <div className="flex items-center gap-3">
        <span className="w-8 h-8 rounded-lg bg-mint text-brand grid place-items-center">
          <Factory size={17} />
        </span>
        <div className="leading-tight">
          <div className="font-display font-semibold text-[15px]">Spinning mill</div>
          <div className="text-xs text-muted">Live demo</div>
        </div>
      </div>

      <div className="flex-1" />

      <span
        className={clsx(
          'inline-flex items-center gap-2 h-8 px-3 rounded-full text-[13px] font-semibold',
          cleaning ? 'bg-warn-bg text-warn' : 'bg-mint text-brand',
        )}
      >
        <span className={clsx('w-2 h-2 rounded-full', cleaning ? 'bg-warn' : 'bg-brand live-pulse')} />
        {cleaning ? `Night cleaning (${CLEANING.span})` : 'Live · production running'}
      </span>
      <span className="text-[13px] text-muted">
        <span className="font-semibold text-fg">{shift.label}</span> · {shift.span}
      </span>

      <div className="h-8 w-px bg-line" />

      <div className="text-right leading-tight">
        <div className="num font-display font-semibold text-[15px]">{p.time.slice(0, 5)}</div>
        <div className="text-xs text-muted">{p.date}</div>
      </div>
    </header>
  )
}
