jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    readSyncDatabaseScheduleState: jest.fn(),
    writeSyncDatabaseScheduleState: jest.fn(),
    markSyncDatabaseScheduleSucceeded: jest.fn(),
  },
}))

jest.mock("@/src/services/db/library-db", () => ({
  getLibraryDatabase: jest.fn(),
}))

import type { Library } from "@my-reader/tools/types/library"

import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { getLibraryDatabase } from "@/src/services/db/library-db"
import {
  markLibrarySidecarSyncSucceeded,
  readLibrarySidecarScheduleState,
  writeLibrarySidecarScheduleState,
} from "./library-sidecar-schedule"

const library = { id: "library-1" } as Library
const databasePath = "/library/.myreader/myreader.db"
const schedule = {
  lastSuccessfulPullAt: 100,
  nextRetryAt: 200,
  transientFailureCount: 2,
  suspendedReason: "network",
}

describe("library sidecar schedule repository", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(getLibraryDatabase).mockResolvedValue({
      path: databasePath,
    } as never)
  })

  it("should return shared Rust state when schedule is read", async () => {
    jest
      .mocked(MyReaderRustComponents.readSyncDatabaseScheduleState)
      .mockResolvedValue(schedule)

    await expect(readLibrarySidecarScheduleState(library)).resolves.toEqual(
      schedule,
    )
  })

  it("should preserve every field when schedule is written", async () => {
    await writeLibrarySidecarScheduleState(library, schedule)

    expect(
      MyReaderRustComponents.writeSyncDatabaseScheduleState,
    ).toHaveBeenCalledWith(
      databasePath,
      schedule.lastSuccessfulPullAt,
      schedule.nextRetryAt,
      schedule.transientFailureCount,
      schedule.suspendedReason,
    )
  })

  it("should preserve last pull when push success has no pull timestamp", async () => {
    await markLibrarySidecarSyncSucceeded(library, null)

    expect(
      MyReaderRustComponents.markSyncDatabaseScheduleSucceeded,
    ).toHaveBeenCalledWith(databasePath, null)
  })
})
