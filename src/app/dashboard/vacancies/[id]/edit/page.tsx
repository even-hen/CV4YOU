'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import VacancyForm, { type VacancyFormData } from '@/components/VacancyForm'
import { Loader2 } from 'lucide-react'

export default function EditVacancyPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [formData, setFormData] = useState<VacancyFormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/vacancies/${id}`)
      if (!res.ok) {
        setError('Vacancy not found.')
        setLoading(false)
        return
      }
      const v = await res.json()
      setFormData({
        company: v.company,
        role: v.role,
        responsibilities: v.responsibilities,
        baseRequirements: v.baseRequirements,
        mandatoryRequirements: v.mandatoryRequirements,
        niceToHave: v.niceToHave || '',
        requestedContacts: v.requestedContacts || [],
        salaryExpectation: v.salaryExpectation || '',
        knockoutQuestions: v.knockoutQuestions || [],
        linkEnabled: v.linkEnabled,
      })
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="empty-state"><div className="spinner" /></div>
  if (error) return <div className="empty-state">{error}</div>
  if (!formData) return null

  return <VacancyForm mode="edit" vacancyId={id} initialData={formData} />
}
