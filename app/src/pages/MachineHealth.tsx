import clsx from 'clsx'
import ReactECharts from 'echarts-for-react'
import { MapPin, X } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { HALLS, MACHINES, hallById, machineById } from '../data/din'
import { HandOff, LEVEL_UI, LayerFrame, LevelPill } from '../components/layout/LayerFrame'
import { C, FONT, axisLabel, tooltipBase } from '../components/charts/theme'
import { Disclosure, PageSummary, Section } from '../components/ui/structure'
import { fmt } from '../lib/format'
import { pkMidnight } from '../sim/engine'
import { HEALTH, HEALTH_LIST, INDICATORS, healthCounts, type HealthRecord, type Level } from '../sim/health'

const fmtVal = (key: string, v: number, unit: string) => `${fmt(v, key === 'pf' ? 2 : Number.isInteger(v) ? 0 : 1)}${unit}`

export function MachineHealth() {
  const [params, setParams] = useSearchParams()
  const counts = healthCounts()
  const act = HEALTH_LIST.filter((h) => h.level === 'act').sort((a, b) => a.score - b.score)
  const watch = HEALTH_LIST.filter((h) => h.level === 'watch').sort((a, b) => a.score - b.score)
  const sel = params.get('m')
  const selHealth = sel ? HEALTH[sel] : undefined

  /** Click the same machine again to close its analysis */
  const pick = (id: string | null) => {
    const next = id && id !== sel ? id : null
    setParams(next ? { m: next } : {}, { replace: true })
  }

  // Bring the opened analysis into view (also when arriving from another page)
  useEffect(() => {
    if (!sel) return
    const t = setTimeout(() => document.getElementById(`analysis-${sel}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
    return () => clearTimeout(t)
  }, [sel])

  /** Cards, with the open analysis placed straight after the selected card's row */
  const cards = (list: HealthRecord[], big: boolean) =>
    list.flatMap((h) => [
      <MachineCard key={h.id} h={h} open={sel === h.id} onClick={() => pick(h.id)} big={big} />,
      sel === h.id ? <Analysis key={`a-${h.id}`} h={h} onClose={() => pick(null)} /> : null,
    ])

  return (
    <LayerFrame
      layer={2}
      title="Machine health"
      subtitle="Machines wear out slowly. Enervtek checks 8 electrical signs on every machine, all the time, and flags the ones getting worse before they break down."
    >
      <PageSummary
        tone={counts.act ? 'act' : counts.watch ? 'watch' : 'ok'}
        headline={
          <>
            {counts.act} machines need a check this week. {counts.watch} more are worth watching.
          </>
        }
        detail={`The other ${counts.ok} machines show no signs of stress. All ${MACHINES.length} are checked every 5 seconds.`}
        facts={[
          { label: 'Healthy', value: String(counts.ok), tone: 'ok' },
          { label: 'Watch', value: String(counts.watch), tone: 'watch' },
          { label: 'Act now', value: String(counts.act), tone: 'act' },
        ]}
      />

      <Section n={1} title="Act now" tells="Getting worse quickly. Check these this week.">
        <div className="grid md:grid-cols-3 gap-4 [grid-auto-flow:row_dense]">{cards(act, true)}</div>
      </Section>

      <Section n={2} title="Worth watching" tells="Small changes. Plan a check at the next stop.">
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 [grid-auto-flow:row_dense]">{cards(watch, false)}</div>
      </Section>

      <Section n={3} title="Every machine at a glance" tells="Each square is one machine, grouped by hall. Click one to see its analysis.">
        <Fleet sel={sel ?? ''} pick={pick} />
        {selHealth && selHealth.level === 'ok' && (
          <div className="mt-4">
            <Analysis h={selHealth} onClose={() => pick(null)} />
          </div>
        )}
      </Section>

      <HandOff text="each flagged machine becomes a short job for your team, with the likely cause and a check that the fix worked." to="/advisor#condenser" label="See the jobs" />
    </LayerFrame>
  )
}

function MachineCard({ h, open, onClick, big }: { h: HealthRecord; open: boolean; onClick: () => void; big?: boolean }) {
  const m = machineById[h.id]
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      aria-controls={`analysis-${h.id}`}
      className={clsx(
        'focus-ring card text-left transition-shadow flex gap-4',
        big ? 'p-5 items-start' : 'px-4 py-3 items-center',
        open ? 'ring-2 ring-brand shadow-pop' : 'hover:shadow-pop',
      )}
    >
      <Score score={h.score} level={h.level} size={big ? 58 : 44} />
      <div className="min-w-0 flex-1">
        <div className={clsx('font-display font-semibold', big ? 'text-[17px]' : 'text-[14px]')}>{m.name}</div>
        <div className={clsx('text-muted mt-0.5', big ? 'text-[13px]' : 'text-[12px] line-clamp-1')}>{h.headline}</div>
        {big && <div className="text-[12px] text-faint mt-1.5">{hallById[m.hallId].name}</div>}
        <span className={clsx('inline-block font-semibold text-brand underline-offset-2 hover:underline', big ? 'text-[13px] mt-3' : 'text-[12px] mt-1')}>
          {open ? 'Hide analysis' : 'See detailed analysis'}
        </span>
      </div>
    </button>
  )
}

/** Full-width analysis panel that sits right under the card that opened it */
function Analysis({ h, onClose }: { h: HealthRecord; onClose: () => void }) {
  return (
    <div id={`analysis-${h.id}`} className="col-span-full scroll-mt-6">
      <Detail h={h} onClose={onClose} />
    </div>
  )
}

function Detail({ h, onClose }: { h: HealthRecord; onClose: () => void }) {
  const m = machineById[h.id]
  const ind = INDICATORS.find((i) => i.key === h.trendKey)
  const failing = INDICATORS.filter((i) => h.levels[i.key] && h.levels[i.key] !== 'ok')
  const normal = INDICATORS.filter((i) => h.levels[i.key] === 'ok')
  const mid = pkMidnight(Date.now())
  const dates = Array.from({ length: 42 }, (_, i) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short' }).format(mid - (41 - i) * 86_400_000))
  const color = h.level === 'act' ? C.alarm : C.warn

  const option =
    ind && h.trend
      ? {
          animation: false,
          grid: { left: 44, right: 16, top: 24, bottom: 28 },
          tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: number) => `${fmt(v, 1)}${ind.unit}` },
          xAxis: { type: 'category', boundaryGap: false, data: dates, axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { ...axisLabel, interval: 6 } },
          yAxis: { type: 'value', min: 0, max: Math.ceil(Math.max(ind.act * 1.2, ...h.trend) / 2) * 2, axisLabel: { ...axisLabel, formatter: `{value}${ind.unit}` }, splitLine: { lineStyle: { color: C.line } } },
          series: [
            {
              type: 'line',
              symbol: 'none',
              smooth: 0.3,
              lineStyle: { width: 3, color },
              areaStyle: { color: h.level === 'act' ? 'rgba(184,58,44,0.08)' : 'rgba(169,104,19,0.08)' },
              data: h.trend,
              markLine: {
                silent: true,
                symbol: 'none',
                data: [
                  { yAxis: ind.watch, lineStyle: { color: C.warn, type: 'dashed' }, label: { formatter: `Watch ${ind.watch}${ind.unit}`, position: 'insideEndTop', color: C.warn, fontFamily: FONT, fontSize: 11 } },
                  { yAxis: ind.act, lineStyle: { color: C.alarm, type: 'dashed' }, label: { formatter: `Act ${ind.act}${ind.unit}`, position: 'insideEndTop', color: C.alarm, fontFamily: FONT, fontSize: 11 } },
                ],
              },
            },
          ],
        }
      : null

  return (
    <div className="card overflow-hidden ring-2 ring-brand/30">
      <div className="flex items-center justify-between gap-3 px-6 py-3 bg-mint/60 border-b border-line">
        <span className="text-[13px] font-semibold text-brand-dark">Detailed analysis · {m.name}</span>
        <button onClick={onClose} className="focus-ring inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold text-muted hover:text-fg hover:bg-panel">
          <X size={14} /> Hide analysis
        </button>
      </div>
      <div className="grid lg:grid-cols-[1fr_1.4fr]">
        <div className="p-6 lg:border-r border-line">
          <div className="flex items-center gap-4">
            <Score score={h.score} level={h.level} size={64} />
            <div>
              <div className="font-display font-bold text-[20px] leading-tight">{m.name}</div>
              <div className="text-[13px] text-muted">{hallById[m.hallId].name}</div>
              <div className="mt-1.5">
                <LevelPill level={h.level} />
              </div>
            </div>
          </div>

          <div className="eyebrow mt-6 mb-2">
            {failing.length} of {failing.length + normal.length} checks outside normal
          </div>
          <div className="space-y-2">
            {failing.map((i) => (
              <div key={i.key} className={clsx('rounded-xl px-4 py-3', h.levels[i.key] === 'act' ? 'bg-alarm-bg' : 'bg-warn-bg')}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-[14px]">{i.label}</span>
                  <span className={clsx('font-display font-bold text-[18px] num', h.levels[i.key] === 'act' ? 'text-alarm' : 'text-warn')}>
                    {fmtVal(i.key, h.values[i.key]!, i.unit)}
                  </span>
                </div>
                <div className="text-[12px] text-muted">
                  {i.plain} Normal is {i.lowerIsWorse ? `above ${i.watch}` : `below ${i.watch}${i.unit}`}.
                </div>
              </div>
            ))}
          </div>

          {h.note && <p className="text-[13px] text-muted mt-4 leading-relaxed">{h.note}</p>}

          <Disclosure label={`Show the ${normal.length} normal checks`} hideLabel="Hide normal checks" className="mt-4 -ml-3">
            <div className="divide-y divide-line">
              {normal.map((i) => (
                <div key={i.key} className="flex justify-between py-1.5 text-[13px] pl-3">
                  <span>{i.label}</span>
                  <span className="num text-muted">{fmtVal(i.key, h.values[i.key]!, i.unit)}</span>
                </div>
              ))}
            </div>
          </Disclosure>

          <Link to={`/map?m=${m.id}`} className="btn-ghost border border-line mt-4">
            <MapPin size={14} /> See it on the map
          </Link>
        </div>

        <div className="p-6">
          {option ? (
            <>
              <div className="text-[15px] font-semibold">{ind!.label}, last 6 weeks</div>
              <div className="text-[13px] text-muted">{ind!.plain}</div>
              <ReactECharts option={option} style={{ height: 280 }} notMerge />
            </>
          ) : (
            <div className="h-full min-h-[200px] grid place-items-center text-[13px] text-muted text-center px-6">
              {h.level === 'ok'
                ? 'All 8 checks are normal. Nothing is changing, so there is no trend to show.'
                : 'No trend needed: the trips come from the power supply, not from wear in the machine.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Fleet({ sel, pick }: { sel: string; pick: (id: string) => void }) {
  return (
    <div className="card p-5">
      <div className="flex gap-4 text-[12px] text-muted mb-4">
        {(['ok', 'watch', 'act'] as Level[]).map((l) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: l === 'ok' ? '#BFE3CE' : LEVEL_UI[l].hex }} />
            {LEVEL_UI[l].label}
          </span>
        ))}
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        {HALLS.map((hall) => {
          const ms = MACHINES.filter((m) => m.hallId === hall.id)
          const issues = ms.filter((m) => HEALTH[m.id].level !== 'ok').length
          return (
            <div key={hall.id}>
              <div className="flex justify-between text-[13px] mb-2">
                <span className="font-semibold">{hall.name}</span>
                <span className={issues ? 'text-warn font-semibold' : 'text-muted'}>{issues ? `${issues} flagged` : 'All healthy'}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {ms.map((m) => {
                  const h = HEALTH[m.id]
                  return (
                    <button
                      key={m.id}
                      title={`${m.name}: ${LEVEL_UI[h.level].label} (${h.score}/100)`}
                      onClick={() => pick(m.id)}
                      className={clsx('w-5 h-5 rounded-[4px] transition-transform hover:scale-125', sel === m.id && 'ring-2 ring-offset-1 ring-brand-dark')}
                      style={{ background: h.level === 'ok' ? '#BFE3CE' : LEVEL_UI[h.level].hex }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Score({ score, level, size = 64 }: { score: number; level: Level; size?: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title="Health score out of 100">
      <svg viewBox="0 0 68 68" className="w-full h-full -rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#E2E8E3" strokeWidth="7" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={LEVEL_UI[level].hex} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-display font-bold num" style={{ fontSize: size * 0.3 }}>
        {score}
      </div>
    </div>
  )
}
