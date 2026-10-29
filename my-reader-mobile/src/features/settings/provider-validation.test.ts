import { createInstance } from "i18next"
import { mobileResources } from "@my-reader/i18n/mobile"
import {
  newTtsDraft,
  newTtsModel,
  setVoiceScope,
} from "@/src/domain/tts/tts-provider-draft"
import { llmFormErrors, ttsFormErrors } from "./provider-validation"

const i18n = createInstance()
beforeAll(async () => {
  await i18n.init({ lng: "zh-CN", resources: mobileResources })
})

it("validates editable voice IDs without imposing a catalog allowlist", () => {
  const draft = newTtsDraft()
  expect(draft.models).toHaveLength(1)
  expect(draft.voices).toEqual([""])
  expect(ttsFormErrors(draft, i18n.t)).toEqual({
    "shared.voice.0": "此项为必填项",
  })
  draft.voices = ["future-voice"]
  expect(ttsFormErrors(draft, i18n.t)).toEqual({})
  const scoped = setVoiceScope(draft, true)
  scoped.models.push(newTtsModel("future-model"))
  expect(scoped.models[1]!.voices).toEqual([""])
  expect(ttsFormErrors(scoped, i18n.t)[`${scoped.models[1]!.id}.voice.0`]).toBe(
    "此项为必填项",
  )
  scoped.models[1]!.voices = ["custom"]
  expect(ttsFormErrors(scoped, i18n.t)).toEqual({})
})

it("reports missing fields, unsafe URL schemes and duplicate IDs on the affected fields", () => {
  const draft = {
    ...newTtsDraft(),
    name: " ",
    endpoint: "file:///tmp/key",
    voices: ["a", "a"],
  }
  draft.models = [
    { ...newTtsModel("same"), id: "first" },
    { ...newTtsModel(" same "), id: "second" },
  ]
  const errors = ttsFormErrors(draft, i18n.t)
  expect(errors.name).toBe(i18n.t("formValidation.required"))
  expect(errors.endpoint).toBe(i18n.t("formValidation.url"))
  expect(errors.second).toBe(i18n.t("formValidation.duplicate"))
  expect(errors["shared.voice.1"]).toBe(i18n.t("formValidation.duplicate"))
  expect(ttsFormErrors({ ...draft, models: [] }, i18n.t).models).toBe(
    i18n.t("formValidation.required"),
  )
})

it("accepts Qwen WebSocket endpoints without allowing them for OpenAI HTTP services", () => {
  const draft = {
    ...newTtsDraft(),
    endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
    voices: ["custom-voice"],
  }
  expect(
    ttsFormErrors({ ...setVoiceScope(draft, true), kind: "qwen" }, i18n.t),
  ).toEqual({})
  expect(ttsFormErrors(draft, i18n.t).endpoint).toBe(
    i18n.t("formValidation.url"),
  )
})

it("revalidates output limits when context changes and accepts optional output limits", () => {
  const draft = {
    id: "p",
    name: "Local",
    protocol: "responses",
    endpoint: "http://localhost/v1",
    hasCredential: false,
    models: [
      {
        id: "m",
        model: "manual",
        contextWindow: 8192,
        maxOutputTokens: 8193 as number | undefined,
      },
    ],
  }
  expect(llmFormErrors(draft, i18n.t)).toEqual({
    "m.output": i18n.t("formValidation.maximum", { max: 8192 }),
  })
  draft.models[0]!.contextWindow = 32768
  expect(llmFormErrors(draft, i18n.t)).toEqual({})
  draft.models[0]!.maxOutputTokens = undefined
  draft.models[0]!.contextWindow = 8191
  expect(llmFormErrors(draft, i18n.t)).toEqual({
    "m.context": i18n.t("formValidation.minimum", { min: 8192 }),
  })
})
