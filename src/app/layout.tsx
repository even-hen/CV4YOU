import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/Providers'

export const metadata: Metadata = {
  title: { default: 'CV4YOU', template: '%s | CV4YOU' },
  description: 'Smart recruitment platform — AI-powered CV matching for modern recruiters.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" data-theme="hh" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                document.documentElement.setAttribute('data-theme', 'hh');
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
