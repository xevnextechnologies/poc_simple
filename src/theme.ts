// Colour theme for the redesigned pages, the sidebar, the top bar and pop-ups.
// Leave exactly ONE line below uncommented, save, and the app recolours.
// The colours themselves live in src/index.css (search for "Themes").

export type Theme = 'midnight' | 'graphite' | 'navy' | 'obsidian' | 'porcelain' | 'frost' | 'ivory' | 'ember' | 'lagoon' | 'azure'

// export const THEME: Theme = 'midnight' //  Slate blue-black, teal accent. Control-room default.
// export const THEME: Theme = 'graphite' //  Neutral true black, emerald accent. Minimal, Vercel/Linear style.
// export const THEME: Theme = 'navy' //  Deep navy, aqua accent. Classic premium energy/SCADA look.
// export const THEME: Theme = 'obsidian' //  Warm charcoal, mint accent, gold warnings. Luxurious, soft.
// export const THEME: Theme = 'porcelain' //  Light: warm white panels, deep green accent. For bright rooms and print.
export const THEME: Theme = 'frost' //  Light: cool blue-grey, slate text, teal accent. Crisp SaaS look (Stripe/Linear light).
// export const THEME: Theme = 'ivory' //  Light: cream paper, forest green and brass. Editorial, report-like.
// export const THEME: Theme = 'ember' //  Warm near-black glass, orange glow accent. Fuselab-style energy dashboard.
// export const THEME: Theme = 'lagoon' //  Deep teal, bright cyan accent, yellow highlights. AI energy dashboard style.
// export const THEME: Theme = 'azure' //  Charcoal, sky-blue accent. Power BI style.

/* ---- Below: used by the presenter panel (Shift + P) to switch themes live. No need to edit. ---- */

/** All themes, with the swatch shown in the presenter panel */
export const THEMES: { id: Theme; label: string; light?: boolean; bg: string; accent: string }[] = [
  { id: 'midnight', label: 'Midnight', bg: '#0B0F14', accent: '#2DD4A0' },
  { id: 'graphite', label: 'Graphite', bg: '#09090B', accent: '#34D399' },
  { id: 'navy', label: 'Navy', bg: '#070C1A', accent: '#5EEAD4' },
  { id: 'obsidian', label: 'Obsidian', bg: '#0E0D0B', accent: '#6EE7B7' },
  { id: 'ember', label: 'Ember', bg: '#0B0908', accent: '#FF913C' },
  { id: 'lagoon', label: 'Lagoon', bg: '#081E1F', accent: '#38E8D8' },
  { id: 'azure', label: 'Azure', bg: '#14161A', accent: '#48ACFF' },
  { id: 'porcelain', label: 'Porcelain', light: true, bg: '#F5F4F0', accent: '#158056' },
  { id: 'frost', label: 'Frost', light: true, bg: '#F3F6FA', accent: '#0D9488' },
  { id: 'ivory', label: 'Ivory', light: true, bg: '#F9F7F1', accent: '#166534' },
]

/** Switch theme now (until the page is reloaded; the line above stays the default) */
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  window.dispatchEvent(new Event('themechange'))
}
export const currentTheme = () => (document.documentElement.dataset.theme as Theme) || THEME
