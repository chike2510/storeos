import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Unbounded, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const unbounded = Unbounded({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700', '800', '900'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'StoreOS — The AI that runs your store',
  description: 'Autonomous e-commerce operations powered by Qwen Cloud',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${unbounded.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-void text-foreground antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  )
}
