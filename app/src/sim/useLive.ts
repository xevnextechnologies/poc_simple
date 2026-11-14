import { useMemo } from 'react'
import { useApp } from '../store/app'
import { snapshot } from './engine'

/** Live snapshot of the whole mill, refreshed every 2 seconds */
export function useLive() {
  const now = useApp((s) => s.now)
  const bucket = Math.floor(now / 2000) * 2000
  return useMemo(() => snapshot(bucket), [bucket])
}
