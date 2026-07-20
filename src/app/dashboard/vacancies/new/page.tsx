export const metadata = { title: 'Новая вакансия' }

import VacancyForm from '@/components/VacancyForm'

export default function NewVacancyPage() {
  return <VacancyForm mode="create" />
}
