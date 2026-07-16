'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play, Loader2, CheckCircle, AlertCircle, Clock,
  Package, MessageSquare, TrendingUp, Upload, Zap, Bot, Activity
} from 'lucide-react'
import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import { ClassifiedIntent, CustomerContext, Resolution, HumanCheckpoint, ProductListing } from '@/types'

// ─── Demo messages ────────────────────────────────────────────────────────────
const DEMO_MESSAGES = [
  "hi i ordered the wireless earbuds like 2 weeks ago and they still havent arrived?? order ORD-002. getting really annoyed",
  "The laptop stand I bought (ORD-004) broke after 3 days. I want my money back. This is unacceptable",
  "hey do you guys have the earbuds in white? and whats the return policy if i dont like them",
  "My account says delivered but I never got anything. Order ORD-001. Can someone help me ASAP",
  "just wanted to say the phone case arrived and i love it great packaging too",
]

// ─── Types ────────────────────────────────────────────────────────────────────
interface TermLine { text: string; type: 'cmd'|'success'|'active'|'value'|'escalate'|'muted'|'blank'; id: string }
interface ActivityItem { id: string; timestamp: Date; type: 'resolved'|'escalated'|'listed'|'error'; customer: string; intent: string; detail: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }
function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 5) return 'just now'; if (s < 60) return `${s}s ago`; return `${Math.floor(s / 60)}m ago`
}
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }

// ─── Terminal line component ──────────────────────────────────────────────────
function TermLine({ line }: { line: TermLine }) {
  if (line.type === 'blank') return <div className="h-2" />
  const cls = {
    cmd: 'term-cmd', success: 'term-success', active: 'term-active',
    value: 'term-value', escalate: 'term-escalate', muted: 'term-muted'
  }[line.type]
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.1 }}
      className={`${cls} leading-[1.75] text-[11px]`}
    >
      {line.text}
    </motion.div>
  )
}

// ─── Activity row ─────────────────────────────────────────────────────────────
function ActivityRow({ item }: { item: ActivityItem }) {
  const cfg = {
    resolved: { label: 'AUTO-RESOLVED', accent: 'text-emerald-400', border: 'border-l-emerald-500/50', bg: 'bg-emerald-500/5' },
    escalated: { label: 'ESCALATED',    accent: 'text-orange-400',  border: 'border-l-orange-500/50',  bg: 'bg-orange-500/5'  },
    listed:    { label: 'LISTED',       accent: 'text-violet-400',  border: 'border-l-violet-500/50',  bg: 'bg-violet-500/5'  },
    error:     { label: 'ERROR',        accent: 'text-red-400',     border: 'border-l-red-500/50',     bg: 'bg-red-500/5'     },
  }[item.type]
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className={`border-l-2 pl-3 py-2.5 ${cfg.border} ${cfg.bg} rounded-r-xl`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[9px] font-bold tracking-wider ${cfg.accent}`}>{cfg.label}</span>
            <span className="text-[9px] text-white/18 font-mono">· {item.intent.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-xs font-display font-semibold text-white/75 leading-snug">{item.customer}</p>
          <p className="text-[10px] text-white/28 mt-0.5 leading-relaxed">{item.detail}</p>
        </div>
        <span className="font-mono text-[9px] text-white/18 flex-shrink-0">{timeAgo(item.timestamp)}</span>
      </div>
    </motion.div>
  )
}

// ─── Metric card ──────────────────────────────────────────────────────────────
function Metric({ label, value, Icon, hex }: { label: string; value: string|number; Icon: any; hex: string }) {
  return (
    <div className="bento-card p-4 md:p-5 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{ background: `radial-gradient(circle at 20% 0%, ${hex}12, transparent 60%)` }}
      />
      <div className="relative flex items-center justify-between mb-4">
        <span className="text-[10px] text-white/28 font-mono uppercase tracking-wider">{label}</span>
        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${hex}18` }}>
          <Icon size={11} style={{ color: hex }} />
        </div>
      </div>
      <motion.p key={String(value)} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
        className="relative text-3xl font-display font-bold tracking-tight" style={{ color: hex }}>
        {value}
      </motion.p>
    </div>
  )
}

// ─── Flow connector between dashboard sections ────────────────────────────────
function FlowConnector({ height = 28 }: { height?: number }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="flow-line-v" style={{ height: height / 2 }} />
      <div className="flow-node-dot" />
      <div className="flow-line-v" style={{ height: height / 2 }} />
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [isRunning, setIsRunning] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [currentMsg, setCurrentMsg] = useState<string|null>(null)
  const [termLines, setTermLines] = useState<TermLine[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [checkpoints, setCheckpoints] = useState<HumanCheckpoint[]>([])
  const [metrics, setMetrics] = useState({ handled: 0, resolved: 0, escalated: 0 })
  const [cursor, setCursor] = useState(true)
  const [processingCheckpointId, setProcessingCheckpointId] = useState<string | null>(null)

  // Product studio
  const [imageFile, setImageFile] = useState<File|null>(null)
  const [imagePreview, setImagePreview] = useState<string|null>(null)
  const [listing, setListing] = useState<ProductListing|null>(null)
  const [listingLoading, setListingLoading] = useState(false)

  const termRef = useRef<HTMLDivElement>(null)
  // Guards the async autopilot loop against setState-after-unmount and lets
  // navigation away from the page actually stop in-flight API calls from
  // continuing to fire in the background.
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    return () => { cancelledRef.current = true }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setCursor(c => !c), 530)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [termLines])

  // ─── Terminal helpers ───────────────────────────────────────────────────
  function addLine(text: string, type: TermLine['type'] = 'muted') {
    if (cancelledRef.current) return
    setTermLines(p => [...p, { text, type, id: uid() }])
  }

  function safeSetTermLines(updater: (p: TermLine[]) => TermLine[]) {
    if (cancelledRef.current) return
    setTermLines(updater)
  }

  function addActivity(item: Omit<ActivityItem, 'id'|'timestamp'>) {
    if (cancelledRef.current) return
    setActivity(p => [{ ...item, id: uid(), timestamp: new Date() }, ...p].slice(0, 15))
  }

  // ─── Process one message ────────────────────────────────────────────────
  async function processMessage(msg: string) {
    if (cancelledRef.current) return
    setCurrentMsg(msg)
    setTermLines([])

    addLine(`$ storeos resolve --message "${msg.slice(0, 42)}..."`, 'cmd')
    addLine('', 'blank')

    try {
      // Classify
      addLine('⟳  Reading message...', 'active'); await delay(450)
      if (cancelledRef.current) return
      safeSetTermLines(p => p.map((l, i) => i === p.length - 1 ? { ...l, text: '✓  Message parsed', type: 'success' } : l))

      addLine('⟳  Classifying intent  [qwen-max]', 'active')
      const cr = await fetch('/api/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) })
      if (cancelledRef.current) return
      if (!cr.ok) throw new Error(`classify ${cr.status}`)
      const intent: ClassifiedIntent = await cr.json()
      safeSetTermLines(p => p.map((l, i) => i === p.length - 1 ? { ...l, text: `✓  Classified: ${intent.intent.replace(/_/g, '-')}`, type: 'success' } : l))
      addLine(`   └ confidence: ${Math.round(intent.confidence * 100)}%  ·  urgency: ${intent.urgency}`, 'value')
      addLine('', 'blank')

      // Embed
      addLine('⟳  Generating embeddings  [text-embedding-v4]', 'active')
      const er = await fetch('/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: msg, extractedEntities: intent.extractedEntities }) })
      if (cancelledRef.current) return
      if (!er.ok) throw new Error(`embed ${er.status}`)
      const { customer }: { customer: CustomerContext } = await er.json()
      safeSetTermLines(p => p.map((l, i) => i === p.length - 1 ? { ...l, text: `✓  Context loaded: ${customer.name}`, type: 'success' } : l))
      addLine(`   └ ${customer.totalOrders} orders  ·  ${customer.sentimentHistory} history`, 'value')
      addLine('', 'blank')

      // Think
      addLine('⟳  Consulting store policies...', 'active'); await delay(380)
      if (cancelledRef.current) return
      safeSetTermLines(p => p.map((l, i) => i === p.length - 1 ? { ...l, text: '✓  Policies reviewed', type: 'success' } : l))
      addLine('⟳  Analysing risk factors...', 'active'); await delay(380)
      if (cancelledRef.current) return
      safeSetTermLines(p => p.map((l, i) => i === p.length - 1 ? { ...l, text: '✓  Risk assessed', type: 'success' } : l))
      addLine('⟳  Reasoning  [qwen-max]', 'active')
      const tr = await fetch('/api/think', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intent, context: customer }) })
      if (cancelledRef.current) return
      if (!tr.ok) throw new Error(`think ${tr.status}`)
      const { resolution }: { resolution: Resolution } = await tr.json()
      const conf = resolution.riskLevel === 'low' ? 94 : resolution.riskLevel === 'medium' ? 76 : 58
      safeSetTermLines(p => p.map((l, i) => i === p.length - 1 ? { ...l, text: `✓  Decision: ${resolution.action.replace(/_/g, '-')}`, type: 'success' } : l))
      addLine(`   └ confidence: ${conf}%  ·  risk: ${resolution.riskLevel}`, 'value')
      addLine('', 'blank')

      // Act
      if (resolution.requiresHuman) {
        addLine('!  Risk threshold exceeded', 'escalate')
        addLine('   └ escalating → approval queue', 'escalate')
        const cp: HumanCheckpoint = {
          id: `chk-${uid()}`, eventId: `evt-${uid()}`, createdAt: new Date(),
          resolution, context: customer, intent, status: 'pending', agentDecision: resolution.draftResponse
        }
        await fetch('/api/checkpoint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkpoint: cp }) })
        if (cancelledRef.current) return
        setCheckpoints(p => [cp, ...p])
        setMetrics(m => ({ ...m, handled: m.handled + 1, escalated: m.escalated + 1 }))
        addActivity({ type: 'escalated', customer: customer.name, intent: intent.intent, detail: `${resolution.action.replace(/_/g,' ')} · ${resolution.riskLevel} risk` })
      } else {
        addLine('⟳  Drafting response  [qwen-max]', 'active'); await delay(420)
        if (cancelledRef.current) return
        safeSetTermLines(p => p.map((l, i) => i === p.length - 1 ? { ...l, text: '✓  Response sent automatically', type: 'success' } : l))
        setMetrics(m => ({ ...m, handled: m.handled + 1, resolved: m.resolved + 1 }))
        addActivity({ type: 'resolved', customer: customer.name, intent: intent.intent, detail: `${resolution.action.replace(/_/g,' ')} · response dispatched` })
      }

    } catch (err: any) {
      if (cancelledRef.current) return
      addLine(`!  Error: ${err?.message || 'unknown'}`, 'escalate')
      addActivity({ type: 'error', customer: 'Unknown', intent: 'error', detail: err?.message || 'Pipeline failed' })
    }
  }

  async function runAutopilot() {
    if (isRunning) return
    setIsRunning(true); setIsLive(true)
    for (const msg of DEMO_MESSAGES) {
      if (cancelledRef.current) break
      await processMessage(msg)
      if (cancelledRef.current) break
      await delay(800)
    }
    if (!cancelledRef.current) { setCurrentMsg(null); setIsRunning(false) }
  }

  async function handleCheckpoint(id: string, action: 'approved'|'rejected') {
    if (processingCheckpointId) return // guard against double-click race (M-1)
    setProcessingCheckpointId(id)
    try {
      await fetch('/api/checkpoint', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) })
      if (cancelledRef.current) return
      setCheckpoints(p => p.map(c => c.id === id ? { ...c, status: action } : c))
    } finally {
      if (!cancelledRef.current) setProcessingCheckpointId(null)
    }
  }

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  const MAX_FILE_SIZE = 5_000_000 // 5MB

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      addActivity({ type: 'error', customer: 'Product Studio', intent: 'error', detail: 'Unsupported file type — use JPG, PNG, WEBP, or GIF' })
      e.target.value = ''
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      addActivity({ type: 'error', customer: 'Product Studio', intent: 'error', detail: 'File too large — max 5MB' })
      e.target.value = ''
      return
    }
    setImageFile(file); setListing(null)
    const r = new FileReader(); r.onload = ev => setImagePreview(ev.target?.result as string); r.readAsDataURL(file)
  }

  async function generateListing() {
    if (!imageFile) return; setListingLoading(true)
    const r = new FileReader()
    r.onload = async ev => {
      try {
        const b64 = (ev.target?.result as string).split(',')[1]
        const res = await fetch('/api/vision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: b64, mimeType: imageFile.type }) })
        const { listing: l } = await res.json()
        setListing(l)
        addActivity({ type: 'listed', customer: l.title, intent: 'product_listing', detail: `${l.category} · ${l.suggestedPrice}` })
        setMetrics(m => ({ ...m, handled: m.handled + 1 }))
      } catch { addActivity({ type: 'error', customer: 'Vision', intent: 'error', detail: 'Image processing failed' }) }
      setListingLoading(false)
    }
    r.readAsDataURL(imageFile)
  }

  const rate = metrics.handled > 0 ? Math.round((metrics.resolved / metrics.handled) * 100) : 0
  const pending = checkpoints.filter(c => c.status === 'pending').length

  return (
    <div className="relative min-h-screen bg-[#070707] dot-grid">
      <div className="aurora-bg"><div className="aurora-orb aurora-orb-1"/><div className="aurora-orb aurora-orb-2"/><div className="aurora-orb aurora-orb-3"/></div>
      <div className="noise-overlay"/>

      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-7">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <motion.div initial={{ opacity:0, y:-14 }} animate={{ opacity:1, y:0 }} transition={{ type:'spring', stiffness:300, damping:30 }}
          className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 status-dot' : 'bg-white/15'}`} />
              <span className="font-mono text-[10px] text-white/22 uppercase tracking-widest">
                {isLive ? 'Agent operating' : 'Qwen Cloud · Autopilot Agent'}
              </span>
            </div>
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity">
                <Logo size={26} />
                <h1 className="font-display text-3xl font-bold tracking-tight text-white/90">
                  Store<span className="text-blue-400">OS</span>
                </h1>
              </div>
            </Link>
          </div>

          <motion.button
            whileHover={{ scaleX:1.04, scaleY:0.94, transition:{ type:'spring', stiffness:600, damping:14 } }}
            whileTap={{ scaleX:0.96, scaleY:1.05 }}
            onClick={runAutopilot} disabled={isRunning}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all
              ${isRunning ? 'bg-white/5 text-white/22 border border-white/7 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-400 text-white glow-blue'}`}
          >
            {isRunning ? <><Loader2 size={13} className="animate-spin"/>Agent running</> : <><Play size={13} fill="white"/>Run Autopilot</>}
          </motion.button>
        </motion.div>

        {/* ── Metrics ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Metric label="Handled"        value={metrics.handled}  Icon={MessageSquare} hex="#3b82f6" />
          <Metric label="Auto-Resolved"  value={metrics.resolved} Icon={CheckCircle}   hex="#10b981" />
          <Metric label="Resolve Rate"   value={`${rate}%`}       Icon={TrendingUp}    hex="#8b5cf6" />
          <Metric label="Needs Approval" value={pending}          Icon={AlertCircle}   hex="#f97316" />
        </div>

        {/* ── Execution Timeline (top of the flow) ─────────────────────────── */}
        <div className="bento-card overflow-hidden flex flex-col font-mono mb-1">

          {/* Title bar */}
          <div className="flex items-center gap-1.5 px-4 py-3 bg-white/2 border-b border-white/6 flex-shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"/>
            <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]"/>
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]"/>
            <span className="ml-3 text-[10px] text-white/22 tracking-wide">storeos-agent — autopilot</span>
            {isRunning && (
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"/>
                <span className="text-[9px] text-violet-400/60 tracking-wider">PROCESSING</span>
              </div>
            )}
          </div>

          {/* Current message */}
          <AnimatePresence mode="wait">
            {currentMsg && (
              <motion.div key={currentMsg} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                className="relative mx-4 mt-4 rounded-xl border border-white/7 bg-white/2 p-3 overflow-hidden flex-shrink-0">
                <div className="scan-line"/>
                <p className="text-[9px] text-white/18 uppercase tracking-wider mb-1">Processing</p>
                <p className="text-[10px] text-white/45 leading-relaxed line-clamp-2">{currentMsg}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Terminal output */}
          <div ref={termRef} className="flex-1 overflow-y-auto p-4 pt-3 min-h-[220px] max-h-[300px]">
            {termLines.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-10">
                <Bot size={20} className="text-white/10 mb-2"/>
                <p className="text-[11px] text-white/18">Agent standing by</p>
                <p className="text-[10px] text-white/10 mt-1">Hit Run Autopilot to start</p>
              </div>
            ) : (
              termLines.map(l => <TermLine key={l.id} line={l}/>)
            )}
            <span className={`inline-block w-[7px] h-[12px] bg-emerald-400 align-middle ml-0.5 transition-opacity ${cursor ? 'opacity-100':'opacity-0'}`}/>
          </div>

          {/* Model legend */}
          <div className="px-4 py-2.5 border-t border-white/5 flex items-center gap-3 flex-wrap flex-shrink-0">
            {[['qwen-max','text-blue-400/40'],['text-embedding-v4','text-violet-400/40'],['qwen-omni-turbo','text-cyan-400/40']].map(([m,c]) => (
              <span key={m} className={`text-[9px] font-mono ${c}`}>{m}</span>
            ))}
          </div>
        </div>

        <FlowConnector />

        {/* ── Live Activity | Approval Queue (always side-by-side) ─────────── */}
        <div className="grid grid-cols-2 gap-3 mb-1">

          {/* Activity feed */}
          <div className="bento-card overflow-hidden flex flex-col">
            <div className="px-3 md:px-4 py-3 border-b border-white/6 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Activity size={12} className="text-white/25 flex-shrink-0"/>
                <span className="text-[10px] md:text-[11px] font-display font-medium text-white/45 tracking-wide truncate">Live Activity</span>
              </div>
              {isLive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 status-dot flex-shrink-0"/>}
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 md:p-3 min-h-[200px] max-h-[320px]">
              {activity.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-8 text-center">
                  <Activity size={18} className="text-white/8 mb-2"/>
                  <p className="text-[10px] md:text-[11px] text-white/18">No activity yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activity.map(item => <ActivityRow key={item.id} item={item}/>)}
                </div>
              )}
            </div>
          </div>

          {/* Approval queue */}
          <div className="bento-card overflow-hidden flex flex-col">
            <div className="px-3 md:px-4 py-3 border-b border-white/6 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertCircle size={12} className="text-white/25 flex-shrink-0"/>
                <span className="text-[10px] md:text-[11px] font-display font-medium text-white/45 tracking-wide truncate">Approval Queue</span>
              </div>
              {pending > 0 && (
                <motion.span initial={{scale:0}} animate={{scale:1}}
                  className="font-mono text-[8px] md:text-[9px] px-1.5 md:px-2 py-0.5 rounded-full bg-orange-500/12 text-orange-400 border border-orange-500/20 font-semibold flex-shrink-0">
                  {pending}
                </motion.span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 md:p-3 min-h-[200px] max-h-[320px]">
              {checkpoints.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-6 text-center">
                  <Clock size={18} className="text-white/8 mb-2"/>
                  <p className="text-[10px] md:text-[11px] text-white/18">No pending</p>
                  <p className="text-[9px] md:text-[10px] text-white/10 mt-0.5 hidden sm:block">Risky decisions land here</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {checkpoints.map(cp => (
                    <motion.div key={cp.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
                      className={`rounded-xl p-2.5 md:p-3.5 border ${
                        cp.status==='pending'  ? 'bg-orange-500/5 border-orange-500/14' :
                        cp.status==='approved' ? 'bg-emerald-500/5 border-emerald-500/14' :
                        'bg-white/2 border-white/7'}`}>
                      <div className="flex items-start justify-between mb-2 gap-1">
                        <div className="min-w-0">
                          <p className="text-[11px] md:text-xs font-display font-medium text-white/80 truncate">{cp.context.name}</p>
                          <span className="font-mono text-[8px] md:text-[9px] text-white/22 truncate block">{cp.intent.intent.replace(/_/g,' ')}</span>
                        </div>
                        <span className={`font-mono text-[8px] md:text-[9px] px-1.5 md:px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ${
                          cp.status==='pending'  ? 'text-orange-400 bg-orange-500/10 border-orange-500/18' :
                          cp.status==='approved' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/18' :
                          'text-white/22 bg-white/4 border-white/8'}`}>
                          {cp.status}
                        </span>
                      </div>
                      <p className="text-[9px] md:text-[10px] text-white/35 leading-relaxed mb-2 line-clamp-2">{cp.resolution.reasoning}</p>
                      <div className="p-2 rounded-lg bg-white/2 border border-white/5 mb-2.5">
                        <p className="text-[8px] md:text-[9px] text-white/20 font-mono mb-0.5 uppercase tracking-wider">Draft response</p>
                        <p className="text-[9px] md:text-[10px] text-white/45 leading-relaxed line-clamp-2">{cp.resolution.draftResponse}</p>
                      </div>
                      {cp.status==='pending' && (
                        <div className="flex flex-col sm:flex-row gap-1.5 md:gap-2">
                          <motion.button
                            whileTap={{scale:0.97}}
                            onClick={()=>handleCheckpoint(cp.id,'approved')}
                            disabled={processingCheckpointId === cp.id}
                            aria-label={`Approve and send response to ${cp.context.name}`}
                            aria-busy={processingCheckpointId === cp.id}
                            className="flex-1 py-2 md:py-2.5 min-h-[40px] md:min-h-[44px] text-[10px] md:text-[11px] font-semibold rounded-xl bg-blue-500/14 hover:bg-blue-500/22 disabled:opacity-50 disabled:cursor-not-allowed text-blue-400 border border-blue-500/18 transition-all flex items-center justify-center gap-1.5">
                            {processingCheckpointId === cp.id
                              ? <Loader2 size={11} className="animate-spin" />
                              : 'Approve'}
                          </motion.button>
                          <motion.button
                            whileTap={{scale:0.97}}
                            onClick={()=>handleCheckpoint(cp.id,'rejected')}
                            disabled={processingCheckpointId === cp.id}
                            aria-label={`Reject resolution for ${cp.context.name}`}
                            aria-busy={processingCheckpointId === cp.id}
                            className="flex-1 py-2 md:py-2.5 min-h-[40px] md:min-h-[44px] text-[10px] md:text-[11px] font-semibold rounded-xl bg-white/3 hover:bg-white/6 disabled:opacity-50 disabled:cursor-not-allowed text-white/28 border border-white/7 transition-all">
                            Reject
                          </motion.button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <FlowConnector />

        {/* ── Product Studio (bottom of the flow) ───────────────────────────── */}
        <div className="bento-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-white/6 flex items-center gap-2 flex-shrink-0">
            <Package size={12} className="text-white/25"/>
            <span className="text-[11px] font-display font-medium text-white/45 tracking-wide">Product Studio</span>
            <span className="ml-auto font-mono text-[9px] text-white/16">qwen-omni-turbo</span>
          </div>
          <div className="flex-1 p-4 min-h-[160px]">
            {!listing ? (
              <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                <label className="flex-1 block cursor-pointer min-h-[110px]">
                  <div className={`h-full border border-dashed rounded-xl flex flex-col items-center justify-center transition-all duration-200 ${
                    imagePreview ? 'border-violet-500/25 bg-violet-500/4' : 'border-white/7 hover:border-white/14'}`}>
                    {imagePreview
                      ? <img src={imagePreview} alt="Uploaded product photo preview" className="max-h-24 rounded-lg object-contain"/>
                      : <><Upload size={18} className="text-white/12 mb-1.5"/><p className="text-[11px] text-white/18 font-display">Drop product photo</p></>
                    }
                  </div>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden"/>
                </label>
                {imageFile && (
                  <motion.button initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} whileTap={{scale:0.98}}
                    onClick={generateListing} disabled={listingLoading}
                    className="sm:w-44 flex items-center justify-center gap-2 py-2.5 text-[11px] font-semibold rounded-xl transition-all border bg-violet-500/12 hover:bg-violet-500/20 text-violet-300 border-violet-500/18 disabled:opacity-40 flex-shrink-0">
                    {listingLoading ? <><Loader2 size={11} className="animate-spin"/>Analysing...</> : <><Zap size={11}/>Generate Listing</>}
                  </motion.button>
                )}
              </div>
            ) : (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-2.5">
                <div>
                  <p className="text-sm font-display font-semibold text-white/85 tracking-tight leading-tight">{listing.title}</p>
                  <p className="text-xs text-violet-400 font-semibold mt-0.5">{listing.suggestedPrice}</p>
                </div>
                <p className="text-[10px] text-white/32 leading-relaxed">{listing.description}</p>
                <div className="flex flex-wrap gap-1">
                  {listing.tags.map((t,i) => <span key={i} className="font-mono text-[9px] px-1.5 py-0.5 rounded-full bg-white/4 border border-white/7 text-white/25">#{t}</span>)}
                </div>
                <button onClick={()=>{setListing(null);setImageFile(null);setImagePreview(null)}}
                  className="font-mono text-[10px] text-white/18 hover:text-white/40 transition-colors">
                  ← List another
                </button>
              </motion.div>
            )}
          </div>
        </div>

        <p className="text-center font-mono text-[9px] text-white/12 mt-7 tracking-wide">
          qwen-max · qwen-omni-turbo · text-embedding-v4
        </p>
      </div>
    </div>
  )
}
