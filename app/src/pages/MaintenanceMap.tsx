import { LayerFrame } from '../components/layout/LayerFrame'
import { MillMap } from './MillMap'

/** The mill map, coloured by where each machine is in its service cycle */
export function MaintenanceMap() {
  return (
    <LayerFrame
      layer={4}
      title="Maintenance map"
      subtitle="Every machine coloured by its service status. Click a hall to zoom in, or a machine to see its last service, what is next, and to mark a job done."
    >
      <MillMap variant="maintenance" />
    </LayerFrame>
  )
}
