import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { VoiceSelect } from "../VoiceSelect"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

it("previews an unselected option without selecting it or dismissing the menu", async () => {
  const onValueChange = vi.fn()
  const onPreview = vi.fn()
  const onStopPreview = vi.fn()
  render(
    <VoiceSelect
      label="Voice"
      value="one"
      options={[
        { value: "one", label: "One" },
        { value: "two", label: "Two" },
      ]}
      previewVoiceId={null}
      onPreview={onPreview}
      onStopPreview={onStopPreview}
      onValueChange={onValueChange}
    />,
  )
  const user = userEvent.setup()
  fireEvent.mouseDown(screen.getByRole("combobox"))
  await user.click(
    screen.getByRole("button", { name: "settings.speech.previewAction · Two" }),
  )
  expect(onPreview).toHaveBeenCalledWith("two")
  expect(onValueChange).not.toHaveBeenCalled()
  expect(onStopPreview).not.toHaveBeenCalled()
  expect(screen.getByRole("listbox")).toBeInTheDocument()
  expect(
    within(screen.getByRole("combobox", { hidden: true })).queryByRole(
      "button",
    ),
  ).toBeNull()
  await user.click(screen.getByRole("option", { name: /^Two/ }))
  expect(onValueChange).toHaveBeenCalledWith("two")
  expect(onStopPreview).toHaveBeenCalledOnce()
})

it("supports keyboard preview, stopping, and dismissing without selecting", async () => {
  const onPreview = vi.fn()
  const onStopPreview = vi.fn()
  const onValueChange = vi.fn()
  render(
    <VoiceSelect
      label="Voice"
      value="one"
      options={[
        { value: "one", label: "One" },
        { value: "two", label: "Two" },
      ]}
      previewVoiceId="two"
      onPreview={onPreview}
      onStopPreview={onStopPreview}
      onValueChange={onValueChange}
    />,
  )
  const user = userEvent.setup()
  fireEvent.mouseDown(screen.getByRole("combobox"))
  await user.keyboard("{Tab}")
  expect(
    screen.getByRole("button", { name: "settings.speech.previewAction · One" }),
  ).toHaveFocus()
  await user.keyboard("{Enter}")
  expect(onPreview).toHaveBeenCalledWith("one")
  await user.click(
    screen.getByRole("button", { name: "settings.speech.stopPreview · Two" }),
  )
  expect(onStopPreview).toHaveBeenCalledOnce()
  await user.keyboard("{Escape}")
  expect(onStopPreview).toHaveBeenCalledTimes(2)
  expect(onValueChange).not.toHaveBeenCalled()
})
