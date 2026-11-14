import { useLocation } from 'react-router-dom'
import { LayerFrame } from '../components/layout/LayerFrame'
import { ALL_NAV, NAV } from '../components/layout/nav'
import { PageHeader } from '../components/ui/primitives'

/** Placeholder for modules built in the next steps. */
export function ModulePending() {
  const { pathname } = useLocation()
  const item = ALL_NAV.find((n) => pathname.startsWith(n.to))
  if (!item) return null
  const group = NAV.find((g) => g.items.includes(item))
  const body = (
    <div className="card h-[340px] grid place-items-center">
      <div className="text-center">
        <item.icon size={30} strokeWidth={1.75} className="mx-auto text-brand" />
        <div className="mt-3 font-display font-semibold text-[16px]">{item.label}</div>
        <div className="text-[13px] text-muted mt-1">Coming in the next build step</div>
      </div>
    </div>
  )
  if (group?.layer === 2)
    return (
      <LayerFrame layer={2} title={item.label} subtitle={item.blurb}>
        {body}
      </LayerFrame>
    )
  return (
    <>
      <PageHeader layer={group?.layer ? { n: group.layer, name: group.title } : undefined} title={item.label} subtitle={item.blurb} />
      {body}
    </>
  )
}
