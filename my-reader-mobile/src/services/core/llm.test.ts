import * as SecureStore from "expo-secure-store"
import * as core from "my-reader-core"
import {
  getLlmConfig,
  selectedLlmCredential,
  upsertLlmProfile,
  removeLlmProfile,
  selectLlmProfile,
  listLlmModels,
  probeLlmProfile,
} from "./llm"

jest.mock("./app-config", () => ({ appConfigPath: "/config.json" }))
jest.mock("expo-crypto", () => ({ randomUUID: () => "new-profile" }))
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))
jest.mock("my-reader-core", () => ({
  llmGetConfig: jest.fn(),
  llmUpsertProfile: jest.fn(),
  llmRemoveProfile: jest.fn(),
  llmSelectProfile: jest.fn(),
  llmListModels: jest.fn(),
  llmProbe: jest.fn(),
}))
const profile = {
  id: "p",
  name: "Local",
  protocol: "chatCompletions",
  endpoint: "http://localhost/v1",
  model: "m",
  contextWindow: 32768,
  revision: 1,
  hasCredential: true,
}
const stored = { ...profile, credentialReference: "llm-provider-p" }
const config = { schemaVersion: 1, profiles: [stored], defaultProfileId: "p" }
beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(core.llmGetConfig).mockResolvedValue(config)
  jest.mocked(core.llmUpsertProfile).mockResolvedValue(config)
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue("secret")
})
it("exposes only credential presence and resolves the selected credential at the service boundary", async () => {
  expect(await getLlmConfig()).toEqual({ ...config, profiles: [profile] })
  expect(await selectedLlmCredential()).toEqual({
    profileId: "p",
    profileRevision: profile.revision,
    value: "secret",
  })
  jest
    .mocked(core.llmGetConfig)
    .mockResolvedValue({ ...config, defaultProfileId: undefined })
  await expect(selectedLlmCredential()).rejects.toThrow("LLM_PROFILE_REQUIRED")
})
it("keeps an unchanged key, replaces or clears only when requested, and never stores its value in Core", async () => {
  await upsertLlmProfile({ profile })
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
  await upsertLlmProfile({ profile, credential: " replacement " })
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    "llm-provider-new-profile",
    "replacement",
  )
  expect(core.llmUpsertProfile).toHaveBeenLastCalledWith(
    "/config.json",
    expect.objectContaining({
      credentialReference: "llm-provider-new-profile",
    }),
  )
  expect(
    JSON.stringify(jest.mocked(core.llmUpsertProfile).mock.calls),
  ).not.toContain("replacement")
  await upsertLlmProfile({ profile, clearCredential: true })
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("llm-provider-p")
  await upsertLlmProfile({ profile: { ...profile, id: "" } })
  expect(core.llmUpsertProfile).toHaveBeenLastCalledWith(
    "/config.json",
    expect.objectContaining({
      id: "new-profile",
      credentialReference: undefined,
    }),
  )
})
it("does not change credentials when Core rejects a profile, and removes the referenced key with a profile", async () => {
  jest.mocked(core.llmUpsertProfile).mockRejectedValueOnce(new Error("INVALID"))
  await expect(
    upsertLlmProfile({ profile, credential: "replacement" }),
  ).rejects.toThrow("INVALID")
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
  const empty = { ...config, profiles: [], defaultProfileId: undefined }
  jest.mocked(core.llmRemoveProfile).mockResolvedValue(empty)
  expect(await removeLlmProfile("p")).toEqual(empty)
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("llm-provider-p")
  jest.mocked(core.llmSelectProfile).mockResolvedValue(empty)
  expect(await selectLlmProfile()).toEqual(empty)
})
it("cannot read the previous key while a new provider configuration is being saved", async () => {
  const keys = new Map([["llm-provider-p", "previous-secret"]])
  let current = config
  jest.mocked(core.llmGetConfig).mockImplementation(async () => current)
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => keys.get(key) ?? null)
  jest
    .mocked(core.llmUpsertProfile)
    .mockImplementation(async (_path, replacement) => {
      current = {
        ...config,
        profiles: [{ ...stored, ...replacement, revision: 2 }],
      }
      const duringSave = await selectedLlmCredential()
      expect(duringSave).toEqual({
        profileId: "p",
        profileRevision: 2,
        value: undefined,
      })
      return current
    })
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      keys.set(key, value)
    })
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    keys.delete(key)
  })
  await upsertLlmProfile({
    profile: { ...profile, endpoint: "https://replacement.example/v1" },
    credential: "new-secret",
  })
  expect(await selectedLlmCredential()).toEqual({
    profileId: "p",
    profileRevision: 2,
    value: "new-secret",
  })
  expect(keys.has("llm-provider-p")).toBe(false)
})
it("discovers models without a chosen model and probes with draft credentials plus cancellation", async () => {
  const controller = new AbortController()
  await listLlmModels(
    { profile: { ...profile, id: "", model: "" }, credential: " draft " },
    controller.signal,
  )
  expect(core.llmListModels).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "preview",
      model: "discovery",
      credentialReference: undefined,
    }),
    "draft",
    { signal: controller.signal },
  )
  await probeLlmProfile({ profile }, controller.signal)
  expect(core.llmProbe).toHaveBeenCalledWith(
    expect.objectContaining({ id: "p" }),
    "secret",
    { signal: controller.signal },
  )
  await probeLlmProfile({ profile, clearCredential: true })
  expect(core.llmProbe).toHaveBeenLastCalledWith(
    expect.anything(),
    undefined,
    undefined,
  )
})
