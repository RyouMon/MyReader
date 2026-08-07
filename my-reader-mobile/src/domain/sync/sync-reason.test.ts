import {
  syncReasonForCoordinatorReasons,
  syncReasonForTrigger,
} from "./sync-reason"

describe("sync reason projection", () => {
  it("should distinguish manual, local-change, and automatic-check triggers", () => {
    expect(syncReasonForTrigger("manual")).toBe("manual")
    expect(syncReasonForTrigger("scheduled", "reading")).toBe("local_change")
    expect(syncReasonForTrigger("startup")).toBe("automatic_check")
    expect(syncReasonForTrigger("add")).toBe("automatic_check")
    expect(syncReasonForTrigger("scheduled", "library")).toBe("automatic_check")
  })

  it("should prefer a local change when coordinator reasons are coalesced", () => {
    expect(
      syncReasonForCoordinatorReasons(["safety_sweep", "local_change"]),
    ).toBe("local_change")
    expect(syncReasonForCoordinatorReasons(["app_foregrounded"])).toBe(
      "automatic_check",
    )
    expect(syncReasonForCoordinatorReasons(["app_backgrounding"])).toBe(
      "automatic_check",
    )
  })
})
