import { Directory, Paths } from "expo-file-system"
import { randomUUID } from "expo-crypto"
import { runTtsRequest } from "@my-reader/tools/tts-request"
import {
  ttsGetConfig,
  ttsChangeUsage,
  type TtsModelVoices,
  ttsSaveProvider,
  type TtsProvider,
  type TtsModel,
  ttsQwenModels,
  ttsQwenPresets,
  ttsDiscoverQwenVoices,
  type QwenTtsModel,
  type QwenTtsPreset,
  ttsListVoices,
  ttsRemoveProfile,
  ttsSetDefaultEngine,
  ttsSetPlayback,
  ttsSetVoice,
  ttsSynthesize,
  ttsPreviewProvider,
  ttsDiscoverModels,
  ttsUpsertProfile,
  type TtsAudioArtifact,
  type TtsConfig,
  type TtsEngine,
  type TtsLanguageVoice,
  type TtsPlayback,
  type TtsProviderProfile,
  type TtsSynthesisRequest,
  type TtsVoice,
} from "my-reader-core"
import {
  deleteTtsCredential,
  readTtsCredential,
  ttsCredentialReference,
  writeTtsCredential,
} from "../storage/credentials"
import { appConfigPath } from "./app-config"
import { toNativeFilesystemPath } from "../fs/path"
import { invalidateBookNarration } from "../query/invalidate-table"

export type MobileTtsProviderProfile = TtsProviderProfile & {
  hasCredential: boolean
}

export type MobileTtsModel = TtsModel
export type MobileTtsProvider = TtsProvider & { hasCredential: boolean }
export type MobileTtsConfig = Omit<TtsConfig, "profiles" | "providers"> & {
  providers: MobileTtsProvider[]
  profiles: MobileTtsProviderProfile[]
}

export type UpsertMobileTtsProfileInput = {
  profile: Omit<
    TtsProviderProfile,
    "id" | "credentialReference" | "revision"
  > & {
    id?: string
  }
  credential?: string
  clearCredential?: boolean
}

const ttsCachePath = toNativeFilesystemPath(
  new Directory(Paths.cache, "tts").uri,
)

async function hydrateConfig(config: TtsConfig): Promise<MobileTtsConfig> {
  const profiles = await Promise.all(
    config.profiles.map(async (profile) => ({
      ...profile,
      hasCredential: profile.credentialReference
        ? Boolean(await readTtsCredential(profile.credentialReference))
        : false,
    })),
  )
  const providers = await Promise.all(
    config.providers.map(async (provider) => ({
      ...provider,
      hasCredential: provider.credentialReference
        ? Boolean(await readTtsCredential(provider.credentialReference))
        : false,
    })),
  )
  return { ...config, profiles, providers }
}

async function resolveCredential(
  profileId: string,
): Promise<string | undefined> {
  const profile = (await ttsGetConfig(appConfigPath)).providers.find(
    (candidate) =>
      candidate.id === profileId ||
      candidate.models.some((model) => model.id === profileId),
  )
  if (!profile) throw new Error(`TTS_PROFILE_NOT_FOUND: ${profileId}`)
  if (!profile.credentialReference) return undefined
  return (await readTtsCredential(profile.credentialReference)) ?? undefined
}

export async function getTtsConfig(): Promise<MobileTtsConfig> {
  return hydrateConfig(await ttsGetConfig(appConfigPath))
}

export async function getQwenTtsModels(
  input: { endpoint: string; profileId?: string; credential?: string },
  signal?: AbortSignal,
): Promise<QwenTtsModel[]> {
  const credential =
    input.credential?.trim() ||
    (input.profileId ? await resolveCredential(input.profileId) : undefined)
  return ttsQwenModels(
    input.endpoint,
    credential,
    signal ? { signal } : undefined,
  )
}

export function getQwenTtsPresets(): QwenTtsPreset[] {
  return ttsQwenPresets()
}

export async function discoverQwenTtsVoices(
  input: {
    endpoint: string
    model: string
    profileId?: string
    credential?: string
  },
  signal?: AbortSignal,
): Promise<TtsVoice[]> {
  const credential =
    input.credential?.trim() ||
    (input.profileId ? await resolveCredential(input.profileId) : undefined)
  return ttsDiscoverQwenVoices(
    input.endpoint,
    input.model,
    credential,
    signal ? { signal } : undefined,
  )
}

async function draftCredential(input: UpsertMobileTtsProfileInput) {
  if (input.clearCredential) return undefined
  return (
    input.credential?.trim() ||
    (input.profile.id ? await resolveCredential(input.profile.id) : undefined)
  )
}

function draftProfile(input: UpsertMobileTtsProfileInput): TtsProviderProfile {
  return {
    ...input.profile,
    id: input.profile.id ?? "",
    revision: 1,
    credentialReference: undefined,
  }
}

export async function discoverTtsModels(
  input: UpsertMobileTtsProfileInput,
  signal?: AbortSignal,
): Promise<string[]> {
  return ttsDiscoverModels(
    draftProfile(input),
    await draftCredential(input),
    signal ? { signal } : undefined,
  )
}

export async function previewTtsProvider(
  input: UpsertMobileTtsProfileInput,
  text: string,
  signal?: AbortSignal,
): Promise<TtsAudioArtifact> {
  return ttsPreviewProvider(
    draftProfile(input),
    ttsCachePath,
    text,
    await draftCredential(input),
    signal ? { signal } : undefined,
  )
}

export async function upsertTtsProfile(
  input: UpsertMobileTtsProfileInput,
): Promise<MobileTtsConfig> {
  if (
    input.profile.kind !== "openAiCompatible" &&
    input.profile.kind !== "qwen"
  ) {
    throw new Error(`TTS_PROVIDER_KIND_UNSUPPORTED: ${input.profile.kind}`)
  }
  const current = await ttsGetConfig(appConfigPath)
  const id = input.profile.id?.trim() || randomUUID()
  const existing = current.profiles.find((profile) => profile.id === id)
  const credential = input.credential?.trim()
  const credentialReference =
    existing?.credentialReference ?? ttsCredentialReference(id)

  const config = await ttsUpsertProfile(appConfigPath, {
    ...input.profile,
    id,
    credentialReference,
    revision: existing?.revision ?? 1,
  })
  await invalidateBookNarration()

  if (input.clearCredential && credentialReference) {
    await deleteTtsCredential(credentialReference)
  } else if (credential && credentialReference) {
    await writeTtsCredential(credentialReference, credential)
  }

  return hydrateConfig(config)
}

export async function saveTtsProvider(input: {
  provider: Omit<MobileTtsProvider, "credentialReference" | "hasCredential">
  credential?: string
  clearCredential?: boolean
}): Promise<MobileTtsConfig> {
  const current = await ttsGetConfig(appConfigPath)
  const id = input.provider.id || randomUUID()
  const credentialReference =
    current.providers.find((provider) => provider.id === id)
      ?.credentialReference ?? ttsCredentialReference(id)
  const config = await ttsSaveProvider(appConfigPath, {
    ...input.provider,
    id,
    credentialReference,
  })
  await invalidateBookNarration()
  if (input.clearCredential) await deleteTtsCredential(credentialReference)
  else if (input.credential?.trim())
    await writeTtsCredential(credentialReference, input.credential.trim())
  return hydrateConfig(config)
}

export async function removeTtsProfile(
  profileId: string,
): Promise<MobileTtsConfig> {
  const current = await ttsGetConfig(appConfigPath)
  const reference = current.providers.find(
    (profile) => profile.id === profileId,
  )?.credentialReference
  const config = await ttsRemoveProfile(appConfigPath, profileId)
  await invalidateBookNarration()
  if (reference) await deleteTtsCredential(reference)
  return hydrateConfig(config)
}

export async function setTtsDefaultEngine(
  engine: TtsEngine,
): Promise<MobileTtsConfig> {
  if (engine.kind === "provider" && engine.profileId) {
    await resolveCredential(engine.profileId)
  }
  return hydrateConfig(await ttsSetDefaultEngine(appConfigPath, engine))
}

export async function setTtsPlayback(
  playback: TtsPlayback,
): Promise<MobileTtsConfig> {
  return hydrateConfig(await ttsSetPlayback(appConfigPath, playback))
}

export async function setTtsVoice(
  language: string,
  voice?: TtsLanguageVoice,
): Promise<MobileTtsConfig> {
  return hydrateConfig(await ttsSetVoice(appConfigPath, language, voice))
}

export async function listTtsVoices(profileId: string): Promise<TtsVoice[]> {
  return ttsListVoices(
    appConfigPath,
    profileId,
    await resolveCredential(profileId),
  )
}

export async function synthesizeTts(
  request: TtsSynthesisRequest,
  options?: { signal?: AbortSignal },
): Promise<TtsAudioArtifact> {
  return runTtsRequest(async (signal) => {
    const credential = await resolveCredential(request.profileId)
    if (signal.aborted) {
      const error = new Error("TTS_SYNTHESIS_CANCELLED")
      error.name = "AbortError"
      throw error
    }
    return ttsSynthesize(appConfigPath, ttsCachePath, request, credential, {
      signal,
    })
  }, options?.signal)
}

export type {
  QwenTtsModel,
  QwenTtsPreset,
  TtsAudioArtifact,
  TtsConfig,
  TtsEngine,
  TtsLanguageVoice,
  TtsPlayback,
  TtsProviderProfile,
  TtsSynthesisRequest,
  TtsVoice,
}

export function getTtsChangeUsage(
  providerId: string,
  models: TtsModelVoices[],
) {
  return ttsChangeUsage(appConfigPath, providerId, models)
}
