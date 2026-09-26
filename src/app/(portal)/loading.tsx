import RouteSkeleton from '@/components/layout/RouteSkeleton'

// The boundary around every top-level section. Each section folder with pages
// of its own has another one (route-boundaries.test.ts), so a navigation
// inside a section commits at once too instead of freezing the page it left.
export default function Loading() {
  return <RouteSkeleton />
}
