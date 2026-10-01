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
    defaultModel: {
      id: "qwen-audio-3.0-tts-plus",
      name: "Qwen-Audio-TTS Plus",
      audioFormats: ["mp3", "wav", "opus"],
      supportsInstructions: true,
      voiceDiscovery: id !== "tokenPlan",
      voices: [
        {
          id: id === "tokenPlan" ? "longanhuan_v3.6" : "longanlingxin",
          name: id === "tokenPlan" ? "龙安欢" : "龙安灵心",
          language: "mul",
        },
      ],
    },
  }))
}

export function getQwenTtsModels(endpoint: string): QwenTtsModel[] {
  const preset = getQwenTtsPresets().find(
    (preset) => preset.endpoint === endpoint,
  )
  if (!preset) return []
  if (preset.id === "tokenPlan") return [preset.defaultModel]
  return [
    preset.defaultModel,
    {
      id: "qwen3-tts-flash",
      name: "Qwen3-TTS Flash",
      audioFormats: ["wav"],
      voices: [{ id: "Cherry", name: "芊悦", language: "mul" }],
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
