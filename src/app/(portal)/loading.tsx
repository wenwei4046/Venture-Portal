export default function PortalLoading() {
  return (
    <div className="page-enter">
      {/* Page header skeleton */}
      <div className="mb-10">
        <div className="skeleton h-10 w-64 mb-3" />
        <div className="skeleton h-5 w-96" />
      </div>

      {/* Hero section skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="skeleton h-4 w-32 mb-3" />
          <div className="skeleton h-16 w-72 mb-3" />
          <div className="skeleton h-3 w-48" />
        </div>
        <div className="lg:col-span-5 space-y-4">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="space-y-4">
        <div className="skeleton h-6 w-48 mb-6" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
    </div>
  )
}
