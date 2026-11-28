import { useCallback, useMemo, useState } from "react"

export function useFormValidation(errors: Record<string, string>) {
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)

  const touch = useCallback((id: string) => {
    setTouched((current) =>
      current[id] ? current : { ...current, [id]: true },
    )
  }, [])

  const errorFor = useCallback(
    (id: string) => (submitted || touched[id] ? errors[id] : undefined),
    [errors, submitted, touched],
  )

  const field = useCallback(
    (id: string) => ({
      error: submitted || touched[id] ? errors[id] : undefined,
      onBlur: () => touch(id),
    }),
    [errors, submitted, touch, touched],
  )

  const validate = useCallback(() => {
    setSubmitted(true)
    return Object.keys(errors).length === 0
  }, [errors])

  return useMemo(
    () => ({ field, errorFor, touch, validate }),
    [errorFor, field, touch, validate],
  )
}
