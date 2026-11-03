import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import LlmSection from "../LlmSection"

const mocks = vi.hoisted(() => ({
  getLlmConfig: vi.fn(),
  getLlmCredential: vi.fn().mockResolvedValue("saved-test-key"),
  saveLlmProvider: vi.fn(),
  listLlmModels: vi.fn(),
  probeLlmProfile: vi.fn(),
  removeLlmProfile: vi.fn(),
  selectLlmProfile: vi.fn(),
}))
vi.mock("@/lib/tauri-api", () => ({ api: mocks, formatApiError: String }))
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key} ${options.name}` : key,
  }),
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
  fireEvent.change(screen.getByLabelText(/llm\.name\s*\*?$/), {
    target: { value: "Local" },
  })
  fireEvent.change(screen.getByLabelText(/llm\.endpoint\s*\*?$/), {
    target: { value: "http://localhost:1234/v1" },
  })
  fireEvent.change(screen.getByLabelText(/providerEditor\.modelId\s*\*?$/), {
    target: { value: "my-model" },
  })
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "llm.protocol" }))
  fireEvent.click(screen.getByRole("option", { name: "Responses" }))
  fireEvent.click(screen.getByRole("button", { name: "common.save" }))
  await waitFor(() =>
    expect(mocks.saveLlmProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          name: "Local",
          protocol: "responses",
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

it("closes the protocol menu with Escape without closing the provider form", async () => {
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LlmSection />
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByRole("button", { name: "llm.add" }))
  const protocol = screen.getByRole("combobox", { name: "llm.protocol" })
  await user.tab()
  expect(protocol).toHaveFocus()
  await user.keyboard("{ArrowDown}")
  expect(screen.getByRole("option", { name: "Chat Completions" })).toHaveFocus()
  await user.keyboard("{Escape}")
  await waitFor(() =>
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
  )
  expect(screen.getByRole("dialog")).toBeVisible()
  expect(protocol).toHaveFocus()
  await user.keyboard("{Escape}")
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  )
  expect(mocks.saveLlmProvider).not.toHaveBeenCalled()
})

it("loads a masked saved key and clears it by saving an empty field", async () => {
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
    await screen.findByRole("button", { name: "rowActions.edit Provider" }),
  )
  const key = await screen.findByLabelText("llm.key")
  expect(key).toHaveValue("saved-test-key")
  expect(key).toHaveAttribute("type", "password")
  fireEvent.click(screen.getByRole("button", { name: "passwordField.show" }))
  expect(key).toHaveAttribute("type", "text")
  expect(key).toHaveValue("saved-test-key")
  fireEvent.change(key, { target: { value: "" } })
  fireEvent.click(screen.getByRole("button", { name: "common.save" }))
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
    await screen.findByRole("button", { name: "rowActions.edit Provider" }),
  )
  expect(screen.getByRole("dialog", { name: "Provider" })).toBeInTheDocument()
  fireEvent.change(
    await screen.findByLabelText(/providerEditor\.modelId\s*\*?$/),
    {
      target: { value: "unsaved-model" },
    },
  )
  fireEvent.click(screen.getByRole("button", { name: "common.close" }))
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  )
  expect(mocks.saveLlmProvider).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole("button", { name: "rowActions.edit Provider" }),
  )
  expect(
    await screen.findByLabelText(/providerEditor\.modelId\s*\*?$/),
  ).toHaveValue("saved-model")
})

it("adds collapsed models and preserves their details when switching the editor", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LlmSection />
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByRole("button", { name: "llm.add" }))
  fireEvent.change(screen.getByLabelText(/llm\.name\s*\*?$/), {
    target: { value: "Local" },
  })
  fireEvent.change(screen.getByLabelText(/providerEditor\.modelId\s*\*?$/), {
    target: { value: "first" },
  })
  expect(
    screen.queryByLabelText("providerEditor.maxOutput"),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "providerEditor.modelDetails first" }),
  ).toHaveAttribute("aria-expanded", "false")
  fireEvent.click(
    screen.getByRole("button", { name: "providerEditor.modelDetails first" }),
  )
  fireEvent.change(screen.getByLabelText("providerEditor.maxOutput"), {
    target: { value: "8192" },
  })
  fireEvent.click(screen.getByRole("button", { name: "aiProviders.addModel" }))
  expect(
    screen.queryByLabelText("providerEditor.maxOutput"),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "providerEditor.modelDetails 2" }),
  ).toHaveAttribute("aria-expanded", "false")
  fireEvent.change(
    screen.getAllByLabelText(/providerEditor\.modelId\s*\*?$/)[1],
    {
      target: { value: "second" },
    },
  )
  fireEvent.click(
    screen.getByRole("button", { name: "providerEditor.modelDetails first" }),
  )
  expect(
    screen.getAllByLabelText(/providerEditor\.modelId\s*\*?$/)[0],
  ).toHaveValue("first")
  expect(screen.getByLabelText("providerEditor.maxOutput")).toHaveValue(8192)
  fireEvent.click(screen.getByRole("button", { name: "common.save" }))
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
  fireEvent.change(screen.getByLabelText(/llm\.name\s*\*?$/), {
    target: { value: "Local" },
  })
  fireEvent.change(screen.getByLabelText(/providerEditor\.modelId\s*\*?$/), {
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
  fireEvent.click(screen.getByRole("button", { name: "common.save" }))
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

it("shows numeric limits on the affected model and updates dependent output validation", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LlmSection />
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByRole("button", { name: "llm.add" }))
  fireEvent.click(
    screen.getByRole("button", { name: "providerEditor.modelDetails 1" }),
  )
  const context = screen.getByLabelText(/llm\.context/)
  const output = screen.getByLabelText("providerEditor.maxOutput")
  expect(output).toHaveAttribute("aria-invalid", "false")
  fireEvent.change(output, { target: { value: "40000" } })
  fireEvent.blur(output)
  expect(output).toHaveAttribute("aria-invalid", "true")
  expect(output).toHaveAccessibleDescription("formValidation.maximum")

  fireEvent.change(context, { target: { value: "65536" } })
  expect(output).toHaveAttribute("aria-invalid", "false")
  fireEvent.change(context, { target: { value: "1" } })
  fireEvent.blur(context)
  expect(context).toHaveAttribute("aria-invalid", "true")
  expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled()

  fireEvent.click(screen.getByRole("button", { name: "aiProviders.addModel" }))
  fireEvent.click(
    screen.getByRole("button", { name: "providerEditor.modelDetails 2" }),
  )
  expect(screen.getByLabelText(/llm\.context/)).toHaveAttribute(
    "aria-invalid",
    "false",
  )
  expect(screen.getByLabelText(/llm\.context/)).toHaveValue(32768)
})

it("keeps provider rows inert and deletes the provider only after confirmation", async () => {
  mocks.getLlmConfig.mockResolvedValue({
    providers: [
      {
        id: "provider-id",
        name: "Provider",
        protocol: "chatCompletions",
        endpoint: "https://example.com/v1",
        hasCredential: true,
        models: [{ id: "model-id", model: "model", contextWindow: 32768 }],
      },
    ],
    profiles: [],
    defaultProfileId: null,
  })
  mocks.removeLlmProfile.mockResolvedValue({
    providers: [],
    profiles: [],
    defaultProfileId: null,
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LlmSection />
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByText("Provider"))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "rowActions.edit Provider" }),
  ).toBeVisible()
  fireEvent.click(
    screen.getByRole("button", { name: "rowActions.delete Provider" }),
  )
  expect(mocks.removeLlmProfile).not.toHaveBeenCalled()
  const dialog = within(screen.getByRole("alertdialog"))
  fireEvent.click(dialog.getByRole("button", { name: "common.delete" }))
  await waitFor(() =>
    expect(mocks.removeLlmProfile.mock.calls[0]?.[0]).toBe("provider-id"),
  )
  await waitFor(() =>
    expect(screen.queryByText("Provider")).not.toBeInTheDocument(),
  )
})
