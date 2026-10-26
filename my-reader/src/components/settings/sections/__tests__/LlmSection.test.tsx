import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import LlmSection from "../LlmSection"

const mocks = vi.hoisted(() => ({
  getLlmConfig: vi.fn(),
  saveLlmProvider: vi.fn(),
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
  mocks.getLlmConfig.mockResolvedValue({
    profiles: [],
    providers: [],
    defaultProfileId: null,
  })
  mocks.saveLlmProvider.mockResolvedValue({
    profiles: [],
    providers: [],
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
  fireEvent.change(screen.getByLabelText("providerEditor.modelId"), {
    target: { value: "my-model" },
  })
  fireEvent.click(screen.getByRole("button", { name: "llm.save" }))
  await waitFor(() =>
    expect(mocks.saveLlmProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          name: "Local",
          models: [expect.objectContaining({ model: "my-model" })],
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
    profiles: [],
    providers: [
      {
        id: "p",
        name: "Provider",
        endpoint: "https://example.com/v1",
        models: [{ id: "p", model: "model", contextWindow: 32768 }],
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
    expect(mocks.saveLlmProvider).toHaveBeenCalledWith(
      expect.objectContaining({ clearCredential: true, credential: null }),
    ),
  )
})

it("discards unsaved edits when closing the provider dialog", async () => {
  mocks.getLlmConfig.mockResolvedValue({
    profiles: [],
    providers: [
      {
        id: "p",
        name: "Provider",
        endpoint: "https://example.com/v1",
        models: [{ id: "p", model: "saved-model", contextWindow: 32768 }],
        protocol: "chatCompletions",
        hasCredential: false,
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
  expect(screen.getByRole("dialog", { name: "Provider" })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText("providerEditor.modelId"), {
    target: { value: "unsaved-model" },
  })
  fireEvent.click(screen.getByRole("button", { name: "common.close" }))
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  )
  expect(mocks.saveLlmProvider).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "llm.edit Provider" }))
  expect(screen.getByLabelText("providerEditor.modelId")).toHaveValue(
    "saved-model",
  )
})

it("adds models to one provider and preserves each model when switching the editor", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LlmSection />
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByRole("button", { name: "llm.add" }))
  fireEvent.change(screen.getByLabelText("llm.name"), {
    target: { value: "Local" },
  })
  fireEvent.change(screen.getByLabelText("providerEditor.modelId"), {
    target: { value: "first" },
  })
  fireEvent.change(screen.getByLabelText("providerEditor.maxOutput"), {
    target: { value: "8192" },
  })
  fireEvent.click(screen.getByRole("button", { name: "aiProviders.addModel" }))
  fireEvent.change(screen.getAllByLabelText("providerEditor.modelId")[1], {
    target: { value: "second" },
  })
  fireEvent.click(
    screen.getByRole("button", { name: "providerEditor.modelDetails first" }),
  )
  expect(screen.getAllByLabelText("providerEditor.modelId")[0]).toHaveValue(
    "first",
  )
  fireEvent.click(screen.getByRole("button", { name: "llm.save" }))
  await waitFor(() =>
    expect(mocks.saveLlmProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          name: "Local",
          models: [
            expect.objectContaining({
              model: "first",

              maxOutputTokens: 8192,
            }),
            expect.objectContaining({ model: "second", maxOutputTokens: null }),
          ],
        }),
      }),
    ),
  )
})

it("imports only selected new models and retains existing model settings", async () => {
  mocks.listLlmModels.mockResolvedValue(["first", "second", "third"])
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LlmSection />
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByRole("button", { name: "llm.add" }))
  fireEvent.change(screen.getByLabelText("llm.name"), {
    target: { value: "Local" },
  })
  fireEvent.change(screen.getByLabelText("providerEditor.modelId"), {
    target: { value: "first" },
  })
  fireEvent.click(
    screen.getByRole("button", { name: "providerEditor.fetchModels" }),
  )
  fireEvent.click(await screen.findByRole("checkbox", { name: "second" }))
  expect(
    screen.queryByRole("checkbox", { name: "first" }),
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole("button", { name: "providerEditor.addSelected" }),
  )
  fireEvent.click(screen.getByRole("button", { name: "llm.save" }))
  await waitFor(() =>
    expect(mocks.saveLlmProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          models: [
            expect.objectContaining({ model: "first" }),
            expect.objectContaining({ model: "second" }),
          ],
        }),
      }),
    ),
  )
})
