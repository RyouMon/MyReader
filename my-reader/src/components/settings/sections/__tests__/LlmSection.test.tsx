import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import LlmSection from "../LlmSection"

const mocks = vi.hoisted(() => ({
  getLlmConfig: vi.fn(),
  upsertLlmProfile: vi.fn(),
  listLlmModels: vi.fn(),
  probeLlmProfile: vi.fn(),
  removeLlmProfile: vi.fn(),
  selectLlmProfile: vi.fn(),
}))
vi.mock("@/lib/tauri-api", () => ({ api: mocks, formatApiError: String }))
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  HTMLElement.prototype.hasPointerCapture = () => false
  HTMLElement.prototype.setPointerCapture = () => undefined
  HTMLElement.prototype.releasePointerCapture = () => undefined
  HTMLElement.prototype.scrollIntoView = () => undefined
  vi.clearAllMocks()
  mocks.getLlmConfig.mockResolvedValue({ profiles: [], defaultProfileId: null })
  mocks.upsertLlmProfile.mockResolvedValue({
    profiles: [],
    defaultProfileId: null,
  })
})

it("saves a manually entered model without requiring discovery or a connection test", async () => {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <LlmSection />
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByRole("button", { name: "llm.add" }))
  fireEvent.change(screen.getByLabelText("llm.name"), {
    target: { value: "Local" },
  })
  fireEvent.change(screen.getByLabelText("llm.endpoint"), {
    target: { value: "http://localhost:1234/v1" },
  })
  fireEvent.change(screen.getByLabelText("llm.model"), {
    target: { value: "my-model" },
  })
  fireEvent.click(screen.getByRole("button", { name: "llm.save" }))
  await waitFor(() =>
    expect(mocks.upsertLlmProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          name: "Local",
          model: "my-model",
          endpoint: "http://localhost:1234/v1",
        }),
        credential: null,
      }),
    ),
  )
  expect(mocks.listLlmModels).not.toHaveBeenCalled()
  expect(mocks.probeLlmProfile).not.toHaveBeenCalled()
})

it("shows saved credential state without filling a secret into the form", async () => {
  mocks.getLlmConfig.mockResolvedValue({
    profiles: [
      {
        id: "p",
        name: "Provider",
        endpoint: "https://example.com/v1",
        model: "model",
        protocol: "responses",
        hasCredential: true,
        contextWindow: 32768,
      },
    ],
    defaultProfileId: "p",
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LlmSection />
    </QueryClientProvider>,
  )
  fireEvent.click(
    await screen.findByRole("button", { name: "llm.edit Provider" }),
  )
  expect(screen.getByLabelText("llm.key")).toHaveValue("")
  expect(screen.getByLabelText("llm.key")).toHaveAttribute(
    "placeholder",
    "llm.keySaved",
  )
  fireEvent.click(screen.getByRole("switch", { name: "llm.clearKey" }))
  fireEvent.click(screen.getByRole("button", { name: "llm.save" }))
  await waitFor(() =>
    expect(mocks.upsertLlmProfile).toHaveBeenCalledWith(
      expect.objectContaining({ clearCredential: true, credential: null }),
    ),
  )
})
