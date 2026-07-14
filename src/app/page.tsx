'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, Play, CheckCircle, Zap, Package, Activity, Bot } from 'lucide-react'
import Link from 'next/link'

// ─── Counter ──────────────────────────────────────────────────────────────────
function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [n, setN] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true
        let cur = 0; const steps = 55; const inc = to / steps
        const t = setInterval(() => {
          cur += inc; if (cur >= to) { setN(to); clearInterval(t) } else setN(Math.floor(cur))
        }, 1600 / steps)
      }
    })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [to])
  return <span ref={ref}>{n}{suffix}</span>
}

// ─── Magnetic wrapper ─────────────────────────────────────────────────────────
function Magnetic({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0); const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 260, damping: 20 })
  const sy = useSpring(y, { stiffness: 260, damping: 20 })
  const move = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    x.set((e.clientX - r.left - r.width / 2) * 0.3)
    y.set((e.clientY - r.top - r.height / 2) * 0.3)
  }
  const leave = () => { x.set(0); y.set(0) }
  return <motion.div ref={ref} style={{ x: sx, y: sy }} onMouseMove={move} onMouseLeave={leave}>{children}</motion.div>
}

// ─── Terminal preview ─────────────────────────────────────────────────────────
const SCRIPT: Array<{ text: string; type: string; delay: number }> = [
  { text: '$ storeos run --process customer-inbox', type: 'cmd', delay: 300 },
  { text: '', type: 'blank', delay: 200 },
  { text: '⟳  Reading customer message...', type: 'active', delay: 650 },
  { text: '✓  Classified: refund_request', type: 'success', delay: 750 },
  { text: '   └ confidence: 95%  ·  urgency: high', type: 'value', delay: 300 },
  { text: '', type: 'blank', delay: 180 },
  { text: '⟳  Generating embeddings  [text-embedding-v4]', type: 'active', delay: 800 },
  { text: '✓  Context: David Chen', type: 'success', delay: 700 },
  { text: '   └ 15 orders  ·  negative history', type: 'value', delay: 280 },
  { text: '', type: 'blank', delay: 180 },
  { text: '⟳  Consulting refund policies...', type: 'active', delay: 650 },
  { text: '⟳  Reasoning  [qwen-max]', type: 'active', delay: 950 },
  { text: '✓  Confidence: 61%', type: 'success', delay: 500 },
  { text: '   └ risk: high  ·  decision: escalate', type: 'value', delay: 300 },
  { text: '', type: 'blank', delay: 180 },
  { text: '!  Escalating → approval queue', type: 'escalate', delay: 450 },
  { text: '   └ awaiting merchant decision', type: 'muted', delay: 300 },
  { text: '', type: 'blank', delay: 180 },
  { text: '✓  3 / 5 messages auto-resolved', type: 'success', delay: 500 },
]

function TerminalPreview() {
  const [lines, setLines] = useState<{ text: string; type: string }[]>([])
  const [showCard, setShowCard] = useState(false)
  const [cursor, setCursor] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = []
    let cancelled = false

    function run() {
      if (cancelled) return
      setLines([]); setShowCard(false)
      let cum = 0
      SCRIPT.forEach((item, i) => {
        cum += item.delay
        timeouts.push(setTimeout(() => {
          if (cancelled) return
          setLines(p => [...p, { text: item.text, type: item.type }])
          if (i >= 15) setShowCard(true)
        }, cum))
      })
      timeouts.push(setTimeout(() => { if (!cancelled) run() }, cum + 3200))
    }

    timeouts.push(setTimeout(run, 600))
    const blink = setInterval(() => { if (!cancelled) setCursor(c => !c) }, 530)
    return () => { cancelled = true; timeouts.forEach(clearTimeout); clearInterval(blink) }
  }, [])

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines])

  return (
    <div className="relative">
      {/* Glow behind terminal */}
      <div className="absolute -inset-4 bg-blue-600/8 blur-3xl rounded-3xl pointer-events-none" />

      <div className="relative bg-[#0b0b0b] rounded-2xl border border-white/8 overflow-hidden font-mono text-[11px] leading-[1.7]">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 px-4 py-3 bg-white/3 border-b border-white/6">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-white/22 text-[10px] tracking-wide">storeos-agent — autopilot</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] text-emerald-400/60 tracking-wider">LIVE</span>
          </div>
        </div>

        {/* Output */}
        <div ref={containerRef} className="p-5 min-h-[300px] max-h-[380px] overflow-y-auto">
          {lines.map((line, i) => {
            if (line.type === 'blank') return <div key={i} className="term-blank" />
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.12 }}
                className={`term-${line.type}`}
              >
                {line.text}
              </motion.div>
            )
          })}

          {/* Blinking cursor */}
          <span className={`inline-block w-[7px] h-[13px] bg-emerald-400 align-middle ml-0.5 ${cursor ? 'opacity-100' : 'opacity-0'} transition-opacity`} />
        </div>

        {/* Approval card */}
        <AnimatePresence>
          {showCard && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="mx-4 mb-4 rounded-xl p-3.5 border border-orange-500/20 bg-orange-500/6"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-semibold tracking-widest text-orange-400 uppercase">Awaiting Approval</span>
                <span className="text-[9px] text-white/22">David Chen</span>
              </div>
              <p className="text-[10px] text-white/38 mb-3 leading-relaxed">
                Refund $67.50 · high risk · 15 orders · negative history
              </p>
              <div className="flex gap-2">
                <div className="flex-1 py-1.5 text-center text-[10px] font-semibold rounded-lg bg-blue-500/18 text-blue-400 border border-blue-500/18">
                  Approve & Send
                </div>
                <div className="flex-1 py-1.5 text-center text-[10px] text-white/22 rounded-lg bg-white/4 border border-white/6">
                  Reject
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Pipeline card ────────────────────────────────────────────────────────────
function PipelineCard({ num, Icon, title, model, desc, hex, d }: {
  num: string; Icon: any; title: string; model: string; desc: string; hex: string; d: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const rx = useMotionValue(0); const ry = useMotionValue(0)
  const srx = useSpring(rx, { stiffness: 240, damping: 26 })
  const sry = useSpring(ry, { stiffness: 240, damping: 26 })
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    rx.set(((e.clientY - r.top) / r.height - 0.5) * -12)
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 12)
  }
  const onLeave = () => { rx.set(0); ry.set(0) }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: d, type: 'spring', stiffness: 240, damping: 26 }}
      style={{ rotateX: srx, rotateY: sry, transformStyle: 'preserve-3d' }}
      onMouseMove={onMove} onMouseLeave={onLeave}
      className="relative bg-[#0e0e0e] border border-white/7 rounded-2xl p-6 overflow-hidden group cursor-default"
    >
      {/* Large number bg */}
      <span
        className="absolute -top-3 -right-2 font-display font-bold text-[80px] leading-none select-none pointer-events-none"
        style={{ color: `${hex}08` }}
      >{num}</span>

      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(circle at 30% 30%, ${hex}10 0%, transparent 65%)` }}
      />

      <div style={{ transform: 'translateZ(16px)' }} className="relative">
        {/* Icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center mb-5"
          style={{ backgroundColor: `${hex}14` }}
        >
          <Icon size={16} style={{ color: hex }} />
        </div>

        <p className="text-[10px] font-mono mb-1" style={{ color: `${hex}80` }}>{num} / {model}</p>
        <h3 className="text-sm font-display font-semibold text-white/85 mb-2 tracking-tight">{title}</h3>
        <p className="text-[13px] text-white/35 leading-relaxed">{desc}</p>
      </div>
    </motion.div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Landing() {
  return (
    <div className="relative min-h-screen bg-[#070707] overflow-x-hidden dot-grid">

      {/* Spotlight from top */}
      <div className="fixed inset-0 hero-spotlight pointer-events-none z-0" />
      <div className="noise-overlay" />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative z-20 flex items-center justify-between px-6 md:px-12 py-5 max-w-7xl mx-auto"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-display font-bold text-white tracking-tight">
            Store<span className="text-blue-400">OS</span>
          </span>
          <span className="hidden md:inline-flex items-center gap-1.5 text-[10px] font-mono text-white/20 border border-white/8 rounded-full px-2.5 py-1">
            <span className="w-1 h-1 rounded-full bg-emerald-400 inline-block" />
            Track 4 · Autopilot Agent
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-white/20 hidden md:block">Qwen Cloud Hackathon</span>
          <Link href="/dashboard">
            <motion.button
              whileHover={{ scaleX: 1.05, scaleY: 0.93, transition: { type: 'spring', stiffness: 600, damping: 14 } }}
              whileTap={{ scaleX: 0.96, scaleY: 1.05 }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold rounded-xl transition-colors duration-150 glow-blue"
            >
              Launch App <ArrowUpRight size={13} />
            </motion.button>
          </Link>
        </div>
      </motion.nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative z-10 min-h-[calc(100vh-80px)] flex items-center py-16 px-6 md:px-12">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 xl:gap-20 items-center">

            {/* Left: Headline */}
            <div>
              {/* Status */}
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex items-center gap-2 mb-8"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 status-dot" />
                <span className="font-mono text-[11px] text-white/25 uppercase tracking-widest">
                  Agent operating · Qwen Cloud
                </span>
              </motion.div>

              {/* Headline — oversized, editorial */}
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 250, damping: 26 }}
                className="font-display font-bold leading-[0.92] tracking-tight mb-7"
                style={{ fontSize: 'clamp(52px, 7vw, 108px)' }}
              >
                <span className="text-white/85">Run Your</span><br />
                <span className="text-white/85">Store On</span><br />
                <span className="text-blue-400 glow-text-blue">Autopilot.</span>
              </motion.h1>

              {/* Subtext */}
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22 }}
                className="text-base md:text-lg text-white/30 max-w-md leading-relaxed mb-9"
              >
                One AI agent handles customer messages, resolves disputes,
                generates product listings, and escalates only what needs you.
              </motion.p>

              {/* CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 }}
                className="flex flex-wrap items-center gap-3 mb-10"
              >
                <Magnetic>
                  <Link href="/dashboard">
                    <motion.button
                      whileHover={{
                        scaleX: 1.06, scaleY: 0.92,
                        transition: { type: 'spring', stiffness: 600, damping: 14 }
                      }}
                      whileTap={{ scaleX: 0.96, scaleY: 1.05 }}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl text-sm transition-colors duration-150 glow-blue"
                    >
                      <Play size={13} fill="white" />
                      See It Work
                    </motion.button>
                  </Link>
                </Magnetic>

                <a href="#pipeline">
                  <motion.button
                    whileHover={{
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.15), inset 0 0 20px rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.8)',
                      scale: 1.02,
                      transition: { type: 'spring', stiffness: 300, damping: 22 }
                    }}
                    whileTap={{ scale: 0.98 }}
                    className="px-6 py-3 border border-white/10 text-white/40 font-medium rounded-xl text-sm backdrop-blur-xl"
                  >
                    How it works
                  </motion.button>
                </a>
              </motion.div>

              {/* Model tags */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.38 }}
                className="flex items-center gap-2 flex-wrap"
              >
                <span className="text-[10px] text-white/18 font-mono">Powered by</span>
                {['qwen-max', 'text-embedding-v4', 'qwen-omni-turbo'].map(m => (
                  <span key={m} className="font-mono text-[9px] px-2 py-1 rounded-lg bg-white/4 border border-white/7 text-white/28">
                    {m}
                  </span>
                ))}
              </motion.div>
            </div>

            {/* Right: Terminal */}
            <motion.div
              initial={{ opacity: 0, x: 24, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 28 }}
            >
              <TerminalPreview />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-b border-white/6">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row">
            {[
              { value: 78, suffix: '%', label: 'Messages auto-resolved', color: 'text-blue-400' },
              { value: 4,  suffix: '',  label: 'Qwen models in pipeline', color: 'text-violet-400' },
              { value: 3,  suffix: 's', label: 'Avg. resolution time',    color: 'text-emerald-400' },
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 260, damping: 28 }}
                className={`flex-1 py-10 px-8 text-center ${i > 0 ? 'border-t sm:border-t-0 sm:border-l border-white/6' : ''}`}
              >
                <p className={`text-5xl md:text-6xl font-display font-bold tracking-tight mb-1.5 ${s.color}`}>
                  <Counter to={s.value} suffix={s.suffix} />
                </p>
                <p className="text-xs text-white/28 font-medium">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pipeline ──────────────────────────────────────────────────────── */}
      <section id="pipeline" className="relative z-10 py-28 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <p className="font-mono text-[10px] text-white/22 uppercase tracking-[0.2em] mb-4">
              The pipeline
            </p>
            <h2 className="font-display font-bold text-4xl md:text-5xl text-white/85 tracking-tight leading-tight">
              Four models.<br />
              <span className="text-blue-400">One seamless flow.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" style={{ perspective: 1200 }}>
            <PipelineCard num="01" Icon={Activity}     title="Classify Intent"   model="qwen-max"          desc="Reads any messy input — email, DM, WhatsApp — and identifies intent, urgency, and entities." hex="#3b82f6" d={0}    />
            <PipelineCard num="02" Icon={Bot}          title="Retrieve Context"  model="text-embedding-v4" desc="Semantic search over order history and customer profiles. Surfaces the right context instantly." hex="#8b5cf6" d={0.07} />
            <PipelineCard num="03" Icon={Zap}          title="Reason & Decide"   model="qwen-max"          desc="Reasons through resolution options, assigns a confidence score, and sets a risk level." hex="#06b6d4" d={0.14} />
            <PipelineCard num="04" Icon={CheckCircle}  title="Act or Escalate"   model="qwen-max"          desc="Low risk: response sent automatically. High risk: surfaces in your approval queue with full context." hex="#10b981" d={0.21} />
          </div>
        </div>
      </section>

      {/* ── Product Studio ─────────────────────────────────────────────────── */}
      <section className="relative z-10 py-20 px-6 md:px-12 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            >
              <p className="font-mono text-[10px] text-violet-400/60 uppercase tracking-[0.2em] mb-4">Product Studio</p>
              <h2 className="font-display font-bold text-4xl md:text-5xl text-white/85 tracking-tight leading-tight mb-5">
                Photo in.<br />
                <span className="text-violet-400">Full listing out.</span>
              </h2>
              <p className="text-white/30 text-base leading-relaxed mb-7 max-w-md">
                Drop any product photo. <span className="font-mono text-white/45 text-sm">qwen-omni-turbo</span> analyses the image and generates a complete listing — title, description, price range, and tags — in seconds.
              </p>
              {['Works with any photo quality', 'Price range, category, and SEO tags included', 'Publish-ready in under 10 seconds'].map((item, i) => (
                <div key={i} className={`flex items-center gap-3 ${i > 0 ? 'mt-3' : ''}`}>
                  <div className="w-4 h-4 rounded-full bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                    <CheckCircle size={10} className="text-violet-400" />
                  </div>
                  <span className="text-sm text-white/35">{item}</span>
                </div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 240, damping: 26, delay: 0.1 }}
              className="bg-[#0e0e0e] border border-white/7 rounded-2xl p-6"
            >
              {/* Simulated photo drop zone */}
              <div className="border border-dashed border-violet-500/15 rounded-xl p-8 text-center mb-5 bg-violet-500/3">
                <Package size={22} className="text-violet-400/25 mx-auto mb-2" />
                <p className="text-[11px] text-white/16 font-mono">product.jpg</p>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-base font-display font-semibold text-white/85 tracking-tight">Wireless Earbuds Pro Max</p>
                  <p className="text-sm text-violet-400 font-semibold mt-0.5">$45 – $75</p>
                </div>
                <p className="text-[11px] text-white/32 leading-relaxed">Premium wireless earbuds with active noise cancellation, 30-hour battery, and IPX5 water resistance.</p>
                <div className="flex flex-wrap gap-1.5">
                  {['#wireless', '#earbuds', '#anc', '#audio', '#tech'].map(t => (
                    <span key={t} className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-white/4 border border-white/7 text-white/25">{t}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <CheckCircle size={10} className="text-emerald-400" />
                  <span className="font-mono text-[9px] text-emerald-400/55">Generated in 4.2s · qwen-omni-turbo</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="relative z-10 py-28 px-6 text-center border-t border-white/5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 240, damping: 26 }}
          className="max-w-2xl mx-auto"
        >
          <p className="font-mono text-[10px] text-white/20 uppercase tracking-[0.2em] mb-6">Ready?</p>
          <h2 className="font-display font-bold text-5xl md:text-6xl text-white/85 tracking-tight leading-tight mb-5">
            Watch the agent<br />
            <span className="text-blue-400">run your store.</span>
          </h2>
          <p className="text-white/28 text-base leading-relaxed mb-10 max-w-md mx-auto">
            Hit Run Autopilot. Watch StoreOS handle five real customer messages — classify, reason, resolve — in real time.
          </p>

          <Magnetic>
            <Link href="/dashboard">
              <motion.button
                whileHover={{
                  scaleX: 1.05, scaleY: 0.93,
                  transition: { type: 'spring', stiffness: 600, damping: 14 }
                }}
                whileTap={{ scaleX: 0.96, scaleY: 1.05 }}
                className="inline-flex items-center gap-2 px-8 py-4 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl text-base transition-colors duration-150 glow-blue"
              >
                <Play size={15} fill="white" />
                Launch StoreOS
              </motion.button>
            </Link>
          </Magnetic>
        </motion.div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 py-8 px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <span className="font-display font-bold text-white/22 tracking-tight">
            Store<span className="text-blue-400/40">OS</span>
          </span>
          <p className="font-mono text-[10px] text-white/14">
            Global AI Hackathon · Qwen Cloud · Track 4: Autopilot Agent
          </p>
          <p className="font-mono text-[10px] text-white/14">chike2510</p>
        </div>
      </footer>
    </div>
  )
}
