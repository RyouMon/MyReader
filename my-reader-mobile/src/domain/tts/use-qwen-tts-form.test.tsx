import type { ComponentProps } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import { discoverQwenTtsVoices } from "@/src/services/core/tts"
import { useQwenTtsForm } from "./use-qwen-tts-form"

jest.mock("@/src/services/core/tts", () => ({
  getQwenTtsModels: async ({ endpoint }: { endpoint: string }) =>
    endpoint.startsWith("wss:")
      ? [
          {
            id: "qwen-audio-3.0-tts-plus",
            voiceDiscovery: false,
            voices: [],
          },
        ]
      : [
          { id: "clone", voiceDiscovery: true, voices: [] },
          { id: "design", voiceDiscovery: true, voices: [] },
        ],
  discoverQwenTtsVoices: jest.fn(),
}))

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: Infinity },
    mutations: { retry: false, gcTime: Infinity },
  },
})
const wrapper = ({
  children,
}: {
  children: ComponentProps<typeof QueryClientProvider>["children"]
}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>

const draft = {
  kind: "qwen",
  model: "clone",
  endpoint: "https://dashscope.aliyuncs.com/api/v1",
  credential: "key",
  hasCredential: false,
  clearCredential: false,
  voices: "manual-voice",
  defaultVoice: "manual-voice",
}

describe("Qwen voice discovery in provider forms", () => {
  beforeEach(() => {
    client.clear()
    jest.clearAllMocks()
  })

  it("ignores an older model's response and aborts its request when the selection changes", async () => {
    let resolveOld!: (
      voices: { id: string; name: string; language: string }[],
    ) => void
    jest
      .mocked(discoverQwenTtsVoices)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValueOnce([
        { id: "design-voice", name: "Design voice", language: "en" },
      ])
    const { result, rerender } = renderHook<
      ReturnType<typeof useQwenTtsForm>,
      { model: string }
    >(({ model }) => useQwenTtsForm({ ...draft, model }), {
      initialProps: { model: "clone" },
      wrapper,
    })
    await waitFor(() => expect(discoverQwenTtsVoices).toHaveBeenCalled())
    const oldSignal = jest.mocked(discoverQwenTtsVoices).mock.calls[0]?.[1]
    rerender({ model: "design" })
    expect(oldSignal?.aborted).toBe(true)
    await waitFor(() =>
      expect(result.current.voices[0]?.id).toBe("design-voice"),
    )
    await act(async () => {
      resolveOld([{ id: "old-clone", name: "Old voice", language: "zh" }])
    })
    expect(result.current.voices.map((voice) => voice.id)).toEqual([
      "design-voice",
      "manual-voice",
    ])
    expect(result.current.loading).toBe(false)
  })

  it("keeps manually entered voices available and exposes a discovery failure", async () => {
    jest
      .mocked(discoverQwenTtsVoices)
      .mockRejectedValue(new Error("InvalidApiKey"))
    const { result } = renderHook(() => useQwenTtsForm(draft), { wrapper })
    await waitFor(() =>
      expect(result.current.error).toBe(
        "This action could not be completed. Please try again.\n\nError: InvalidApiKey",
      ),
    )
    expect(result.current.voices).toEqual([
      { id: "manual-voice", name: "manual-voice" },
    ])
    expect(result.current.loading).toBe(false)
  })

  it("updates models for the endpoint and does not query unsupported Token Plan voice discovery", async () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof useQwenTtsForm>,
      { endpoint: string }
    >(
      ({ endpoint }) =>
        useQwenTtsForm({
          ...draft,
          endpoint,
          model: "qwen-audio-3.0-tts-plus",
          credential: "sk-sp-fixture",
        }),
      {
        wrapper,
        initialProps: {
          endpoint:
            "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
        },
      },
    )
    await waitFor(() => expect(result.current.models).toHaveLength(1))
    expect(discoverQwenTtsVoices).not.toHaveBeenCalled()
    expect(result.current.models.map((model) => model.id)).toEqual([
      "qwen-audio-3.0-tts-plus",
    ])
    expect(result.current.voices.map((voice) => voice.id)).toEqual([
      "manual-voice",
    ])
    rerender({ endpoint: draft.endpoint })
    await waitFor(() =>
      expect(result.current.models.map((model) => model.id)).toEqual([
        "clone",
        "design",
      ]),
    )
  })
})
