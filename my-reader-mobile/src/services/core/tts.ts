import { Directory, Paths } from "expo-file-system"
import { randomUUID } from "expo-crypto"
import {
  ttsGetConfig,
  ttsQwenModels,
  ttsQwenPresets,
  ttsDiscoverQwenVoices,
  type QwenTtsModel,
  type QwenTtsPreset,
  ttsListVoices,
  ttsProbeProvider,
  ttsProviderCapabilities,
  ttsRemoveProfile,
  ttsSetDefaultEngine,
  ttsSetPlayback,
  ttsSetVoice,
  ttsSynthesize,
  ttsUpsertProfile,
  type TtsAudioArtifact,
  type TtsConfig,
  type TtsEngine,
  type TtsLanguageVoice,
  type TtsPlayback,
  type TtsProviderCapabilities,
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

export type MobileTtsProviderProfile = TtsProviderProfile & {
  hasCredential: boolean
}

export type MobileTtsConfig = Omit<TtsConfig, "profiles"> & {
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
  return { ...config, profiles }
}

async function resolveCredential(
  profileId: string,
): Promise<string | undefined> {
  const profile = (await ttsGetConfig(appConfigPath)).profiles.find(
    (candidate) => candidate.id === profileId,
  )
  if (!profile) throw new Error(`TTS_PROFILE_NOT_FOUND: ${profileId}`)
  if (!profile.credentialReference) return undefined
  return (await readTtsCredential(profile.credentialReference)) ?? undefined
}

export async function getTtsConfig(): Promise<MobileTtsConfig> {
  return hydrateConfig(await ttsGetConfig(appConfigPath))
}

export function getQwenTtsModels(endpoint?: string): QwenTtsModel[] {
  return ttsQwenModels(endpoint)
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

  if (input.clearCredential && credentialReference) {
    await deleteTtsCredential(credentialReference)
  } else if (credential && credentialReference) {
    await writeTtsCredential(credentialReference, credential)
  }

  return hydrateConfig(config)
}

export async function removeTtsProfile(
  profileId: string,
): Promise<MobileTtsConfig> {
  const current = await ttsGetConfig(appConfigPath)
  const reference = current.profiles.find(
    (profile) => profile.id === profileId,
  )?.credentialReference
  const config = await ttsRemoveProfile(appConfigPath, profileId)
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

export function getTtsProviderCapabilities(
  profileId: string,
): Promise<TtsProviderCapabilities> {
  return ttsProviderCapabilities(appConfigPath, profileId)
}

export async function probeTtsProvider(
  profileId: string,
): Promise<TtsProviderCapabilities> {
  return ttsProbeProvider(
    appConfigPath,
    profileId,
    await resolveCredential(profileId),
  )
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
  const credential = await resolveCredential(request.profileId)
  return ttsSynthesize(
    appConfigPath,
    ttsCachePath,
    request,
    credential,
    options?.signal ? { signal: options.signal } : undefined,
  )
}

export type {
  QwenTtsModel,
  QwenTtsPreset,
  TtsAudioArtifact,
  TtsConfig,
  TtsEngine,
  TtsLanguageVoice,
  TtsPlayback,
  TtsProviderCapabilities,
  TtsProviderProfile,
  TtsSynthesisRequest,
  TtsVoice,
}
