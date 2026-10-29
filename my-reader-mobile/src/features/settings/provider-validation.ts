import type { TFunction } from "i18next"
import type { LlmProviderSettings } from "@/src/services/core/llm"
import {
  usesModelVoices,
  type TtsProviderDraft,
} from "@/src/domain/tts/tts-provider-draft"

function providerErrors(
  provider: { name: string; endpoint: string },
  t: TFunction,
  allowWebSocket = false,
) {
  const errors: Record<string, string> = {}
  if (!provider.name.trim()) errors.name = t("formValidation.required")
  if (!provider.endpoint.trim()) errors.endpoint = t("formValidation.required")
  else {
    try {
      const url = new URL(provider.endpoint.trim())
      const protocols = allowWebSocket
        ? ["http:", "https:", "ws:", "wss:"]
        : ["http:", "https:"]
      if (!protocols.includes(url.protocol) || !url.hostname)
        throw new Error("protocol")
    } catch {
      errors.endpoint = t("formValidation.url")
    }
  }
  return errors
}

function idErrors(ids: string[], keys: string[], group: string, t: TFunction) {
  const errors: Record<string, string> = {}
  if (ids.length === 0) errors[group] = t("formValidation.required")
  const seen = new Set<string>()
  ids.forEach((value, index) => {
    const id = value.trim()
    if (!id) errors[keys[index]!] = t("formValidation.required")
    else if (seen.has(id)) errors[keys[index]!] = t("formValidation.duplicate")
    seen.add(id)
  })
  return errors
}

export function llmFormErrors(draft: LlmProviderSettings, t: TFunction) {
  const errors = {
    ...providerErrors(draft, t),
    ...idErrors(
      draft.models.map((m) => m.model),
      draft.models.map((m) => m.id),
      "models",
      t,
    ),
  }
  for (const model of draft.models) {
    const context = model.contextWindow
    if (!context) errors[`${model.id}.context`] = t("formValidation.required")
    else if (context < 8192)
      errors[`${model.id}.context`] = t("formValidation.minimum", { min: 8192 })
    else if (context > 2000000)
      errors[`${model.id}.context`] = t("formValidation.maximum", {
        max: 2000000,
      })
    else if (!Number.isInteger(context))
      errors[`${model.id}.context`] = t("formValidation.integer")
    const output = model.maxOutputTokens
    if (output == null) continue
    if (output < 1)
      errors[`${model.id}.output`] = t("formValidation.minimum", { min: 1 })
    else if (output > context)
      errors[`${model.id}.output`] = t("formValidation.maximum", {
        max: context,
      })
    else if (!Number.isInteger(output))
      errors[`${model.id}.output`] = t("formValidation.integer")
  }
  return errors
}

export function ttsFormErrors(draft: TtsProviderDraft, t: TFunction) {
  const errors = {
    ...providerErrors(draft, t, draft.kind === "qwen"),
    ...idErrors(
      draft.models.map((m) => m.model),
      draft.models.map((m) => m.id),
      "models",
      t,
    ),
  }
  const groups = usesModelVoices(draft)
    ? draft.models.map((model) => ({ id: model.id, voices: model.voices }))
    : [{ id: "shared", voices: draft.voices }]
  for (const group of groups) {
    Object.assign(
      errors,
      idErrors(
        group.voices,
        group.voices.map((_, i) => `${group.id}.voice.${i}`),
        `${group.id}.voices`,
        t,
      ),
    )
  }
  return errors
}
