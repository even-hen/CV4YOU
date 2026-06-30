export const metadata = { title: 'New Vacancy' }

import VacancyForm from '@/components/VacancyForm'

export default function NewVacancyPage() {
  return <VacancyForm mode="create" />
}
