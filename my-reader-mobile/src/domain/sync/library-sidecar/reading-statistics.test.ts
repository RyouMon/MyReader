jest.mock("./database-store", () => ({
  commitLibrarySidecarMutation: jest.fn(),
}))
jest.mock("./document-contract", () => ({
  librarySidecarReadingCompletionRecords: jest.fn(),
}))
jest.mock("./identity", () => ({
  ensureLibrarySidecarIdentity: jest.fn(),
}))

import type { Library } from "@my-reader/tools/types/library"

import { librarySidecarReadingCompletionRecords } from "./document-contract"
import { commitLibrarySidecarMutation } from "./database-store"
import { ensureLibrarySidecarIdentity } from "./identity"
import {
  addLocalReadingCompletion,
  addLocalReadingSessionInterval,
} from "./reading-statistics"

const library = { id: "library-1" } as Library
const document = {} as never
const identity = {
  libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
  replicaId: "018f2f8d-980b-40ef-b72e-c6e86cb7cc29",
}
let selectedCommand: unknown

describe("Automerge reading statistics", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(ensureLibrarySidecarIdentity).mockResolvedValue(identity)
    jest
      .mocked(commitLibrarySidecarMutation)
      .mockImplementation(async (_library, _identity, _now, selectCommand) => {
        selectedCommand = selectCommand(document)
        return document
      })
    jest.mocked(librarySidecarReadingCompletionRecords).mockReturnValue([])
  })

  it("should add interval duration to an origin-owned session when heartbeat persists", async () => {
    await addLocalReadingSessionInterval(library, {
      id: "018f2f8d980b40efb72ec6e86cb70001",
      bookId: 42,
      format: "epub",
      localDay: "2026-07-25",
      startedAt: 100,
      durationSeconds: 30,
      updatedAt: 130,
    })

    expect(selectedCommand).toEqual({
      type: "addReadingSessionDuration",
      value: expect.objectContaining({
        format: "EPUB",
        originReplicaId: identity.replicaId,
        durationSeconds: 30,
      }),
    })
  })

  it("should avoid another completion record when an earlier completion already exists", async () => {
    jest.mocked(librarySidecarReadingCompletionRecords).mockReturnValue([
      {
        id: "018f2f8d980b40efb72ec6e86cb70001",
        bookId: 42,
        format: "EPUB",
        localDay: "2026-07-24",
        completedAt: 100,
        updatedAt: 100,
        replicaId: identity.replicaId,
      },
    ])

    await expect(
      addLocalReadingCompletion(library, {
        id: "018f2f8d980b40efb72ec6e86cb70002",
        bookId: 42,
        format: "EPUB",
        localDay: "2026-07-25",
        completedAt: 200,
        updatedAt: 200,
      }),
    ).resolves.toBe(false)
    expect(selectedCommand).toBeNull()
  })
})
