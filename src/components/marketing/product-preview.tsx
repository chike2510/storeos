import { AlertTriangle, Check, Inbox, LayoutDashboard, Package, ShieldCheck, ShoppingBag, Sparkles, Users } from 'lucide-react'

/** Static, illustrative product screenshot built from markup (crisp at any size). */
export function ProductPreview() {
  const bars = [32, 45, 38, 52, 48, 61, 44, 58, 66, 54, 71, 63, 78, 69, 84, 76, 88, 81, 92, 86]
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_30px_80px_-20px_rgba(16,24,40,0.25)]">
      <div className="flex h-9 items-center gap-1.5 border-b border-zinc-100 bg-zinc-50 px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
        <span className="ml-3 hidden h-5 w-56 rounded bg-white text-[10px] leading-5 text-zinc-400 ring-1 ring-zinc-200 sm:block">
          &nbsp;app.storeos.com/app
        </span>
      </div>
      <div className="flex">
        <div className="hidden w-44 shrink-0 space-y-0.5 border-r border-zinc-100 bg-zinc-50 p-3 md:block">
          {[
            [LayoutDashboard, 'Overview', true],
            [Package, 'Products'],
            [ShoppingBag, 'Orders'],
            [Users, 'Customers'],
            [Inbox, 'Inbox'],
            [ShieldCheck, 'Approvals'],
            [Sparkles, 'Product Studio'],
          ].map(([Icon, label, active]) => {
            const I = Icon as typeof Package
            return (
              <div
                key={label as string}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium ${active ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-500'}`}
              >
                <I className="h-3 w-3" />
                {label as string}
                {label === 'Approvals' ? <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-[9px] text-amber-800">2</span> : null}
              </div>
            )
          })}
        </div>
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Revenue', '₦4.82M', '+18%'],
              ['Orders', '312', '+9%'],
              ['Avg. order', '₦15.4K', '+4%'],
              ['Open chats', '7', '2 to approve'],
            ].map(([l, v, d]) => (
              <div key={l} className="rounded-lg border border-zinc-100 p-2.5">
                <p className="text-[9px] text-zinc-500">{l}</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-900">{v}</p>
                <p className="text-[9px] font-medium text-emerald-600">{d}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
            <div className="rounded-lg border border-zinc-100 p-3">
              <p className="mb-2 text-[10px] font-semibold text-zinc-700">Sales · last 30 days</p>
              <div className="flex h-24 items-end gap-[3px]">
                {bars.map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-[2px] bg-brand-500/80" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                <p className="flex items-center gap-1 text-[10px] font-semibold text-amber-900">
                  <ShieldCheck className="h-3 w-3" /> Refund ₦62,000 · needs approval
                </p>
                <p className="mt-1 text-[9px] leading-snug text-amber-800">Above auto-refund limit · repeat complaint</p>
                <div className="mt-2 flex gap-1">
                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[9px] text-white">Approve</span>
                  <span className="rounded bg-white px-1.5 py-0.5 text-[9px] text-zinc-700 ring-1 ring-zinc-200">Reject</span>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-100 p-2.5">
                <p className="flex items-center gap-1 text-[10px] font-semibold text-zinc-800">
                  <AlertTriangle className="h-3 w-3 text-amber-600" /> Low stock
                </p>
                <p className="mt-1 text-[9px] text-zinc-500">Black soap bar · 3 left</p>
                <p className="text-[9px] text-zinc-500">Leather crossbody · 4 left</p>
              </div>
              <div className="rounded-lg border border-zinc-100 p-2.5">
                <p className="flex items-center gap-1 text-[10px] font-semibold text-zinc-800">
                  <Check className="h-3 w-3 text-emerald-600" /> 14 replies auto-sent today
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
