jest.mock("my-reader-core", () => ({
  CoreFfiError: {
    DataIntegrity: {
      instanceOf: (error: unknown) =>
        (error as { tag?: string }).tag === "DataIntegrity",
    },
  },
  syncRunSidecar: jest.fn(),
}))

import { syncRunSidecar } from "my-reader-core"
import { DataIntegrityError } from "@/src/errors"

import { syncLibrarySidecar } from "./sync"

describe("core sync adapter", () => {
  it("should preserve data integrity error when native sidecar sync rejects", async () => {
    jest.mocked(syncRunSidecar).mockRejectedValue({
      tag: "DataIntegrity",
      message: "Remote object change.am is corrupt",
    })

    await expect(
      syncLibrarySidecar({
        taskId: "task-1",
        sidecarRootPath: "/sidecar",
        libraryRootPath: "/library",
        nowMs: 100,
        mode: "full",
        storage: { kind: "local-direct", root: "/library" },
      }),
    ).rejects.toEqual(
      new DataIntegrityError("Remote object change.am is corrupt"),
    )
  })
})
