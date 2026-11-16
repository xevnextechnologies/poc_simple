import clsx from 'clsx'
import { AlertTriangle, Bot, MapPin, Presentation, RotateCcw, Timer, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../store/app'

/**
 * Presenter tools for the meeting:
 *  - Shift + D  fires the LT#2 power dip now (cards trip, alarm pops up)
 *  - Shift + P  opens the presenter panel
 *  - Shift + T  opens Downtime now
 * Plus the alarm pop-up that appears when the dip fires.
 */
export function DemoLayer() {
  const { dipSeq, presenterOpen, triggerDip, resetDemo, togglePresenter } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'd') triggerDip()
      else if (k === 'p') togglePresenter()
      else if (k === 't') navigate('/downtime')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [triggerDip, togglePresenter, navigate])

  return (
    <>
      <DipAlarm seq={dipSeq} />
      {presenterOpen && (
        <div className="fixed bottom-5 right-5 z-50 w-[300px] rounded-2xl bg-brand-dark text-white shadow-pop p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-display font-semibold">
              <Presentation size={16} /> Presenter
            </div>
            <button onClick={togglePresenter} className="w-7 h-7 grid place-items-center rounded-lg hover:bg-white/10" title="Close">
              <X size={15} />
            </button>
          </div>
          <div className="space-y-2 mt-3">
            <PBtn onClick={triggerDip} icon={Zap} label="Trigger power dip now" keys="Shift + D" strong />
            <PBtn onClick={() => navigate('/downtime')} icon={Timer} label="Downtime now" keys="Shift + T" />
            <PBtn onClick={resetDemo} icon={RotateCcw} label="Reset demo" />
          </div>
          <p className="text-[11px] text-white/55 mt-3 leading-relaxed">
            The dip trips Cards 05, 06 and 07 on LT#2. They come back by themselves over the next 17–26 minutes, as the sliver is reloaded. Shift + P hides this panel.
          </p>
        </div>
      )}
    </>
  )
}

function PBtn({ onClick, icon: Icon, label, keys, strong }: { onClick: () => void; icon: typeof Zap; label: string; keys?: string; strong?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2.5 h-10 px-3 rounded-lg text-[13px] font-semibold transition-colors',
        strong ? 'bg-brand-soft text-brand-dark hover:bg-white' : 'bg-white/10 hover:bg-white/20',
      )}
    >
      <Icon size={15} />
      <span className="flex-1 text-left">{label}</span>
      {keys && <span className={clsx('text-[11px] font-normal', strong ? 'text-brand-dark/60' : 'text-white/50')}>{keys}</span>}
    </button>
  )
}

function DipAlarm({ seq }: { seq: number }) {
  const [shown, setShown] = useState(0)
  const visible = seq > 0 && shown !== seq

  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setShown(seq), 25_000)
    return () => clearTimeout(t)
  }, [visible, seq])

  if (!visible) return null
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(Date.now())

  return (
    <div className="fixed top-20 right-5 z-50 w-[400px] rounded-2xl bg-panel border-2 border-alarm shadow-pop overflow-hidden animate-[slidein_.35s_ease-out]">
      <div className="bg-alarm text-white px-4 py-2.5 flex items-center justify-between">
        <span className="flex items-center gap-2 font-semibold text-[14px]">
          <AlertTriangle size={16} className="blink-soft" /> Alarm · Voltage dip on LT#2
        </span>
        <button onClick={() => setShown(seq)} className="w-6 h-6 grid place-items-center rounded hover:bg-white/20" title="Dismiss">
          <X size={14} />
        </button>
      </div>
      <div className="px-4 py-3">
        <div className="text-[14px]">
          Supply dropped for <b>80 ms</b> during a line changeover. <b>Cards 05, 06 and 07 tripped</b> at the same second.
        </div>
        <div className="text-[12px] text-muted mt-1">
          {time} · PQ analyser on LT#2 incomer · feeder “Card (4 to 09)” · 15th time in 30 days
        </div>
        <div className="flex gap-2 mt-3">
          <Link to="/map?m=CD-06" onClick={() => setShown(seq)} className="btn-primary !h-8 !px-3">
            <MapPin size={14} /> See on the map
          </Link>
          <Link to="/downtime" onClick={() => setShown(seq)} className="btn-ghost border border-line !h-8 !px-3">
            <Timer size={14} /> Downtime
          </Link>
          <Link to="/ask?about=card-trips" onClick={() => setShown(seq)} className="btn-ghost border border-line !h-8 !px-3">
            <Bot size={14} /> Why?
          </Link>
        </div>
      </div>
    </div>
  )
}
