// How each finding is being handled: Feature Validation doc §3.4
// (owner, status, due date) and §3.1 (observation vs possible cause).
export const STAGES = ['Found', 'Assigned', 'Inspected', 'Fixed', 'Confirmed'] as const

export interface Track {
  stage: number
  owner: string
  due: string
  found: string
  /** Possible causes: shown as unconfirmed until an engineer inspects */
  causes: string[]
  /** Checklist for whoever is assigned */
  steps: string[]
  /** Short line for the evidence chart */
  evidence: string
  /** Where the detail lives in layer 2 */
  link?: { to: string; label: string }
  /** Matching measure from the textile measure library */
  measure: { family: string; name: string; cost: string; payback: string; verify: string }
}

export const TRACK: Record<string, Track> = {
  'bearing-overrun': {
    stage: 0,
    owner: 'Maintenance manager',
    due: 'This month',
    found: 'This week',
    causes: [
      'Bearings and pullers are kept in the main store, so the machine waits while they are fetched',
      'Only one fitter per hall knows how to do the job',
      'No checklist, so the job is done differently each time',
    ],
    steps: [
      'Put a bearing kit (bearings, puller, grease) at each section',
      'Fitter logs the start and finish of each job on the tablet',
      'Enervtek compares the average bearing-change time next month',
    ],
    evidence: 'Every bearing change this month: time taken vs the normal time',
    link: { to: '/downtime-month', label: 'Downtime this month' },
    measure: { family: 'Maintenance', name: 'Spares kit at the section + job timing', cost: 'Low (spares already bought)', payback: 'Machines back sooner', verify: 'Average bearing-change time, month before vs after' },
  },
  'no-reason': {
    stage: 1,
    owner: 'Shift supervisors',
    due: 'From tomorrow',
    found: 'Today',
    causes: ['The reason is entered later and then forgotten', 'Supervisors are not sure which reason to pick'],
    steps: [
      'Enter the reason on the tablet before the machine restarts',
      'Use the short list of reasons, with the part changed for faults',
      'Enervtek shows the stops still missing a reason every morning',
    ],
    evidence: 'Stops with no reason entered, by section',
    link: { to: '/downtime', label: 'Downtime now' },
    measure: { family: 'Operations', name: 'Reason entry at restart', cost: 'None', payback: 'Every stop explained', verify: 'Share of stops with a reason, week by week' },
  },
  'card-trips': {
    stage: 0,
    owner: 'Electrical in-charge',
    due: 'This week',
    found: 'Today',
    causes: [
      'Supply gap of about 80 ms when load is moved between LT lines',
      'Card drive under-voltage protection set too tight',
    ],
    steps: [
      'Use the DEIF controllers to change over without a gap (synchronised transfer)',
      'Turn on "ride-through" in the card drive settings',
      'Enervtek counts trips for 2 weeks after the change to confirm',
    ],
    evidence: 'Power dips that stopped cards, last 30 days',
    link: { to: '/downtime', label: 'Downtime now' },
    measure: { family: 'Power supply', name: 'Gap-free changeover + drive ride-through', cost: 'Low (settings)', payback: 'Fewer card stops', verify: 'Trip count, 2 weeks before vs after' },
  },
  'lt2-harmonics': {
    stage: 0,
    owner: 'Electrical in-charge',
    due: 'Order reactors this month',
    found: '6 days ago',
    causes: [
      'PF.2 resonance near the 7th harmonic with 8 of 10 steps in (from T-2 2500 kVA, 6% Z)',
      'Card drives without DC chokes or line reactors',
      'More steps switch in at midday because solar supplies kW but not kVAR',
    ],
    steps: [
      'Replace failed steps with 7% detuned capacitor steps (tuned ≈ 189 Hz)',
      'Check card drives for DC chokes; fit 3–5% line reactors where missing',
      'Enervtek re-measures THDv, TDD and capacitor current after the work',
    ],
    evidence: 'LT#2 harmonic current vs IEEE 519 limits',
    measure: { family: 'Power factor', name: 'Detuned (7%) capacitor bank + drive chokes', cost: 'Medium (quote needed)', payback: 'Protects equipment', verify: 'THDv, TDD and capacitor current after the work' },
  },
  'ac-persistence': {
    stage: 0,
    owner: 'Utilities in-charge',
    due: 'This week',
    found: '2 days ago',
    causes: ['Night set-point changed back on the AC controller', 'Fan speed override left on after maintenance'],
    steps: ['Check and lock the night set-point', 'Note who can change it, and why', 'Enervtek confirms the saving is back within a week'],
    evidence: 'Ring AC 1+2 night power, week by week',
    measure: { family: 'Humidification', name: 'Night fan-speed set-point', cost: 'None', payback: 'Immediate', verify: 'Night kW vs baseline, temperature-adjusted' },
  },
  'restart-peak': {
    stage: 0,
    owner: 'Production manager',
    due: 'Before tonight’s cleaning',
    found: 'Yesterday',
    causes: ['All sections restart at 04:00 at the same moment', 'Motors draw extra current while starting, all in the same 15 minutes'],
    steps: [
      'Restart utilities and AC at 04:00, preparatory at 04:05, ring and winding at 04:10',
      'Keep the AC plants running through cleaning so they do not restart with everything else',
      'Enervtek shows the new peak the next morning',
    ],
    evidence: 'Grid demand from 03:00 to 08:00 today',
    measure: { family: 'Tariff & peak load', name: 'Staggered start-up after cleaning', cost: 'None', payback: 'Next bill', verify: 'Monthly maximum demand (MDI)' },
  },
  'compressor-night': {
    stage: 1,
    owner: 'Utilities in-charge',
    due: 'In 3 days',
    found: '5 days ago',
    causes: ['Compressor not switched off for cleaning', 'Air leaks on the autocone line keep it loading'],
    steps: [
      'Stop the autocone compressor at 01:00, restart at 03:50',
      'Leak walk on the autocone air line during cleaning (listen for hissing)',
      'Enervtek compares night energy before and after',
    ],
    evidence: 'Autocone compressor power over the last 24 hours',
    measure: { family: 'Compressed air', name: 'Shut down in non-production hours + leak walk', cost: 'None', payback: 'Immediate', verify: 'Night kWh, 2 weeks before vs after' },
  },
  'ring-34': {
    stage: 1,
    owner: 'Ring maintenance',
    due: 'Next doff',
    found: '10 days ago',
    causes: ['Worn or loose spindle tapes', 'Drafting rollers or bearings dragging', 'Suction fan filter blocked'],
    steps: [
      'Check spindle tape tension on all sections',
      'Check top-arm pressure and roller bearings',
      'Clean the suction fan filter',
    ],
    evidence: 'Units per kg: Ring Frame 34 vs its 7 sister frames',
    link: { to: '/health?m=RF-34', label: 'Machine health' },
    measure: { family: 'Motors & drives', name: 'Maintenance on a high-drift machine', cost: 'Low (parts only)', payback: 'Less wear, fewer breakdowns', verify: 'Units per kg vs sister frames' },
  },
  condenser: {
    stage: 1,
    owner: 'Blow room electrician',
    due: 'This week',
    found: '4 days ago',
    causes: ['Loose terminal or worn contactor on one phase', 'Winding insulation starting to weaken'],
    steps: ['Tighten and check terminals and contactor', 'Megger test the motor at the next stop', 'Enervtek tracks the imbalance daily'],
    evidence: 'Current imbalance between phases, last 3 weeks',
    link: { to: '/health?m=BR-L1-CN', label: 'Machine health' },
    measure: { family: 'Motors', name: 'Condition-based motor maintenance', cost: 'Low', payback: 'Avoids a breakdown', verify: 'Phase imbalance back under 3%' },
  },
  'lights-verified': {
    stage: 4,
    owner: 'Electrical in-charge',
    due: 'Done',
    found: '6 weeks ago',
    causes: ['Lights under skylights left on in daylight (confirmed)'],
    steps: ['Timer fitted on skylight rows ✓', 'Saving measured for 3 weeks ✓', 'Enervtek keeps checking it holds'],
    evidence: 'Mills Light feeder, daytime power, before and after the timer',
    measure: { family: 'Lighting', name: 'Daylight timer on skylight rows', cost: 'Rs 45,000', payback: '8 days', verify: 'Feeder kW 09:00–16:00, before vs after' },
  },
}
