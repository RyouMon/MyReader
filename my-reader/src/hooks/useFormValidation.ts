import { useLayoutEffect, useRef, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"

function fieldValidationMessage(input: HTMLInputElement, t: TFunction): string {
  const { validity } = input
  if (!input.willValidate || validity.valid) return ""
  if (validity.badInput) return t("formValidation.number")
  if (validity.valueMissing) return t("formValidation.required")
  if (validity.typeMismatch && input.type === "url")
    return t("formValidation.url")
  if (validity.rangeUnderflow)
    return t("formValidation.minimum", { min: input.min })
  if (validity.rangeOverflow)
    return t("formValidation.maximum", { max: input.max })
  if (validity.stepMismatch) return t("formValidation.integer")
  return t("formValidation.invalid")
}

export function useFormValidation(formValues: unknown) {
  const { t } = useTranslation()
  const formRef = useRef<HTMLFormElement>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  useLayoutEffect(() => {
    const next: Record<string, string> = {}
    let changed = false
    for (const [id, message] of Object.entries(fieldErrors)) {
      const input = formRef.current?.elements.namedItem(id)
      const current =
        input instanceof HTMLInputElement
          ? fieldValidationMessage(input, t)
          : ""
      if (current) next[id] = current
      if (current !== message || !current) changed = true
    }
    if (changed) setFieldErrors(next)
  }, [fieldErrors, formValues, t])
  const validate = (target: EventTarget) => {
    if (!(target instanceof HTMLInputElement) || !target.id) return
    const { id } = target
    const message = fieldValidationMessage(target, t)
    setFieldErrors((previous) =>
      previous[id] === message ? previous : { ...previous, [id]: message },
    )
  }
  return {
    fieldErrors,
    validationProps: {
      ref: formRef,
      onBlurCapture: (event: FormEvent<HTMLFormElement>) =>
        validate(event.target),
      onChangeCapture: (event: FormEvent<HTMLFormElement>) => {
        const target = event.target
        if (target instanceof HTMLInputElement && fieldErrors[target.id]) {
          validate(target)
        }
      },
      onInvalidCapture: (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        validate(event.target)
      },
    },
  }
}
