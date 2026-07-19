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
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const saved = localStorage.getItem('cv4you-theme') || 'light';
                document.documentElement.setAttribute('data-theme', saved);
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
