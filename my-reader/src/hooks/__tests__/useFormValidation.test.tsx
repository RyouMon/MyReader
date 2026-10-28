import { desktopResources } from "@my-reader/i18n/desktop"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { createInstance } from "i18next"
import { useState, type ComponentProps } from "react"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { beforeEach, expect, it } from "vitest"
import { useFormValidation } from "../useFormValidation"

let i18n: ReturnType<typeof createInstance>

beforeEach(async () => {
  i18n = createInstance()
  await i18n.use(initReactI18next).init({
    resources: desktopResources,
    lng: "zh-CN",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  })
})

function TestForm(
  props: Pick<ComponentProps<"input">, "type" | "min" | "max">,
) {
  const [value, setValue] = useState("")
  const { fieldErrors, validationProps } = useFormValidation(value)
  return (
    <form {...validationProps}>
      <input
        {...props}
        id="value"
        aria-label="Value"
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <span role="status">{fieldErrors.value}</span>
    </form>
  )
}

it("uses the app language and retranslates visible errors when the language changes", async () => {
  render(
    <I18nextProvider i18n={i18n}>
      <TestForm />
    </I18nextProvider>,
  )
  const input = screen.getByRole("textbox")
  expect(screen.getByRole("status")).toBeEmptyDOMElement()
  fireEvent.blur(input)
  expect(screen.getByRole("status")).toHaveTextContent("此项为必填项")
  await act(async () => {
    await i18n.changeLanguage("en")
  })
  expect(screen.getByRole("status")).toHaveTextContent(
    "This field is required.",
  )
  fireEvent.change(input, { target: { value: "OpenAI" } })
  expect(screen.getByRole("status")).toBeEmptyDOMElement()
  await act(async () => {
    await i18n.changeLanguage("zh-CN")
  })
  expect(screen.getByRole("status")).toBeEmptyDOMElement()
})

it("localizes invalid URLs and clears the message after correction", () => {
  render(
    <I18nextProvider i18n={i18n}>
      <TestForm type="url" />
    </I18nextProvider>,
  )
  const input = screen.getByRole("textbox")
  fireEvent.change(input, { target: { value: "not-a-url" } })
  fireEvent.blur(input)
  expect(screen.getByRole("status")).toHaveTextContent("请输入有效的 URL")
  fireEvent.change(input, { target: { value: "https://example.com/v1" } })
  expect(screen.getByRole("status")).toBeEmptyDOMElement()
})

it.each([
  ["8191", "不能小于 8192"],
  ["32769", "不能大于 32768"],
  ["8192.5", "请输入整数"],
])("localizes numeric constraints for %s", (value, message) => {
  render(
    <I18nextProvider i18n={i18n}>
      <TestForm type="number" min={8192} max={32768} />
    </I18nextProvider>,
  )
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value } })
  fireEvent.blur(screen.getByRole("spinbutton"))
  expect(screen.getByRole("status")).toHaveTextContent(message)
})
