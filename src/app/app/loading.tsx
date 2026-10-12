export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-7 w-48 rounded-md bg-zinc-200/70" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-zinc-100" />
        ))}
      </div>
      <div className="h-72 rounded-xl bg-zinc-100" />
    </div>
  )
}
