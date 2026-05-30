import { randomUUID } from "expo-crypto";

/** UUID4 as 32-char hex string (no hyphens). */
export function uuid(): string {
  return randomUUID().replace(/-/g, "");
}

/** Converts an unknown thrown value into a human-readable string. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Yield to the event loop to prevent blocking the JS thread. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type IdleWorkHandle = ReturnType<typeof globalThis.requestIdleCallback>;

/**
 * Schedules non-critical work during idle time (RN-recommended replacement for
 * deprecated InteractionManager.runAfterInteractions).
 */
export function scheduleIdleWork(callback: () => void): IdleWorkHandle {
  if (typeof globalThis.requestIdleCallback === "function") {
    return globalThis.requestIdleCallback(callback);
  }
  return setTimeout(callback, 1) as unknown as IdleWorkHandle;
}

/** Cancels work scheduled by {@link scheduleIdleWork}. */
export function cancelIdleWork(handle: IdleWorkHandle): void {
  if (typeof globalThis.cancelIdleCallback === "function") {
    globalThis.cancelIdleCallback(handle);
  } else {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
}
