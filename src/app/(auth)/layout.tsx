import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Link href="/" className="w-fit">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-xs text-zinc-400">© {new Date().getFullYear()} StoreOS</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-zinc-200 bg-zinc-50 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,101,245,0.10),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-center px-12">
          <p className="text-sm font-medium text-brand-700">Run the whole store from one place</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-zinc-900">
            Orders, stock, customers and support — with an AI teammate that asks before it touches money.
          </h2>
          <ul className="mt-8 space-y-3 text-sm text-zinc-600">
            {[
              'Track inventory as orders come in from Instagram, WhatsApp or your website',
              'Draft support replies with full order context in seconds',
              'Refunds above your limit always wait for your approval',
            ].map(t => (
              <li key={t} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
