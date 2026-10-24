import { randomUUID } from "expo-crypto"
import * as SecureStore from "expo-secure-store"
import {
  llmGetConfig,
  llmUpsertProfile,
  llmRemoveProfile,
  llmSelectProfile,
  llmListModels,
  llmProbe,
  type LlmConfig,
  type LlmProviderProfile,
} from "my-reader-core"
import { appConfigPath } from "./app-config"

export type LlmProfile = Omit<LlmProviderProfile, "credentialReference"> & {
  hasCredential: boolean
}
export type LlmSettings = Omit<LlmConfig, "profiles"> & {
  profiles: LlmProfile[]
}
export type LlmProfileInput = {
  profile: LlmProfile
  credential?: string
  clearCredential?: boolean
}

async function hydrate(config: LlmConfig): Promise<LlmSettings> {
  return {
    ...config,
    profiles: await Promise.all(
      config.profiles.map(async ({ credentialReference, ...profile }) => ({
        ...profile,
        hasCredential: credentialReference
          ? Boolean(await SecureStore.getItemAsync(credentialReference))
          : false,
      })),
    ),
  }
}
export async function getLlmConfig() {
  return hydrate(await llmGetConfig(appConfigPath))
}
export async function selectedLlmCredential(): Promise<string | undefined> {
  const config = await llmGetConfig(appConfigPath)
  const profile = config.profiles.find(
    (item) => item.id === config.defaultProfileId,
  )
  if (!profile) throw new Error("LLM_PROFILE_REQUIRED")
  return profile.credentialReference
    ? ((await SecureStore.getItemAsync(profile.credentialReference)) ??
        undefined)
    : undefined
}
export async function upsertLlmProfile(input: LlmProfileInput) {
  const id = input.profile.id || randomUUID()
  const credentialReference = `llm-provider-${id}`
  const config = await llmUpsertProfile(appConfigPath, {
    ...input.profile,
    id,
    credentialReference,
  })
  if (input.clearCredential)
    await SecureStore.deleteItemAsync(credentialReference)
  else if (input.credential?.trim())
    await SecureStore.setItemAsync(credentialReference, input.credential.trim())
  return hydrate(config)
}
export async function removeLlmProfile(id: string) {
  const previous = await llmGetConfig(appConfigPath)
  const config = await llmRemoveProfile(appConfigPath, id)
  const reference = previous.profiles.find(
    (profile) => profile.id === id,
  )?.credentialReference
  if (reference) await SecureStore.deleteItemAsync(reference)
  return hydrate(config)
}
export async function selectLlmProfile(id?: string) {
  return hydrate(await llmSelectProfile(appConfigPath, id))
}
async function inputCredential(input: LlmProfileInput) {
  if (input.clearCredential) return undefined
  if (input.credential?.trim()) return input.credential.trim()
  const config = await llmGetConfig(appConfigPath)
  const reference = config.profiles.find(
    (profile) => profile.id === input.profile.id,
  )?.credentialReference
  return reference
    ? ((await SecureStore.getItemAsync(reference)) ?? undefined)
    : undefined
}
export async function listLlmModels(
  input: LlmProfileInput,
  signal?: AbortSignal,
) {
  return llmListModels(
    {
      ...input.profile,
      id: input.profile.id || "preview",
      model: input.profile.model || "discovery",
      credentialReference: undefined,
    },
    await inputCredential(input),
    signal ? { signal } : undefined,
  )
}
export async function probeLlmProfile(
  input: LlmProfileInput,
  signal?: AbortSignal,
) {
  return llmProbe(
    {
      ...input.profile,
      id: input.profile.id || "preview",
      credentialReference: undefined,
    },
    await inputCredential(input),
    signal ? { signal } : undefined,
  )
}
