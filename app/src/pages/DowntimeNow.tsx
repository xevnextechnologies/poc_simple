// Downtime now: which machines are stopped, why, and whether the fix is on
// time. Split into "needs your attention" and "being fixed, on time" so an
// owner sees in one look where to put pressure.
import clsx from 'clsx'
import { ClipboardEdit, Gauge, MapPin, Zap } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayerFrame } from '../components/layout/LayerFrame'
import { ProductionEffect, ReasonChip, ReasonForm, StatusWord, TimeBar } from '../components/downtime/parts'
import { fmt } from '../lib/format'
import { CLEANING, isCleaning, pkParts } from '../lib/time'
import { dur, monthStops, stoppedNow, sum, todayStops, where, type Stop } from '../sim/downtime'
import { useApp } from '../store/app'

const needsAttention = (s: Stop) => !s.reason || s.overMin > 0

export function DowntimeNow() {
  const now = useApp((s) => s.now)
  const entries = useApp((s) => s.dtEntries)
  const { hash } = useLocation()
  const focus = hash.replace('#', '')
  const [editing, setEditing] = useState<Stop | null>(null)

  const stops = useMemo(() => monthStops(now, entries), [now, entries])
  const live = stoppedNow(stops)
  const attention = live.filter(needsAttention).sort((a, b) => (a.reason ? 1 : 0) - (b.reason ? 1 : 0) || b.overMin - a.overMin)
  const onTrack = live.filter((s) => !needsAttention(s)).sort((a, b) => b.minutes - a.minutes)
  const done = todayStops(stops, now)
    .filter((s) => !s.ongoing)
    .sort((a, b) => b.end - a.end)

  const late = live.filter((s) => s.overMin > 0).length
  const missing = live.filter((s) => !s.reason).length
  const kgToday = sum(todayStops(stops, now), (s) => s.kg)
  const cleaning = isCleaning(pkParts(new Date(now)).hour)

  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => document.getElementById(`stop-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    return () => clearTimeout(t)
  }, [focus])

  return (
    <LayerFrame layer={1} title="Downtime now" subtitle="Machines that are stopped right now, why, and when they should be running again.">
      {/* The answer in one look */}
      <section className="card p-6 grid lg:grid-cols-[1fr_auto] gap-6 items-center">
        <div>
          <p className="font-display font-bold text-[26px] leading-tight">
            {live.length ? (
              <>
                <span className="text-alarm">{live.length} machines</span> are stopped right now.
              </>
            ) : (
              'Every production machine is running.'
            )}
          </p>
          <p className="text-[15px] text-muted mt-2">
            {attention.length
              ? `${attention.length} need${attention.length === 1 ? 's' : ''} your attention: ${[late && `${late} running late`, missing && `${missing} with no reason given`].filter(Boolean).join(', ')}. The rest are being fixed on time.`
              : live.length
                ? 'All of them are being fixed within their normal time.'
                : 'Nothing needs your attention.'}
          </p>
        </div>
        <div className="flex gap-3">
          <Big n={live.length} label="Stopped now" tone={live.length ? 'alarm' : 'brand'} />
          <Big n={late} label="Running late" tone={late ? 'alarm' : 'brand'} />
          <Big n={missing} label="No reason given" tone={missing ? 'warn' : 'brand'} />
          <Big n={`${fmt(kgToday)}`} unit="kg" label="Yarn not made today" tone="ink" />
        </div>
      </section>

      {cleaning && (
        <p className="mt-4 rounded-xl bg-warn-bg text-warn px-4 py-3 text-[14px] font-semibold">
          Night cleaning ({CLEANING.span}): production machines are stopped as planned. Cleaning is not counted as downtime.
        </p>
      )}

      {attention.length > 0 && (
        <Group title="Needs your attention" note="Running late, or nobody has said why the machine stopped." tone="alarm">
          {attention.map((s) => (
            <LiveRow key={s.id} s={s} focused={focus === s.machine.id} onEnter={() => setEditing(s)} />
          ))}
        </Group>
      )}

      {onTrack.length > 0 && (
        <Group title="Being fixed, on time" note="Still within the normal time for the job." tone="brand">
          {onTrack.map((s) => (
            <LiveRow key={s.id} s={s} focused={focus === s.machine.id} onEnter={() => setEditing(s)} />
          ))}
        </Group>
      )}

      <section className="mt-10">
        <h2 className="font-display font-semibold text-[20px] leading-tight">Back running today</h2>
        <p className="text-[14px] text-muted mt-1 mb-4">Stops since midnight that are already fixed.</p>
        <div className="card divide-y divide-line">
          {done.map((s) => (
            <div key={s.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_120px_130px] gap-x-6 gap-y-1 px-6 py-3.5 items-center text-[14px]">
              <div>
                <div className="font-semibold">{s.machine.name}</div>
                <div className="text-[12px] text-muted">{where(s.machine)}</div>
              </div>
              <div className="hidden md:block">
                <ReasonChip stop={s} onEnter={() => setEditing(s)} />
              </div>
              <div className="hidden md:block num">Stopped {dur(s.minutes)}</div>
              <div className="text-right">
                <StatusWord stop={s} />
              </div>
            </div>
          ))}
          {!done.length && <div className="px-6 py-8 text-center text-muted">No stops have finished yet today.</div>}
        </div>
      </section>

      <div className="mt-8 grid md:grid-cols-3 gap-x-8 gap-y-4 text-[13px] text-muted">
        <How icon={Gauge} title="The meter sees every stop">
          When a machine stops drawing power, the start and end of the stop are recorded. Nobody has to write it down.
        </How>
        <How icon={Zap} title="Power dips are named by themselves">
          If the supply dipped at the same moment, the stop is marked as a power dip.
        </How>
        <How icon={ClipboardEdit} title="Repairs are named by your staff">
          For a breakdown, the fitter or supervisor picks the reason and the part changed on a tablet.
        </How>
      </div>

      {editing && <ReasonForm stop={editing} onClose={() => setEditing(null)} />}
    </LayerFrame>
  )
}

function Big({ n, unit, label, tone }: { n: number | string; unit?: string; label: string; tone: 'alarm' | 'warn' | 'brand' | 'ink' }) {
  return (
    <div className="w-[118px] rounded-xl bg-sunken/70 px-4 py-3">
      <div className={clsx('font-display font-bold text-[30px] leading-none num', { alarm: 'text-alarm', warn: 'text-warn', brand: 'text-brand', ink: 'text-fg' }[tone])}>
        {n}
        {unit && <span className="text-[15px] font-semibold ml-1">{unit}</span>}
      </div>
      <div className="text-[12px] text-muted mt-1.5 leading-tight">{label}</div>
    </div>
  )
}

function Group({ title, note, tone, children }: { title: string; note: string; tone: 'alarm' | 'brand'; children: ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="font-display font-semibold text-[20px] leading-tight flex items-center gap-2.5">
        <span className={clsx('w-3 h-3 rounded-full', tone === 'alarm' ? 'bg-alarm' : 'bg-brand')} />
        {title}
      </h2>
      <p className="text-[14px] text-muted mt-1 mb-4">{note}</p>
      <div className="card divide-y divide-line">{children}</div>
    </section>
  )
}

function LiveRow({ s, focused, onEnter }: { s: Stop; focused: boolean; onEnter: () => void }) {
  return (
    <div id={`stop-${s.machine.id}`} className={clsx('grid lg:grid-cols-[minmax(230px,1fr)_minmax(0,2fr)_190px] gap-x-8 gap-y-4 px-6 py-5 items-center scroll-mt-6', focused && 'bg-mint/40')}>
      <div className="min-w-0">
        <div className="font-display font-semibold text-[19px] leading-tight">{s.machine.name}</div>
        <div className="text-[13px] text-muted mt-0.5">{where(s.machine)}</div>
        <div className="mt-2.5">
          <ReasonChip stop={s} onEnter={onEnter} />
        </div>
        {(s.part || s.by) && (
          <div className="text-[12px] text-muted mt-1">
            {[s.part, s.by].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      <TimeBar stop={s} />

      <div className="flex lg:flex-col items-end justify-between gap-2 lg:text-right">
        <ProductionEffect stop={s} />
        <Link to={`/map?m=${s.machine.id}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
          <MapPin size={13} /> On the map
        </Link>
      </div>
    </div>
  )
}

function How({ icon: Icon, title, children }: { icon: typeof Gauge; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon size={18} className="text-brand shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold text-fg">{title}</div>
        <div className="mt-0.5 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}
