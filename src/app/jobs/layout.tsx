import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Apply for a Job — CV4YOU',
  description: 'Submit your CV and apply for this position',
}

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children
}
