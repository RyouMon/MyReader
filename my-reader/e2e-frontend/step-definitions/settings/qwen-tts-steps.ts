import { expect } from "@playwright/test"
import { createBdd } from "playwright-bdd"
import { test } from "../../fixtures/test"
import { setupFolderBrowserMocks } from "../../fixtures/folder-browser-mock"
import type { IpcHandler } from "../../fixtures/tauri-browser-mock"

const { Given, When, Then } = createBdd(test)

Given("用户正在选择语音服务来源", async ({ page }) => {
  await setupFolderBrowserMocks(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "language", { value: "zh-CN" })
    const handlers = (
      window as unknown as {
        __TAURI_IPC_HANDLERS__: Record<string, IpcHandler>
      }
    ).__TAURI_IPC_HANDLERS__
    const models = [
      {
        id: "qwen3-tts-flash",
        name: "Qwen3-TTS Flash",
        audioFormats: ["wav"],
        supportsInstructions: false,
        voiceDiscovery: false,
        voices: [{ id: "Cherry", name: "芊悦", language: "mul" }],
      },
      {
        id: "qwen3-tts-vc-2026-01-22",
        name: "Qwen3-TTS VC",
        audioFormats: ["wav"],
        supportsInstructions: false,
        voiceDiscovery: true,
        voices: [],
      },
      {
        id: "qwen3-tts-vd-2026-01-26",
        name: "Qwen3-TTS VD",
        audioFormats: ["wav"],
        supportsInstructions: false,
        voiceDiscovery: true,
        voices: [],
      },
    ]
    const config = {
      schemaVersion: 1,
      defaultEngine: { kind: "system" },
      profiles: [] as Record<string, unknown>[],
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
    const presets = [
      [
        "tokenPlan",
        "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
      ],
      ["qianwen", "https://maas.qianwenaiapi.com/api/v1"],
      ["dashscope", "https://dashscope.aliyuncs.com/api/v1"],
    ].map(([id, endpoint]) => ({
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
    handlers.list_qwen_tts_presets = () => presets
    handlers.list_qwen_tts_models = (args) =>
      String(args.endpoint).startsWith("wss:")
        ? [presets[0].defaultModel]
        : [presets[1].defaultModel, ...models]
    handlers.discover_qwen_tts_voices = (args) => {
      const input = args.input as { model: string }
      return input.model.includes("-vc-")
        ? [{ id: "my-clone", name: "我的复刻音色", language: "zh" }]
        : [{ id: "my-design", name: "我的设计音色", language: "zh" }]
    }
    handlers.upsert_tts_profile = (args) => {
      const { profile } = args.input as { profile: Record<string, unknown> }
      config.profiles = [
        { ...profile, id: "qwen-fixture", revision: 1, hasCredential: true },
      ]
      return config
    }
    handlers.list_tts_voices = () => []
  })
  await page.goto("/settings")
  await page.getByRole("button", { name: "朗读与语音", exact: true }).click()
  await page.getByRole("button", { name: "添加语音服务", exact: true }).click()
})

When("用户选择{string}来源", async ({ page }, source: string) => {
  await page
    .getByRole("button")
    .filter({ has: page.getByText(source, { exact: true }) })
    .click()
})

When("用户创建一个{string}语音服务", async ({ page }, source: string) => {
  await page
    .getByRole("button")
    .filter({ has: page.getByText(source, { exact: true }) })
    .click()
  await page.locator("#tts-profile-credential").fill("fixture-key")
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "添加语音服务", exact: true })
    .click()
})

Then(
  "该服务使用{string}且保留所选来源名称",
  async ({ page }, endpoint: string) => {
    await expect(page.getByRole("dialog")).toBeHidden()
    const name = endpoint.includes("maas.qianwenaiapi.com")
      ? "Qwen · 按需计费"
      : "Qwen · DashScope（百炼）"
    await expect(page.getByText(name, { exact: true })).toBeVisible()
    await page
      .getByRole("button", { name: "编辑语音服务", exact: true })
      .click()
    await expect(page.getByLabel("服务器地址", { exact: true })).toHaveValue(
      endpoint,
    )
    await expect(page.getByLabel("名称", { exact: true })).toHaveValue(name)
    await expect(
      page.getByRole("combobox", { name: "默认声音", exact: true }),
    ).toHaveText("龙安灵心")
  },
)

When("用户选择复刻模型并填写有效凭据", async ({ page }) => {
  await page
    .getByRole("button")
    .filter({
      has: page.getByText("Qwen · DashScope（百炼）", { exact: true }),
    })
    .click()
  await page.getByRole("combobox", { name: "模型", exact: true }).click()
  await page.getByRole("option", { name: "Qwen3-TTS VC", exact: true }).click()
  await page.locator("#tts-profile-credential").fill("fixture-key")
})

Then("默认使用 Token Plan 支持的模型和套餐地址", async ({ page }) => {
  await expect(page.getByLabel("服务器地址", { exact: true })).toHaveValue(
    "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
  )
  await expect(
    page.getByRole("combobox", { name: "模型", exact: true }),
  ).toHaveText("Qwen-Audio-TTS Plus")
  await expect(
    page.getByRole("combobox", { name: "默认声音", exact: true }),
  ).toHaveText("龙安欢")
  await page.getByRole("combobox", { name: "模型", exact: true }).click()
  await expect(page.getByRole("option")).toHaveCount(1)
})

Then("声音列表包含账户音色“我的复刻音色”", async ({ page }) => {
  await expect(page.getByText("正在获取账户音色…")).toBeHidden()
  await page.getByRole("combobox", { name: "默认声音", exact: true }).click()
  await expect(
    page.getByRole("option", { name: "我的复刻音色", exact: true }),
  ).toBeVisible()
  await page.keyboard.press("Escape")
})

When("用户改用声音设计模型", async ({ page }) => {
  await expect(page.getByText("正在获取账户音色…")).toBeHidden()
  await page.getByRole("combobox", { name: "模型", exact: true }).click()
  await page.getByRole("option", { name: "Qwen3-TTS VD", exact: true }).click()
})

Then("声音列表仅包含该模型的账户音色“我的设计音色”", async ({ page }) => {
  await expect(page.getByText("正在获取账户音色…")).toBeHidden()
  await page.getByRole("combobox", { name: "默认声音", exact: true }).click()
  await expect(
    page.getByRole("option", { name: "我的设计音色", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("option", { name: "我的复刻音色", exact: true }),
  ).toHaveCount(0)
})

When("用户手动填写新音色“future-voice”", async ({ page }) => {
  await page
    .getByRole("button", { name: "手动输入音色 ID", exact: true })
    .click()
  await page.getByLabel("音色 ID", { exact: true }).fill("future-voice")
})

When("用户将该音色设为默认声音并保存", async ({ page }) => {
  await page.getByRole("combobox", { name: "默认声音", exact: true }).click()
  await page
    .getByRole("option", { name: /^(我的复刻音色|future-voice)$/ })
    .click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "添加语音服务", exact: true })
    .click()
})

Then("已添加的 Qwen 服务使用该默认音色", async ({ page }) => {
  await expect(page.getByRole("dialog")).toBeHidden()
  await page.getByRole("button", { name: "编辑语音服务", exact: true }).click()
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "默认声音", exact: true }),
  ).toHaveText(/^(my-clone|我的复刻音色|future-voice)$/)
})
