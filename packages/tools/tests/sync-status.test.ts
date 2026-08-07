import { describe, expect, it } from "vitest"

import {
  deriveSyncIndicatorState,
  parseSyncReason,
  parseSyncStage,
} from "../src/sync-status"

describe("sync status projection", () => {
  it("should preserve the Core stage names without creating combined stages", () => {
    expect(parseSyncStage("pushing")).toBe("pushing")
    expect(parseSyncStage("pulling_failed")).toBe("pulling")
    expect(parseSyncStage("pushing_pulling")).toBeNull()
  })

  it("should accept only the shared sync reason contract", () => {
    expect(parseSyncReason("manual")).toBe("manual")
    expect(parseSyncReason("local_change")).toBe("local_change")
    expect(parseSyncReason("periodic_check")).toBeNull()
  })

  it("should give the active Core stage priority over previous outcomes", () => {
    expect(
      deriveSyncIndicatorState({
        isRunning: true,
        stage: "pushing",
        lastResult: "failure",
        isOffline: true,
      }),
    ).toBe("pushing")
  })

  it("should keep a failure visible until a later successful run", () => {
    expect(
      deriveSyncIndicatorState({
        isRunning: false,
        lastResult: "failure",
        isOffline: true,
      }),
    ).toBe("failed")
  })

  it("should show a recent success briefly before returning to idle", () => {
    const completedAt = 10_000
    const input = {
      isRunning: false,
      lastResult: "success" as const,
      lastCompletedAt: completedAt,
    }

    expect(deriveSyncIndicatorState(input, completedAt + 4_999)).toBe(
      "recent_success",
    )
    expect(deriveSyncIndicatorState(input, completedAt + 5_001)).toBe("idle")
  })

  it("should show unchanged briefly without replacing the previous outcome", () => {
    const completedAt = 10_000
    const input = {
      isRunning: false,
      lastResult: "failure" as const,
      unchangedCompletedAt: completedAt,
    }

    expect(deriveSyncIndicatorState(input, completedAt + 4_999)).toBe(
      "unchanged",
    )
    expect(deriveSyncIndicatorState(input, completedAt + 5_001)).toBe("failed")
  })

  it("should only show offline when no failure or operation is active", () => {
    expect(
      deriveSyncIndicatorState({ isRunning: false, isOffline: true }),
    ).toBe("offline")
  })
})
