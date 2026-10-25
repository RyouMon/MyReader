import "@/i18n"
import { useState } from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import SettingsNav from "../../SettingsNav"
import AiProvidersSection from "../AiProvidersSection"
import type { SettingsSection } from "@/types/settings"

vi.mock("@/hooks/use-window-size-class", () => ({
  useWindowSizeClass: () => "large",
}))
vi.mock("../SpeechSection", () => ({
  TtsProvidersSection: () => <h1>TTS management</h1>,
}))
vi.mock("../LlmSection", () => ({ default: () => <h1>LLM management</h1> }))

function Settings() {
  const [section, setSection] = useState<SettingsSection>("aiProviders")
  return (
    <>
      <SettingsNav activeSection={section} onSectionChange={setSection} />
      {(section === "aiProviders" ||
        section === "ttsProviders" ||
        section === "llm") && (
        <AiProvidersSection section={section} onSectionChange={setSection} />
      )}
    </>
  )
}

it("groups TTS and LLM under one sidebar entry and returns to the provider chooser", () => {
  render(<Settings />)
  const nav = within(screen.getByRole("navigation"))
  expect(nav.getByRole("button", { name: "AI 供应商" })).toHaveAttribute(
    "aria-current",
    "page",
  )
  expect(
    nav.queryByRole("button", { name: /^TTS 供应商/ }),
  ).not.toBeInTheDocument()
  expect(
    nav.queryByRole("button", { name: /^LLM 供应商/ }),
  ).not.toBeInTheDocument()
  expect(nav.getByRole("button", { name: "朗读配置" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: /^TTS 供应商/ }))
  expect(
    screen.getByRole("heading", { name: "TTS management" }),
  ).toBeInTheDocument()
  expect(nav.getByRole("button", { name: "AI 供应商" })).toHaveAttribute(
    "aria-current",
    "page",
  )
  fireEvent.click(screen.getAllByRole("button", { name: "AI 供应商" })[1])
  fireEvent.click(screen.getByRole("button", { name: /^LLM 供应商/ }))
  expect(
    screen.getByRole("heading", { name: "LLM management" }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole("heading", { name: "TTS management" }),
  ).not.toBeInTheDocument()
})
