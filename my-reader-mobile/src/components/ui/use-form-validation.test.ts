import { act, renderHook } from "@testing-library/react-native"
import { useFormValidation } from "./use-form-validation"

it("reveals errors on blur or submission, updates corrected fields, and exposes newly invalid dependencies", () => {
  const { result, rerender } = renderHook(
    ({ errors }: { errors: Record<string, string> }) =>
      useFormValidation(errors),
    {
      initialProps: {
        errors: { name: "Required", output: "Too large" } as Record<
          string,
          string
        >,
      },
    },
  )
  expect(result.current.field("name").error).toBeUndefined()
  act(() => result.current.field("name").onBlur())
  expect(result.current.field("name").error).toBe("Required")
  expect(result.current.field("output").error).toBeUndefined()
  act(() => {
    expect(result.current.validate()).toBe(false)
  })
  expect(result.current.field("output").error).toBe("Too large")
  rerender({ errors: {} })
  expect(result.current.field("output").error).toBeUndefined()
  act(() => {
    expect(result.current.validate()).toBe(true)
  })
  rerender({ errors: { output: "Too large" } })
  expect(result.current.field("output").error).toBe("Too large")
})
