import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Откликнуться на вакансию',
  description: 'Загрузите ваше резюме и отправьте отклик',
}

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children
}
