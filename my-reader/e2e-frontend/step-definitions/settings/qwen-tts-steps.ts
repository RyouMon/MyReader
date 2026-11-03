import { expect, type Page } from "@playwright/test"
import { createBdd } from "playwright-bdd"
import type {
  QwenTtsModelDto,
  SaveTtsProviderInput,
  TtsConfigDto,
  UpsertTtsProviderInput,
} from "../../../src/lib/tauri-specta"
import { test } from "../../fixtures/test"
import { setupFolderBrowserMocks } from "../../fixtures/folder-browser-mock"
import type { IpcHandler } from "../../fixtures/tauri-browser-mock"

const { Given, When, Then } = createBdd(test)

async function importModel(page: Page, model: string) {
  await page.getByRole("button", { name: "获取可用模型", exact: true }).click()
  await page.getByRole("checkbox", { name: model, exact: true }).check()
  await page.getByRole("button", { name: "添加所选模型", exact: true }).click()
  await expect(
    page.getByRole("textbox", { name: /模型 ID/ }).last(),
  ).toHaveValue(model)
}

Given("用户正在选择语音服务来源", async ({ page }) => {
  await setupFolderBrowserMocks(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "language", { value: "zh-CN" })
    const handlers = (
      window as unknown as {
        __TAURI_IPC_HANDLERS__: Record<string, IpcHandler>
      }
    ).__TAURI_IPC_HANDLERS__
    const config: TtsConfigDto = {
      schemaVersion: 2,
      providers: [],
      defaultEngine: { kind: "system" },
      profiles: [],
      voiceByLanguage: {},
      playback: {
        speed: 1,
        pitch: 1,
        skipPageBreaks: true,
        skipFootnotes: true,
        announceContext: false,
      },
    }
    handlers.get_tts_config = () => config
    handlers.get_llm_config = () => ({
      providers: [],
      profiles: [],
      defaultProfileId: null,
    })
    handlers.get_tts_credential = () => "fixture-key"
    handlers.list_qwen_tts_models = (args) => {
      const { profile } = args.input as UpsertTtsProviderInput
      const tokenPlan = profile.endpoint.startsWith("wss:")
      const models: QwenTtsModelDto[] = [
        {
          id: "qwen-audio-3.0-tts-plus",
          audioFormats: ["mp3", "wav", "opus"],
          supportsInstructions: true,
          voiceDiscovery: !tokenPlan,
          voices: [
            {
              id: tokenPlan ? "longanhuan_v3.6" : "longanlingxin",
              language: "mul",
              gender: null,
            },
          ],
        },
      ]
      if (!tokenPlan) {
        models.push(
          ...["qwen3-tts-vc-2026-01-22", "qwen3-tts-vd-2026-01-26"].map(
            (id): QwenTtsModelDto => ({
              id,
              audioFormats: ["wav"],
              supportsInstructions: false,
              voiceDiscovery: true,
              voices: [],
            }),
          ),
        )
      }
      return models
    }
    handlers.discover_qwen_tts_voices = (args) => {
      const input = args.input as { model: string; credential: string }
      if (input.credential !== "fixture-key")
        throw new Error("Missing voice discovery credential")
      const id = input.model.includes("-vc-")
        ? "my-clone"
        : input.model.includes("-vd-")
          ? "my-design"
          : null
      return id ? [{ id, language: "zh", gender: null }] : []
    }
    handlers.save_tts_provider = (args) => {
      const { provider, credential } = args.input as SaveTtsProviderInput
      config.providers = [
        { ...provider, id: "qwen-fixture", hasCredential: Boolean(credential) },
      ]
      config.profiles = provider.models.map((model) => ({
        id: model.id,
        name: `${provider.name}/${model.model}`,
        kind: provider.kind,
        endpoint: provider.endpoint,
        model: model.model,
        options: {
          kind: provider.kind,
          responseFormat: model.responseFormat,
          instructions: model.instructions,
          voices: model.voices,
          defaultVoice: model.defaultVoice,
        },
        revision: 1,
        hasCredential: Boolean(credential),
      }))
      return config
    }
    handlers.list_tts_voices = () => []
  })
  await page.goto("/settings")
  await page.getByRole("button", { name: "AI 供应商", exact: true }).click()
  await page.getByRole("button", { name: "添加语音服务", exact: true }).click()
})

When("用户填写 Qwen 地址{string}", async ({ page }, endpoint: string) => {
  await page.getByRole("button", { name: "Qwen", exact: true }).click()
  await page.getByRole("textbox", { name: /服务器地址/ }).fill(endpoint)
  await page.locator("#tts-profile-credential").fill("fixture-key")
})

When("用户获取并添加模型{string}", async ({ page }, model: string) => {
  await importModel(page, model)
})

When("用户保存语音服务", async ({ page }) => {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click()
  await expect(page.getByRole("dialog")).toBeHidden()
})

Then("导入模型的声音 ID 为{string}", async ({ page }, voice: string) => {
  await expect(page.getByRole("textbox", { name: /声音 ID/ })).toHaveValue(
    voice,
  )
})

Then("服务地址为{string}", async ({ page }, endpoint: string) => {
  await expect(page.getByRole("textbox", { name: /服务器地址/ })).toHaveValue(
    endpoint,
  )
})

Then(
  "该服务使用{string}且保留填写的配置",
  async ({ page }, endpoint: string) => {
    const name = "Qwen"
    await page
      .getByRole("button", { name: `编辑 ${name}`, exact: true })
      .click()
    await expect(page.getByRole("textbox", { name: /服务器地址/ })).toHaveValue(
      endpoint,
    )
    await expect(page.getByRole("textbox", { name: /^名称/ })).toHaveValue(name)
    await expect(page.getByRole("textbox", { name: /模型 ID/ })).toHaveValue(
      "qwen-audio-3.0-tts-plus",
    )
    await expect(page.getByRole("textbox", { name: /声音 ID/ })).toHaveValue(
      "longanlingxin",
    )
  },
)

When("用户手动填写新音色{string}", async ({ page }, voice: string) => {
  await page.getByRole("textbox", { name: /声音 ID/ }).fill(voice)
})

Then(
  "已保存的模型{string}包含音色{string}",
  async ({ page }, model: string, voice: string) => {
    await page.getByRole("button", { name: /^编辑 Qwen/ }).click()
    await expect(page.getByRole("textbox", { name: /模型 ID/ })).toHaveValue(
      model,
    )
    await expect(page.getByRole("textbox", { name: /声音 ID/ })).toHaveValue(
      voice,
    )
  },
)

Then("两个模型分别保留各自的账户音色", async ({ page }) => {
  await page.getByRole("button", { name: /^编辑 Qwen/ }).click()
  const models = page.getByRole("textbox", { name: /模型 ID/ })
  await expect(models).toHaveCount(2)
  await expect(models.nth(0)).toHaveValue("qwen3-tts-vc-2026-01-22")
  await expect(models.nth(1)).toHaveValue("qwen3-tts-vd-2026-01-26")
  await expect(page.getByRole("textbox", { name: /声音 ID/ })).toHaveValue(
    "my-clone",
  )
  await page.getByRole("button", { name: /模型设置 qwen3-tts-vd/ }).click()
  await expect(page.getByRole("textbox", { name: /声音 ID/ })).toHaveValue(
    "my-design",
  )
})
