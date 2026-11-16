// The findings Enervtek shows the owner. Each one is written in plain words,
// tied to a real complaint from the site visit, and costed with the same model
// that drives the live screens.
import { SITE, machineById } from '../data/din'
import { DAY_CURVE, TARIFF } from './engine'
import { DEMO } from './scenarios'
import { SAVING_NOW_RS } from './costs'
import { byReason, dur, kgPerHour, monthStops, totals } from './downtime'

export type Kind = 'downtime' | 'problem' | 'waste' | 'verified'

export interface Insight {
  id: string
  kind: Kind
  /** Which of the three Enervtek layers found it */
  layer: 'Monitoring' | 'Performance & savings' | 'AI advisor'
  title: string
  plain: string
  machineIds: string[]
  where: string
  impact: string
  /** PKR per month: money lost or (for verified) saved */
  rsMonth: number
  /** kg of yarn lost per month (downtime findings) */
  kgMonth?: number
  nextStep: string
  /** What Din told us during the visit that this answers */
  heard: string
}

const fmtTime = (t: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }).format(t)

// Ring 34: extra kW × 21 production hours × 30 days × blended rate
const rf34 = machineById['RF-34']
const rf34ExtraKw = rf34.ratedKw * rf34.typicalLoad * 0.105
const BLENDED = 28

// Autocone compressor during cleaning: should idle at ~15%, runs at 62%
const cp = machineById['CP-02']
const cpWasteKw = cp.ratedKw * cp.typicalLoad * (0.62 - 0.15)
const cpRs = cpWasteKw * 3 * 30 * TARIFF.gridRs

// MDI: the 04:00 restart spike on grid vs sanctioned load
const restartPeak = Math.max(...DAY_CURVE.filter((s) => s.hour >= 4 && s.hour < 4.5).map((s) => s.grid))
const otherPeak = Math.max(...DAY_CURVE.filter((s) => s.hour < 4 || s.hour >= 4.5).map((s) => s.grid))
const MDI_RS_PER_KW = 1250 // indicative fixed charge per kW of max demand
export const MDI = {
  restartPeak,
  otherPeak,
  excessKw: restartPeak - otherPeak,
  rsMonth: (restartPeak - otherPeak) * MDI_RS_PER_KW,
}

// Downtime findings, from the same stop history as the downtime pages
const STOPS = monthStops(Date.now())
const BEARING = byReason(STOPS).find((r) => r.reason.id === 'bearing')!
const BEARING_OVER_KG = STOPS.filter((s) => s.reason?.id === 'bearing' && !s.ongoing).reduce((a, s) => a + (Math.min(s.overMin, s.lostMin) / 60) * kgPerHour(s.machine), 0)
const NO_REASON = STOPS.filter((s) => !s.reason)
const DIP_HOURS = STOPS.filter((s) => s.reason?.id === 'power-dip').reduce((a, s) => a + s.minutes, 0) / 60
export const DOWNTIME_FACTS = {
  bearing: BEARING,
  bearingOverKg: BEARING_OVER_KG,
  noReason: NO_REASON.length,
  noReasonHours: NO_REASON.reduce((a, s) => a + s.minutes, 0) / 60,
  totals: totals(STOPS),
}

const ALL_INSIGHTS: Insight[] = [
  {
    id: 'bearing-overrun',
    kind: 'downtime',
    layer: 'AI advisor',
    title: 'Bearing changes take twice as long as they should',
    plain: `This month there were ${BEARING.count} bearing changes across ring frames, cards, combers, simplex, autoconers and Open End. Each one took ${dur(BEARING.avgMin)} on average, against a normal time of ${dur(BEARING.reason.expectedMin)}. Belt and roller changes finish close to their normal time, so the delay is specific to bearings.`,
    machineIds: ['RF-12'],
    where: 'All sections · maintenance',
    impact: `${Math.round(BEARING.overHours)} machine hours over the normal time this month, about ${Math.round(BEARING_OVER_KG).toLocaleString('en-PK')} kg of production.`,
    rsMonth: 0,
    kgMonth: BEARING_OVER_KG,
    nextStep: 'Keep a bearing kit (bearings, pullers, grease) at each section, and have the fitter log the start and finish of every job on the tablet.',
    heard: 'Machine downtime, and how it affects production, is a pain point for us.',
  },
  {
    id: 'no-reason',
    kind: 'downtime',
    layer: 'Monitoring',
    title: `${NO_REASON.length} stops this month have no reason entered`,
    plain: `The meters caught every stop, but for ${NO_REASON.length} of them nobody entered why the machine stopped. Without a reason, Enervtek cannot say whether the stop took longer than it should, or which fault keeps coming back.`,
    machineIds: ['CD-21'],
    where: 'All sections · shift supervisors',
    impact: `${Math.round(NO_REASON.reduce((a, s) => a + s.minutes, 0) / 60)} hours of downtime with no cause recorded.`,
    rsMonth: 0,
    kgMonth: NO_REASON.reduce((a, s) => a + s.kg, 0),
    nextStep: 'Make the reason part of restarting the machine: the supervisor picks it on the tablet before the stop is closed.',
    heard: 'If there is downtime and a part is changed, the reason should be entered by the staff there.',
  },
  {
    id: 'card-trips',
    kind: 'problem',
    layer: 'Monitoring',
    // Getter: follows the presenter's "trigger dip now"
    get title() {
      return `3 cards stopped after a power dip at ${fmtTime(DEMO.dipAt)}`
    },
    plain:
      'The supply on LT#2 dropped for 80 milliseconds while load was moved between lines. The card drives on feeder "Card (4 to 09)" tripped at the same second, and the sliver broke.',
    machineIds: ['CD-05', 'CD-06', 'CD-07'],
    where: 'Preparatory Hall · LT#2',
    impact: `About 20 minutes of reloading per card. This happened 14 times in 30 days: about ${Math.round(DIP_HOURS)} hours of card time, plus sliver waste and re-piecing every time. The sliver in the cans kept the drawing frames going, but a longer dip would not.`,
    rsMonth: 0, // production loss, shown in kg and hours rather than a guessed price
    nextStep: 'Change over between lines without a supply gap (the DEIF controllers can do this) and set the card drives to ride through short dips.',
    heard: 'A few microseconds off-supply disrupts the inverters. After a jerk the sliver breaks and reloading takes 20 minutes.',
  },
  {
    id: 'ring-34',
    kind: 'problem',
    layer: 'Performance & savings',
    title: 'Ring Frame 34 uses 10% more power than its sister frames',
    plain:
      'Ring Frames 32 to 39 are identical (1,200 spindles) and run the same count. For the last 10 days, Frame 34 has needed 10.5% more units for every kg of yarn.',
    machineIds: ['RF-34'],
    where: 'Ring Hall 2 · LT#3&4',
    impact: `About ${Math.round(rf34ExtraKw * 21 * 30).toLocaleString('en-PK')} extra units a month.`,
    rsMonth: 0,
    nextStep: 'Check spindle tape tension, the drafting system and the suction fan on Frame 34 at the next doff.',
    heard: 'Engineers check every machine with a clamp meter every day to see if the load is right.',
  },
  {
    id: 'compressor-night',
    kind: 'waste',
    layer: 'Performance & savings',
    title: 'Autocone compressor runs during night cleaning',
    plain:
      'From 01:00 to 04:00 all autocones are stopped, but the 160 kW autocone compressor keeps running at 62% load. It should drop to idle.',
    machineIds: ['CP-02'],
    where: 'Compressor House · LT#3&4',
    impact: `About ${Math.round(cpWasteKw * 3 * 30).toLocaleString('en-PK')} units a month spent on air nobody uses, or on leaks.`,
    rsMonth: cpRs,
    nextStep: 'Set the compressor to stop during cleaning, and do a leak walk on the autocone air line.',
    heard: 'We want to save energy on this compressor, this component, without affecting production.',
  },
  {
    id: 'restart-peak',
    kind: 'waste',
    layer: 'AI advisor',
    title: 'Everything restarts at once after cleaning',
    plain: `At 04:00, after night cleaning, all machines start together. Grid demand jumps to ${Math.round(restartPeak).toLocaleString('en-PK')} kW, the highest of the day, and sets this month's maximum demand charge.`,
    machineIds: [],
    where: 'Whole mill · Grid supply',
    impact: `${Math.round(MDI.excessKw)} kW more maximum demand than any other time of day.`,
    rsMonth: MDI.rsMonth,
    nextStep: 'Restart in 3 groups, 5 minutes apart: utilities and AC first, then preparatory, then ring and winding.',
    heard: 'How often do you hit MDI? Do the machines start together?',
  },
  {
    id: 'condenser',
    kind: 'problem',
    layer: 'Monitoring',
    title: 'Blow room condenser motor shows early signs of trouble',
    plain:
      'The current on the three phases of the Line 1 condenser motor is 9% uneven, up from 3% three weeks ago. This usually comes before a motor burns out.',
    machineIds: ['BR-L1-CN'],
    where: 'Blow Room · LT#2',
    impact: 'Caught before a breakdown. A burnt motor here stops the whole blow room line.',
    rsMonth: 0,
    nextStep: 'Check the terminal connections and contactor on the condenser motor this week.',
    heard: 'The blow room has the most electrical faults. A team walks the floor looking for faults.',
  },
  {
    id: 'lt2-harmonics',
    kind: 'problem',
    layer: 'Performance & savings',
    title: 'Capacitor bank on LT#2 is being overloaded by harmonics',
    plain:
      'The card drives on LT#2 draw "dirty" current (5th and 7th harmonics). With 8 steps switched in, the PF.2 capacitor bank resonates near the 7th harmonic and amplifies it. Capacitor current is 134% of rated and two steps have already blown their fuses.',
    machineIds: [],
    where: 'LT#2 · PF.2 capacitor bank',
    impact: '2 capacitor steps failed in 30 days. Voltage distortion reaches 7% around midday, close to the 8% limit, which also makes drives trip more easily.',
    rsMonth: 0,
    nextStep: 'Fit 7% detuning reactors on PF.2 and check card drives for DC chokes.',
    heard: 'Carding inverters trip because they are sensitive to fluctuations. We want to read the behaviour of the inverter.',
  },
  {
    id: 'ac-persistence',
    kind: 'waste',
    layer: 'Performance & savings',
    title: 'A confirmed saving is slipping: Ring AC 1+2 at night',
    plain:
      'In August the Ring AC 1+2 fans were set to run slower at night, and the saving was confirmed in September. For the last 2 weeks night power has crept back up, and 18% of that saving is lost. The setting may have been changed back.',
    machineIds: ['HV-R12'],
    where: 'Utilities · LT#3&4',
    impact: 'Enervtek keeps watching fixes after they are done, so savings do not quietly disappear.',
    rsMonth: 134_400 - 110_200,
    nextStep: 'Check the night set-point on the AC controller and lock it.',
    heard: 'AC (humidification) is our third-heaviest load after ring and Open End.',
  },
  {
    id: 'lights-verified',
    kind: 'verified',
    layer: 'AI advisor',
    title: 'Daytime lighting in Ring Hall 2: saving confirmed',
    plain:
      'Enervtek flagged the "Mills Light" feeder running at full load in daylight. Lights near the skylights were put on a timer 3 weeks ago. Measured before and after.',
    machineIds: ['LT-01'],
    where: 'Mills Light feeder · LT#1',
    impact: 'Feeder dropped from 128 kW to 98 kW between 09:00 and 16:00.',
    rsMonth: (128 - 98) * 7 * 30 * BLENDED,
    nextStep: 'Done. Enervtek keeps checking that the saving holds.',
    heard: 'Data for future planning, not replacing the workers.',
  },
]

// The simple version shows only downtime and machine problems, with no prices
export const INSIGHTS = ALL_INSIGHTS.filter((i) => i.kind === 'downtime' || i.kind === 'problem')
export const insightById = Object.fromEntries(INSIGHTS.map((i) => [i.id, i]))
export const insightForMachine = (id: string) => INSIGHTS.find((i) => i.machineIds.includes(id))

export const OPEN_RS_MONTH = INSIGHTS.filter((i) => i.kind === 'waste').reduce((s, i) => s + i.rsMonth, 0)
/** Savings confirmed and still being achieved (from the savings ledger) */
export const VERIFIED_RS_MONTH = SAVING_NOW_RS
export const OPEN_FIXES = INSIGHTS.filter((i) => i.kind === 'waste').length
export { SITE }
