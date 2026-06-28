import type {
  ScheduledSyncTarget,
  SyncLibraryOptions,
  SyncPolicyEntry,
  SyncTrigger,
  SyncTriggerPolicy,
} from "./types"

export const READING_SYNC_INTERVAL_MS = 60_000
export const LIBRARY_SYNC_INTERVAL_MS = 180_000

export const DEFAULT_SYNC_POLICY: SyncTriggerPolicy = {
  manual: {
    enabled: true,
    options: { scope: "all", forceCalibre: false, throwOnFailure: true },
  },
  add: {
    enabled: true,
    options: { scope: "all", forceCalibre: true, throwOnFailure: true },
  },
  startup: {
    enabled: true,
    options: { scope: "all", forceCalibre: false, throwOnFailure: false },
  },
  scheduled: {
    reading: {
      enabled: true,
      intervalMs: READING_SYNC_INTERVAL_MS,
      options: {
        scope: "myreader",
        myreaderMode: "push_only",
        throwOnFailure: false,
      },
    },
    library: {
      enabled: true,
      intervalMs: LIBRARY_SYNC_INTERVAL_MS,
      options: {
        scope: "myreader",
        myreaderMode: "full",
        throwOnFailure: false,
      },
    },
  },
}

/** Resolves effective sync options for a trigger; returns null when disabled. */
export function resolveSyncOptions(
  trigger: SyncTrigger,
  policy: SyncTriggerPolicy = DEFAULT_SYNC_POLICY,
  scheduledTarget?: ScheduledSyncTarget,
  overrides?: Partial<SyncLibraryOptions>,
): SyncLibraryOptions | null {
  let entry: SyncPolicyEntry
  switch (trigger) {
    case "manual":
      entry = policy.manual
      break
    case "add":
      entry = policy.add
      break
    case "startup":
      entry = policy.startup
      break
    case "scheduled":
      entry =
        scheduledTarget === "reading"
          ? policy.scheduled.reading
          : policy.scheduled.library
      break
  }

  if (!entry.enabled) return null
  return { ...entry.options, ...overrides }
}

export function scopeHasCalibre(options: SyncLibraryOptions): boolean {
  const scope = options.scope ?? "all"
  return scope === "all" || scope === "calibre"
}

export function scopeHasMyreader(options: SyncLibraryOptions): boolean {
  const scope = options.scope ?? "all"
  return scope === "all" || scope === "myreader"
}
