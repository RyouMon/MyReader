import { useState, type CSSProperties } from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { FormSelect, FormSelectItem } from "../FormSelect"
import { FormSwitch } from "../FormSwitch"

function SelectDialog() {
  const [open, setOpen] = useState(true)
  const [value, setValue] = useState("first")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Provider</DialogTitle>
        <FormSelect label="Model" value={value} onValueChange={setValue}>
          <>
            <FormSelectItem value="first">First</FormSelectItem>
            <FormSelectItem value="second">Second</FormSelectItem>
          </>
        </FormSelect>
      </DialogContent>
    </Dialog>
  )
}

it("keeps the menu in the dialog focus scope and closes it before the dialog", async () => {
  const user = userEvent.setup()
  render(<SelectDialog />)
  const select = screen.getByRole("combobox", { name: "Model" })
  await user.click(select)
  expect(
    within(screen.getByRole("dialog")).getByRole("listbox"),
  ).toBeInTheDocument()
  await user.keyboard("{Escape}")
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  expect(screen.getByRole("dialog")).toBeInTheDocument()
  expect(select).toHaveFocus()
  await user.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

it("selects grouped options by keyboard and retains the selected value", async () => {
  const user = userEvent.setup()
  render(<SelectDialog />)
  const select = screen.getByRole("combobox", { name: "Model" })
  await user.click(select)
  await user.keyboard("{ArrowDown}{Enter}")
  expect(select).toHaveTextContent("Second")
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  await user.click(select)
  expect(screen.getByRole("option", { name: "Second" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
})

it("associates an independent label with the select and focuses it on click", async () => {
  const user = userEvent.setup()
  const change = vi.fn()
  render(
    <FormSelect
      id="model"
      label="Model"
      labelMode="external"
      value="first"
      onValueChange={change}
    >
      <FormSelectItem value="first">First</FormSelectItem>
      <FormSelectItem value="second">Second</FormSelectItem>
    </FormSelect>,
  )
  const select = screen.getByRole("combobox", { name: "Model" })
  await user.click(screen.getByText("Model"))
  expect(select).toHaveFocus()
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}")
  expect(change).toHaveBeenCalledWith("second")
})

it("keeps a hidden label accessible and supports keyboard selection", async () => {
  const user = userEvent.setup()
  const change = vi.fn()
  render(
    <FormSelect
      label={<span>Language</span>}
      labelMode="hidden"
      value="first"
      onValueChange={change}
    >
      <FormSelectItem value="first">First</FormSelectItem>
      <FormSelectItem value="second">Second</FormSelectItem>
    </FormSelect>,
  )
  const select = screen.getByRole("combobox", { name: "Language" })
  await user.tab()
  expect(select).toHaveFocus()
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}")
  expect(change).toHaveBeenCalledWith("second")
})

it("generates separate label associations for multiple selects", async () => {
  const user = userEvent.setup()
  render(
    <>
      {["Engine", "Voice"].map((label) => (
        <FormSelect
          key={label}
          label={label}
          labelMode="external"
          value="first"
          onValueChange={vi.fn()}
        >
          <FormSelectItem value="first">First</FormSelectItem>
        </FormSelect>
      ))}
    </>,
  )
  const engine = screen.getByRole("combobox", { name: "Engine" })
  const voice = screen.getByRole("combobox", { name: "Voice" })
  expect(engine.id).not.toBe(voice.id)
  await user.click(screen.getByText("Engine"))
  expect(engine).toHaveFocus()
  await user.click(screen.getByText("Voice"))
  expect(voice).toHaveFocus()
})

it("preserves errors and disabled state with an external label", async () => {
  const user = userEvent.setup()
  const change = vi.fn()
  render(
    <FormSelect
      label="Model"
      labelMode="external"
      value=""
      onValueChange={change}
      disabled
      error
      helperText="A model is required"
    >
      <FormSelectItem value="first">First</FormSelectItem>
    </FormSelect>,
  )
  const select = screen.getByRole("combobox", { name: "Model" })
  expect(select).toHaveAttribute("aria-invalid", "true")
  expect(select).toHaveAttribute("aria-disabled", "true")
  expect(select).toHaveAccessibleDescription("A model is required")
  await user.click(screen.getByText("Model"))
  await user.keyboard("{ArrowDown}{Enter}")
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  expect(change).not.toHaveBeenCalled()
})

it("applies theme changes to both the select and its portalled menu", async () => {
  const user = userEvent.setup()
  const select = (themeStyle: CSSProperties) => (
    <FormSelect
      data-testid="themed-select"
      label="Model"
      value="first"
      onValueChange={vi.fn()}
      themeStyle={themeStyle}
    >
      <FormSelectItem value="first">First</FormSelectItem>
    </FormSelect>
  )
  const firstTheme = { "--popover": "var(--reader-panel-bg)" }
  const nextTheme = { "--popover": "var(--card)" }
  const { rerender } = render(select(firstTheme as CSSProperties))
  await user.click(screen.getByRole("combobox", { name: "Model" }))
  const menu = screen.getByRole("option", { name: "First" })
  expect(screen.getByTestId("themed-select")).toHaveStyle(firstTheme)
  expect(menu.closest('[style*="--popover"]')).toHaveStyle(firstTheme)
  rerender(select(nextTheme as CSSProperties))
  expect(screen.getByTestId("themed-select")).toHaveStyle(nextTheme)
  expect(menu.closest('[style*="--popover"]')).toHaveStyle(nextTheme)
})

it("associates the switch label and description and respects disabled state", async () => {
  const user = userEvent.setup()
  const change = vi.fn()
  const { rerender } = render(
    <FormSwitch
      label="Model voices"
      description="Voice scope"
      onCheckedChange={change}
    />,
  )
  expect(
    screen.getByRole("switch", { name: "Model voices" }),
  ).toHaveAccessibleDescription("Voice scope")
  await user.click(screen.getByText("Model voices"))
  expect(change).toHaveBeenCalledWith(true)
  change.mockClear()
  rerender(
    <FormSwitch label="Model voices" disabled onCheckedChange={change} />,
  )
  await user.click(screen.getByText("Model voices"))
  expect(change).not.toHaveBeenCalled()
})
