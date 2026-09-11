'use client'

import { useCallback, useEffect, useRef } from 'react'
import { getViewportForBounds, useReactFlow } from '@xyflow/react'
import { boundsOf, rectanglePoints, type Bounds } from '@/lib/hierarchy-spaces'

const motionDuration = (ms: number) => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : ms

/** Camera changes start after release; a new gesture always takes control back. */
export function useHierarchyCamera() {
  const canvas = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { getViewport, setViewport } = useReactFlow()

  const interrupt = useCallback(() => {
    generation.current++
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    // Stops an in-flight programmatic viewport tween at its current position.
    void setViewport(getViewport(), { duration: 0 })
  }, [getViewport, setViewport])
  useEffect(() => () => { generation.current++; if (timer.current) clearTimeout(timer.current) }, [])

  const fit = useCallback((bounds: Bounds, maximumZoom: number, token: number) => {
    const width = canvas.current?.clientWidth ?? 0, height = canvas.current?.clientHeight ?? 0
    if (token !== generation.current || !width || !height) return
    const next = getViewportForBounds(bounds, width, height, 0.15, maximumZoom, 0.15)
    void setViewport(next, { duration: motionDuration(400) })
  }, [setViewport])

  const makeRoom = useCallback((bounds: Bounds, token: number) => {
    const width = canvas.current?.clientWidth ?? 0, height = canvas.current?.clientHeight ?? 0
    if (token !== generation.current || !width || !height) return
    const view = getViewport(), margin = 24
    const left = bounds.x * view.zoom + view.x, top = bounds.y * view.zoom + view.y
    const right = (bounds.x + bounds.width) * view.zoom + view.x
    const bottom = (bounds.y + bounds.height) * view.zoom + view.y
    if (left >= margin && top >= margin && right <= width - margin && bottom <= height - margin) return
    fit(bounds, view.zoom, token)
  }, [fit, getViewport])

  const followTransfer = useCallback((before: Bounds, after: Bounds, token: number) => {
    if (token !== generation.current) return
    makeRoom(boundsOf([...rectanglePoints(before), ...rectanglePoints(after)]), token)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { timer.current = null; fit(after, 1.05, token) }, motionDuration(540))
  }, [fit, makeRoom])

  return { canvas, generation, interrupt, makeRoom, followTransfer }
}
