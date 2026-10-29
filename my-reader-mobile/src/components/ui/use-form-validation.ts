import { useState } from "react"

export function useFormValidation(errors: Record<string, string>) {
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)
  return {
    field: (id: string) => ({
      error: submitted || touched[id] ? errors[id] : undefined,
      onBlur: () => setTouched((current) => ({ ...current, [id]: true })),
    }),
    validate: () => {
      setSubmitted(true)
      return Object.keys(errors).length === 0
    },
  }
}
