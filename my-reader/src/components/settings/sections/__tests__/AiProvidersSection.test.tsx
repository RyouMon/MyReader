import "@/i18n"
import { render, screen, within } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import SettingsNav from "../../SettingsNav"
import AiProvidersSection from "../AiProvidersSection"

vi.mock("@/hooks/use-window-size-class", () => ({
  useWindowSizeClass: () => "large",
}))
vi.mock("../SpeechSection", () => ({
  TtsProvidersSection: () => <h2>TTS management</h2>,
}))
vi.mock("../LlmSection", () => ({ default: () => <h2>LLM management</h2> }))

function Settings() {
  return (
    <>
      <SettingsNav activeSection="aiProviders" onSectionChange={vi.fn()} />
      <main>
        <AiProvidersSection />
      </main>
    </>
  )
}

it("shows both provider managers in order under one sidebar entry", () => {
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
  const page = within(screen.getByRole("main"))
  expect(
    page.getAllByRole("heading").map((heading) => heading.textContent),
  ).toEqual(["AI 供应商", "TTS management", "LLM management"])
  expect(
    page.queryByRole("button", { name: /^TTS 供应商/ }),
  ).not.toBeInTheDocument()
  expect(
    page.queryByRole("button", { name: /^LLM 供应商/ }),
  ).not.toBeInTheDocument()
})
