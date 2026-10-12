import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500'], display: 'swap' })

export const metadata: Metadata = {
  title: {
    default: 'StoreOS — The operating system for your store',
    template: '%s · StoreOS',
  },
  description:
    'StoreOS runs your products, inventory, orders, customers and support in one place — with an AI teammate that drafts replies and listings, and asks before it touches money.',
  openGraph: {
    title: 'StoreOS — The operating system for your store',
    description: 'Products, orders, customers and AI-assisted support in one calm workspace.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  )
}
