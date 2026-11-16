import type { LucideIcon } from 'lucide-react'
import { Bot, CalendarRange, HeartPulse, LayoutDashboard, Lightbulb, Map, Timer } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  blurb: string
}

export interface NavGroup {
  /** Layer number from the Enervtek deck (1 Monitoring, 2 Machine health, 3 AI) */
  layer?: number
  title: string
  promise?: string
  items: NavItem[]
}

// Simple version of the POC: monitoring and downtime, machine health, and the AI advisor.
export const NAV: NavGroup[] = [
  {
    layer: 1,
    title: 'Monitoring',
    promise: 'See every machine and every stop',
    items: [
      { to: '/today', label: 'Mill today', icon: LayoutDashboard, blurb: 'The whole mill on one screen' },
      { to: '/map', label: 'Mill map', icon: Map, blurb: 'Every machine, live, where it stands on the floor' },
      { to: '/downtime', label: 'Downtime now', icon: Timer, blurb: 'Machines stopped right now, why, and for how long' },
      { to: '/downtime-month', label: 'Downtime this month', icon: CalendarRange, blurb: 'Every stop this month and the production it cost' },
    ],
  },
  {
    layer: 2,
    title: 'Machine health',
    promise: 'Catch wear before a breakdown',
    items: [{ to: '/health', label: 'Machine health', icon: HeartPulse, blurb: 'Electrical signs of wear, before a breakdown' }],
  },
  {
    layer: 3,
    title: 'AI advisor',
    promise: 'Know what to fix',
    items: [
      { to: '/advisor', label: 'Recommendations', icon: Lightbulb, blurb: 'What to fix first, what it costs, and proof it worked' },
      { to: '/ask', label: 'Ask Enervtek', icon: Bot, blurb: 'Ask about your mill in plain words' },
    ],
  },
]

export const ALL_NAV = NAV.flatMap((g) => g.items)
