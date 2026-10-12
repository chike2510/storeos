import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Check,
  Inbox,
  Instagram,
  MessageCircle,
  Package,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
} from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { ProductPreview } from '@/components/marketing/product-preview'
import { Reveal } from '@/components/marketing/reveal'

const FEATURES = [
  { icon: Package, title: 'Products & inventory', body: 'Prices, variants-ready catalogue and a stock ledger. Low-stock alerts before you run out.' },
  { icon: ShoppingBag, title: 'Orders', body: 'Record sales from DMs in seconds. Stock updates automatically and overselling is blocked.' },
  { icon: Users, title: 'Customers', body: 'Every buyer’s orders, spend and conversations in one profile — no more scrolling chats.' },
  { icon: Inbox, title: 'AI support inbox', body: 'StoreOS reads the message, pulls the order, and drafts the reply. Simple questions answer themselves.' },
  { icon: Sparkles, title: 'Product Studio', body: 'Snap a photo, get a title, description, tags and suggested price. Edit and publish.' },
  { icon: BarChart3, title: 'Analytics', body: 'Revenue over time, best sellers and order flow — the numbers you actually check.' },
]

const FAQ = [
  ['Do I need a website or Shopify?', 'No. Many sellers run entirely on Instagram and WhatsApp — StoreOS becomes your system of record. If you do use Shopify, StoreOS sits on top (sync is on the roadmap).'],
  ['Will the AI give away refunds?', 'Not unless you let it. You set an auto-refund limit; anything above it, and anything involving an unhappy customer, waits for a human. These rules are enforced on our server, not by the AI.'],
  ['Which currencies are supported?', 'Each workspace has its own currency — Naira by default, with US Dollar, Pound, Euro, Cedi, Shilling, Rand and more.'],
  ['Can my team use it?', 'Yes. Invite teammates as admins or staff. Only owners and admins can approve risky decisions or change policies.'],
]

export default function LandingPage() {
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-30 border-b border-zinc-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="StoreOS home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-zinc-600 md:flex">
            <a href="#features" className="hover:text-zinc-900">Features</a>
            <a href="#ai" className="hover:text-zinc-900">AI with guardrails</a>
            <a href="#pricing" className="hover:text-zinc-900">Pricing</a>
            <a href="#faq" className="hover:text-zinc-900">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <ButtonLink href="/login" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/signup" size="sm">
              Get started
            </ButtonLink>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(59,101,245,0.10),transparent_60%)]" />
          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pt-24">
            <Reveal className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> For Instagram, WhatsApp and Shopify sellers
              </span>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-6xl sm:leading-[1.05]">
                The operating system for your store
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600">
                Products, stock, orders, customers and support in one calm workspace — with an AI teammate that drafts replies and
                listings, and always asks before it touches money.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <ButtonLink href="/signup" size="lg">
                  Start free <ArrowRight className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink href="#features" variant="secondary" size="lg">
                  See how it works
                </ButtonLink>
              </div>
              <p className="mt-4 text-xs text-zinc-400">No card required · Sample data included</p>
            </Reveal>
            <Reveal delay={0.15} className="mx-auto mt-14 max-w-5xl">
              <ProductPreview />
            </Reveal>
          </div>
        </section>

        {/* Audiences */}
        <section className="border-y border-zinc-100 bg-zinc-50/60">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-16 sm:px-8 md:grid-cols-2">
            {[
              {
                icon: Instagram,
                title: 'Selling in the DMs?',
                body: 'Replace notebooks, spreadsheets and screenshots. StoreOS is your system of record: every order, payment status and delivery in one place.',
                points: ['Log an order from a chat in seconds', 'Know exactly what’s in stock', 'Answer “where’s my order?” instantly'],
              },
              {
                icon: Store,
                title: 'Running on Shopify?',
                body: 'Keep Shopify for checkout. Use StoreOS for the work around it: support triage, approvals, listings and a cleaner view of your customers.',
                points: ['Built to sync products, orders & customers', 'AI support with your refund rules', 'One inbox for every channel'],
              },
            ].map(a => (
              <Reveal key={a.title}>
                <div className="h-full rounded-2xl border border-zinc-200 bg-white p-7 shadow-card">
                  <a.icon className="h-6 w-6 text-brand-600" />
                  <h2 className="mt-4 text-xl font-semibold tracking-tight text-zinc-900">{a.title}</h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">{a.body}</p>
                  <ul className="mt-5 space-y-2">
                    {a.points.map(p => (
                      <li key={p} className="flex items-start gap-2 text-sm text-zinc-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
          <Reveal className="max-w-2xl">
            <p className="text-sm font-medium text-brand-700">Everything in one place</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">Run the whole business, not ten apps</h2>
            <p className="mt-4 text-lg text-zinc-600">Each module works on its own and shares one source of truth, so a sale updates stock, the customer profile and your reports at once.</p>
          </Reveal>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.04} className="bg-white p-7">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-zinc-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* AI guardrails */}
        <section id="ai" className="scroll-mt-20 bg-zinc-950 text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2">
            <Reveal>
              <p className="text-sm font-medium text-brand-300">AI with guardrails</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Automate the routine. Approve what matters.</h2>
              <p className="mt-4 text-lg leading-relaxed text-zinc-400">
                StoreOS classifies every message, pulls the customer’s orders and drafts a reply. Your policy — not the model — decides
                what sends on its own.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  ['Low risk sends itself', 'Delivery updates, sizing and stock questions are answered in seconds.'],
                  ['High risk waits for you', 'Refunds above your limit, angry customers and urgent issues go to Approvals.'],
                  ['Every decision is logged', 'Who approved what, when, and why — a durable audit trail.'],
                ].map(([t, b]) => (
                  <li key={t} className="flex gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
                    <span>
                      <span className="block font-medium">{t}</span>
                      <span className="text-sm text-zinc-400">{b}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold">KA</span>
                  <p className="rounded-2xl rounded-tl-sm bg-white/10 px-3.5 py-2 text-sm text-zinc-200">
                    The bag I received has a torn strap. Second time this has happened. I want a full refund today.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-zinc-900 p-4 text-sm">
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                    <span className="rounded-full bg-white/10 px-2 py-0.5">Refund request</span>
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-300">Urgency: high</span>
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200">Needs approval</span>
                  </div>
                  <p className="mt-3 text-zinc-300">
                    Refund of <span className="font-semibold text-white">₦65,000</span> on order #1031 exceeds your ₦5,000 auto-refund limit. Customer
                    has a prior complaint.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-zinc-900">Approve & send</span>
                    <span className="rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-zinc-300">Reject</span>
                  </div>
                </div>
                <div className="flex flex-row-reverse gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <p className="rounded-2xl rounded-tr-sm bg-brand-500 px-3.5 py-2 text-sm">
                    Hi Kemi, I’m so sorry — I’ve issued a full refund to your original payment method. You’ll see it in 3–5 working days.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-brand-700">Pricing</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">Free while we’re in early access</h2>
            <p className="mt-4 text-lg text-zinc-600">Paid plans are coming. Early stores keep a founder discount.</p>
          </Reveal>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {[
              { name: 'Starter', price: 'Free', note: 'during early access', points: ['1 workspace, 2 team members', 'Products, orders & customers', '100 AI replies / month'], cta: 'Start free', featured: false },
              { name: 'Growth', price: 'TBA', note: 'per month', points: ['Unlimited team members', 'Unlimited AI replies & listings', 'Approvals & audit log', 'Priority support'], cta: 'Join early access', featured: true },
              { name: 'Scale', price: 'TBA', note: 'per month', points: ['Multiple workspaces', 'Shopify sync', 'Custom policies & roles'], cta: 'Talk to us', featured: false },
            ].map(p => (
              <Reveal key={p.name}>
                <div className={`flex h-full flex-col rounded-2xl border p-7 ${p.featured ? 'border-zinc-900 shadow-pop' : 'border-zinc-200 shadow-card'}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-zinc-900">{p.name}</h3>
                    {p.featured ? <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white">Popular</span> : null}
                  </div>
                  <p className="mt-4">
                    <span className="text-4xl font-semibold tracking-tight text-zinc-900">{p.price}</span>
                    <span className="ml-1.5 text-sm text-zinc-500">{p.note}</span>
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5">
                    {p.points.map(pt => (
                      <li key={pt} className="flex items-start gap-2 text-sm text-zinc-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {pt}
                      </li>
                    ))}
                  </ul>
                  <ButtonLink href="/signup" variant={p.featured ? 'primary' : 'secondary'} className="mt-8 w-full">
                    {p.cta}
                  </ButtonLink>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-zinc-400">Plans and limits shown are placeholders and may change before launch.</p>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-zinc-100 bg-zinc-50/60">
          <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-zinc-900">Questions</h2>
            <div className="mt-10 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group px-6 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-zinc-900">
                    {q}
                    <span className="text-zinc-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-600">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-zinc-900 px-8 py-14 text-center sm:px-16">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(96,139,250,0.35),transparent_60%)]" />
            <div className="relative">
              <MessageCircle className="mx-auto h-8 w-8 text-brand-300" />
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Spend less time in the DMs.</h2>
              <p className="mx-auto mt-3 max-w-xl text-zinc-400">Set up your store in two minutes. Load sample data and look around — no card needed.</p>
              <ButtonLink href="/signup" size="lg" className="mt-8 bg-white text-zinc-900 hover:bg-zinc-100">
                Create your store <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-zinc-500 sm:flex-row sm:px-8">
          <Logo />
          <div className="flex gap-6">
            <a href="#features" className="hover:text-zinc-900">Features</a>
            <a href="#pricing" className="hover:text-zinc-900">Pricing</a>
            <Link href="/login" className="hover:text-zinc-900">Sign in</Link>
          </div>
          <p>© {new Date().getFullYear()} StoreOS</p>
        </div>
      </footer>
    </div>
  )
}
