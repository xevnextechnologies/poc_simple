// Maintenance plan: Din's scheduled maintenance, driven by real running hours.
// Status → workload → proof the job worked; then alerts, a two-week planner,
// the job log, and the full schedule.
import clsx from 'clsx'
import ReactECharts from 'echarts-for-react'
import { CheckCircle2, HeartPulse, MapPin, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { hallById } from '../data/din'
import { LayerFrame } from '../components/layout/LayerFrame'
import { C, FONT, axisLabel, tooltipBase } from '../components/charts/theme'
import { Disclosure } from '../components/ui/structure'
import { IntervalBar, StatusDot, dateShort, dueText } from '../components/maintenance/parts'
import { fmt } from '../lib/format'
import { pkMidnight } from '../sim/engine'
import { MAINT_HEX, MAINT_WORD, allMaint, recentJobs, type MaintRecord, type MaintStatus } from '../sim/maintenance'
import { useApp } from '../store/app'
import { Card } from './MillToday'

const DAY = 86_400_000
const weekday = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', weekday: 'short' }).format(t)

export function MaintenancePlan() {
  const done = useApp((s) => s.maintDone)
  const list = useMemo(() => allMaint(done), [done])
  const jobs = useMemo(() => recentJobs(done), [done])

  return (
    <LayerFrame
      layer={4}
      title="Maintenance plan"
      subtitle="Din's scheduled maintenance, counted on each machine's real running hours from its meter. Machines showing signs of wear are flagged for an earlier service, and every job is checked afterwards."
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <StatusCard list={list} />
        <WorkloadCard list={list} />
        <AfterServiceCard jobs={jobs} />
      </div>

      <Block title="Needs attention" note="Late, due this week, or showing wear. Mark a job done when the team finishes it.">
        <Attention list={list} />
      </Block>

      <Block title="Next two weeks" note="Services falling due each day, on current running hours.">
        <Planner list={list} />
      </Block>

      <Block title="Recently done" note="Jobs finished in the last 14 days, with the machine's power use before and after.">
        <JobLog jobs={jobs} />
      </Block>

      <Block title="Full schedule" note={`All ${list.length} machines with a maintenance plan.`}>
        <Disclosure label={`Show all ${list.length} machines`} hideLabel="Hide the full schedule" className="-ml-3">
          <FullSchedule list={list} />
        </Disclosure>
      </Block>
    </LayerFrame>
  )
}

function Block({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display font-semibold text-[19px] leading-tight">{title}</h2>
      <p className="text-[13px] text-muted mt-1 mb-4">{note}</p>
      {children}
    </section>
  )
}

/* ------------------------------ top cards ------------------------------ */

function StatusCard({ list }: { list: MaintRecord[] }) {
  const counts: Record<MaintStatus, number> = { overdue: 0, soon: 0, ok: 0, done: 0 }
  list.forEach((r) => counts[r.status]++)
  const early = list.filter((r) => r.bringForward).length
  const order: MaintStatus[] = ['overdue', 'soon', 'ok', 'done']
  const option = {
    animation: false,
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: { name: string; value: number }) => `${p.name}: <b>${p.value}</b> machines` },
    graphic: [
      { type: 'text', left: 'center', top: '38%', style: { text: String(counts.overdue + counts.soon), fill: C.ink, font: `700 28px ${FONT}`, textAlign: 'center' } },
      { type: 'text', left: 'center', top: '56%', style: { text: 'due within 7 days', fill: C.muted, font: `12px ${FONT}`, textAlign: 'center' } },
    ],
    series: [
      {
        type: 'pie',
        radius: ['64%', '86%'],
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: order.filter((s) => counts[s] > 0).map((s) => ({ name: MAINT_WORD[s], value: counts[s], itemStyle: { color: MAINT_HEX[s] } })),
      },
    ],
  }
  return (
    <Card title="Schedule status" info="Every machine with a maintenance plan, by where it is in its service cycle." period="Now">
      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <ReactECharts option={option} style={{ height: 190 }} notMerge />
        <div className="space-y-2 pr-1 text-[12px]">
          {order.map((s) => (
            <div key={s} className="flex items-center gap-2">
              <StatusDot status={s} />
              <span className="text-muted w-[88px]">{MAINT_WORD[s]}</span>
              <b className="num">{counts[s]}</b>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1 border-t border-line">
            <HeartPulse size={11} className="text-warn" />
            <span className="text-muted w-[88px]">Bring forward</span>
            <b className="num">{early}</b>
          </div>
        </div>
      </div>
    </Card>
  )
}

function WorkloadCard({ list }: { list: MaintRecord[] }) {
  const today = pkMidnight(Date.now())
  const days = Array.from({ length: 14 }, (_, d) => today + d * DAY)
  const perDay = days.map((_, d) => list.filter((r) => r.status !== 'done' && Math.max(0, Math.floor(r.dueInDays)) === d).length)
  const total = perDay.reduce((s, x) => s + x, 0)
  const week = perDay.slice(0, 7).reduce((s, x) => s + x, 0)
  const option = {
    animation: false,
    grid: { left: 28, right: 8, top: 22, bottom: 24 },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: { dataIndex: number; value: number }[]) => `${dateShort(days[p[0].dataIndex])}: <b>${p[0].value}</b> jobs` },
    xAxis: { type: 'category', data: days.map((t, i) => (i === 0 ? 'Today' : dateShort(t))), axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { ...axisLabel, interval: 3 } },
    yAxis: { type: 'value', minInterval: 1, axisLabel, splitLine: { lineStyle: { color: C.line, type: 'dashed' } } },
    series: [
      {
        type: 'bar',
        barWidth: '58%',
        data: perDay.map((v, i) => ({ value: v, itemStyle: { color: i < 7 ? '#E0A100' : '#4FA67D', borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: 'top', fontFamily: FONT, fontSize: 11, fontWeight: 700, color: C.ink, formatter: (p: { value: number }) => (p.value ? String(p.value) : '') },
      },
    ],
  }
  return (
    <Card
      title="Jobs in the next 14 days"
      info="Services falling due each day on current running hours. Overdue jobs are counted on today."
      period="14 days"
      chips={
        <span className="text-muted">
          <b className="text-fg">{total}</b> jobs · <b className="text-warn">{week}</b> this week
        </span>
      }
    >
      <ReactECharts option={option} style={{ height: 190 }} notMerge />
    </Card>
  )
}

function AfterServiceCard({ jobs }: { jobs: ReturnType<typeof recentJobs> }) {
  const measured = jobs.filter((j) => !Number.isNaN(j.powerChange)).slice(0, 6)
  const avg = measured.reduce((s, j) => s + j.powerChange, 0) / Math.max(1, measured.length)
  const rows = [...measured].reverse()
  const option = {
    animation: false,
    grid: { left: 118, right: 48, top: 4, bottom: 4 },
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: { dataIndex: number }) => `<b>${rows[p.dataIndex].name}</b><br/>${rows[p.dataIndex].task}<br/>Power use ${fmt(rows[p.dataIndex].powerChange, 1)}% after service, same production` },
    xAxis: { type: 'value', show: false, min: 0, max: 4.5 },
    yAxis: { type: 'category', data: rows.map((j) => j.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisLabel, color: C.ink, fontSize: 12, width: 110, overflow: 'truncate' } },
    series: [
      {
        type: 'bar',
        barWidth: 12,
        data: rows.map((j) => ({ value: +Math.abs(j.powerChange).toFixed(1), itemStyle: { color: '#4FA67D', borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', fontFamily: FONT, fontSize: 11, fontWeight: 700, color: C.ink, formatter: (p: { value: number }) => `−${fmt(p.value, 1)}%` },
      },
    ],
  }
  return (
    <Card
      title="Power after service"
      info="For every job, Enervtek compares the machine's power use for the same production 3 days before and 3 days after. A good service lowers it."
      period="Last jobs"
      chips={
        <span className="text-muted">
          average <b className="text-brand num">{fmt(avg, 1)}%</b> power after service
        </span>
      }
    >
      <ReactECharts option={option} style={{ height: 190 }} notMerge />
    </Card>
  )
}

/* ------------------------------ needs attention ------------------------------ */

function Attention({ list }: { list: MaintRecord[] }) {
  const markDone = useApp((s) => s.markDone)
  const rank = (r: MaintRecord) => (r.status === 'overdue' ? 0 : r.bringForward ? 1 : 2)
  const items = list.filter((r) => r.status === 'overdue' || r.status === 'soon' || r.bringForward).sort((a, b) => rank(a) - rank(b) || a.dueInDays - b.dueInDays)
  return (
    <div className="card divide-y divide-line">
      {items.map((r) => {
        const why = r.status === 'overdue' ? 'Past its service interval' : r.bringForward ? `Health: ${r.bringForward}` : 'Service interval nearly used'
        const tone = r.status === 'overdue' ? MAINT_HEX.overdue : r.bringForward ? '#E0A100' : MAINT_HEX.soon
        return (
          <div key={r.id} className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_170px_auto] gap-x-6 gap-y-3 px-5 py-4 items-center">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 mt-0.5" style={{ background: `${tone}22`, color: tone }}>
                {r.bringForward && r.status !== 'overdue' ? <HeartPulse size={17} /> : <span className="w-2.5 h-2.5 rounded-full" style={{ background: tone }} />}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[15px]">{r.m.name}</div>
                <div className="text-[12px] text-muted truncate">
                  {r.task} · {hallById[r.m.hallId].short}
                </div>
                <div className="text-[12px] mt-1 font-semibold" style={{ color: tone }}>
                  {why}
                </div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[12px] mb-1.5">
                <span className="text-muted">Running hours used</span>
                <b className="num">{fmt(r.used * 100)}%</b>
              </div>
              <IntervalBar r={r} wide />
            </div>
            <div>
              <div className="font-display font-bold text-[16px]" style={{ color: r.status === 'ok' ? undefined : MAINT_HEX[r.status] }}>
                {dueText(r)}
              </div>
              <div className="text-[12px] text-muted">{r.team}</div>
            </div>
            <div className="flex gap-2 justify-end">
              <Link to={`/maintenance-map?m=${r.id}`} className="btn-ghost border border-line !h-8 !px-2.5 !text-[12px]" title="Show on the maintenance map">
                <MapPin size={13} />
              </Link>
              <button onClick={() => markDone(r.id)} className="btn-primary !h-8 !px-3 !text-[12px]">
                <CheckCircle2 size={13} /> Mark done
              </button>
            </div>
          </div>
        )
      })}
      {items.length === 0 && <div className="px-5 py-5 text-[14px] text-brand font-semibold">Everything is on schedule.</div>}
    </div>
  )
}

/* ------------------------------ two-week planner ------------------------------ */

function Planner({ list }: { list: MaintRecord[] }) {
  const today = pkMidnight(Date.now())
  const days = Array.from({ length: 14 }, (_, d) => today + d * DAY)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {days.map((t, d) => {
        const due = list.filter((r) => r.status !== 'done' && Math.max(0, Math.floor(r.dueInDays)) === d).sort((a, b) => a.dueInDays - b.dueInDays)
        const isToday = d === 0
        return (
          <div key={t} className={clsx('rounded-xl border px-3 py-2.5 min-h-[124px]', isToday ? 'bg-brand-dark text-white border-brand-dark' : d < 7 ? 'bg-panel border-line' : 'bg-sunken/60 border-line')}>
            <div className="flex items-baseline justify-between">
              <span className={clsx('text-[12px]', isToday ? 'text-white/70' : 'text-muted')}>{isToday ? 'Today' : weekday(t)}</span>
              <span className="font-display font-bold text-[15px]">{dateShort(t)}</span>
            </div>
            <div className={clsx('font-display font-bold text-[24px] leading-tight num', !due.length && (isToday ? 'text-white/40' : 'text-faint'))}>{due.length}</div>
            <div className="space-y-1 mt-1">
              {due.slice(0, 3).map((r) => (
                <Link
                  key={r.id}
                  to={`/maintenance-map?m=${r.id}`}
                  className={clsx('flex items-center gap-1.5 text-[11px] truncate hover:underline', isToday ? 'text-white' : 'text-fg')}
                  title={`${r.m.name}: ${r.task}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: MAINT_HEX[r.status] }} />
                  {r.m.name}
                </Link>
              ))}
              {due.length > 3 && <div className={clsx('text-[11px]', isToday ? 'text-white/70' : 'text-muted')}>+{due.length - 3} more</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------ job log ------------------------------ */

function JobLog({ jobs }: { jobs: ReturnType<typeof recentJobs> }) {
  const [all, setAll] = useState(false)
  const rows = all ? jobs : jobs.slice(0, 8)
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="py-2.5 pl-5 pr-3 font-semibold">Done</th>
            <th className="py-2.5 px-3 font-semibold">Machine</th>
            <th className="py-2.5 px-3 font-semibold">Job</th>
            <th className="py-2.5 px-3 font-semibold">By</th>
            <th className="py-2.5 px-3 font-semibold text-right">Hours</th>
            <th className="py-2.5 pr-5 pl-3 font-semibold text-right">Power after service</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id} className="border-b border-line last:border-0">
              <td className="py-2.5 pl-5 pr-3 text-muted whitespace-nowrap">{dateShort(j.at)}</td>
              <td className="py-2.5 px-3">
                <span className="font-semibold">{j.name}</span> <span className="text-muted text-[12px]">· {j.hall}</span>
              </td>
              <td className="py-2.5 px-3 text-muted">{j.task}</td>
              <td className="py-2.5 px-3 whitespace-nowrap">{j.team}</td>
              <td className="py-2.5 px-3 text-right num">{j.hours}</td>
              <td className="py-2.5 pr-5 pl-3 text-right whitespace-nowrap">
                {Number.isNaN(j.powerChange) ? (
                  <span className="text-muted">measuring for 3 days</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-brand num">
                    <CheckCircle2 size={13} /> {fmt(j.powerChange, 1)}%
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {jobs.length > 8 && (
        <button onClick={() => setAll(!all)} className="focus-ring w-full py-2.5 text-[13px] font-semibold text-brand border-t border-line hover:bg-mint/40">
          {all ? 'Show fewer' : `Show all ${jobs.length} jobs`}
        </button>
      )}
    </div>
  )
}

/* ------------------------------ full schedule ------------------------------ */

function FullSchedule({ list }: { list: MaintRecord[] }) {
  const [q, setQ] = useState('')
  const rows = list
    .filter((r) => !q.trim() || `${r.m.name} ${r.task} ${hallById[r.m.hallId].name}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.dueInDays - b.dueInDays)
  return (
    <div className="card overflow-hidden mt-1">
      <div className="px-5 py-3 border-b border-line">
        <label className="flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-sunken max-w-xs">
          <Search size={15} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a machine or job" className="bg-transparent outline-none text-[13px] flex-1 placeholder:text-faint" />
        </label>
      </div>
      <div className="overflow-auto max-h-[520px]">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead className="sticky top-0 bg-panel z-10">
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2.5 pl-5 pr-3 font-semibold">Machine</th>
              <th className="py-2.5 px-3 font-semibold">Job</th>
              <th className="py-2.5 px-3 font-semibold">Interval used</th>
              <th className="py-2.5 px-3 font-semibold">Last done</th>
              <th className="py-2.5 px-3 font-semibold">Next</th>
              <th className="py-2.5 pr-5 pl-3 font-semibold">Team</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="py-2 pl-5 pr-3">
                  <div className="flex items-center gap-2">
                    <StatusDot status={r.status} />
                    <span className="font-semibold">{r.m.name}</span>
                    {r.bringForward && <HeartPulse size={12} className="text-warn" />}
                  </div>
                  <div className="text-[11px] text-muted pl-[18px]">{hallById[r.m.hallId].name}</div>
                </td>
                <td className="py-2 px-3 text-muted">
                  {r.task}
                  <div className="text-[11px]">every {fmt(r.every)} h</div>
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <IntervalBar r={r} />
                    <span className="num text-[12px]">{fmt(r.used * 100)}%</span>
                  </div>
                </td>
                <td className="py-2 px-3 whitespace-nowrap text-muted">{dateShort(r.lastDone)}</td>
                <td className="py-2 px-3 whitespace-nowrap font-semibold" style={{ color: r.status === 'ok' ? undefined : MAINT_HEX[r.status] }}>
                  {dueText(r)}
                </td>
                <td className="py-2 pr-5 pl-3 whitespace-nowrap">{r.team}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
