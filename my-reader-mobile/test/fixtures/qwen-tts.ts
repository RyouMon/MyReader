import type { QwenTtsModel, QwenTtsPreset } from "@/src/services/core/tts"

export function getQwenTtsPresets(): QwenTtsPreset[] {
  return (
    [
      [
        "tokenPlan",
        "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
      ],
      ["qianwen", "https://maas.qianwenaiapi.com/api/v1"],
      ["dashscope", "https://dashscope.aliyuncs.com/api/v1"],
    ] as const
  ).map(([id, endpoint]) => ({
    id,
    endpoint,
  }))
}

export async function getQwenTtsModels({
  endpoint,
}: {
  endpoint: string
}): Promise<QwenTtsModel[]> {
  const preset = getQwenTtsPresets().find(
    (preset) => preset.endpoint === endpoint,
  )
  if (!preset) return []
  const audio: QwenTtsModel = {
    id: "qwen-audio-3.0-tts-plus",
    name: "Qwen-Audio-TTS Plus",
    audioFormats: ["mp3", "wav", "opus"],
    supportsInstructions: true,
    voiceDiscovery: preset.id !== "tokenPlan",
    voices: [],
  }
  if (preset.id === "tokenPlan") return [audio]
  return [
    audio,
    {
      id: "qwen3-tts-flash",
      name: "Qwen3-TTS Flash",
      audioFormats: ["wav"],
      voices: [],
      supportsInstructions: false,
      voiceDiscovery: false,
    },
    {
      id: "qwen3-tts-vc-2026-01-22",
      name: "Qwen3-TTS VC",
      audioFormats: ["wav"],
      voices: [],
      supportsInstructions: false,
      voiceDiscovery: true,
    },
  ]
}
