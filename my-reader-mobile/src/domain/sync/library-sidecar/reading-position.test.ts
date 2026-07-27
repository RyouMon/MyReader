jest.mock("./automerge-store", () => ({
  commitLibrarySidecarAutomergeMutation: jest.fn(),
  ensureLibrarySidecarAutomergeState: jest.fn(),
}))

jest.mock("./automerge-document", () => ({
  librarySidecarReadingPositionCandidates: jest.fn(),
}))

jest.mock("./identity", () => ({
  ensureLibrarySidecarIdentity: jest.fn(),
}))

import type { Library } from "@my-reader/tools/types/library"

import {
  commitLibrarySidecarAutomergeMutation,
  ensureLibrarySidecarAutomergeState,
} from "./automerge-store"
import { librarySidecarReadingPositionCandidates } from "./automerge-document"
import { ensureLibrarySidecarIdentity } from "./identity"
import {
  getReadingPositionCandidates,
  writeLocalReadingPosition,
} from "./reading-position"

const library = {
  id: "library-1",
  name: "Library",
  path: "file:///library",
  addedAt: 0,
  bookCount: 1,
  sourceType: "local",
} as Library

const identity = {
  libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
  replicaId: "018f2f8d-980b-40ef-b72e-c6e86cb7cc29",
}
const document = {} as never
let selectedCommand: unknown

describe("Automerge reading position", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(ensureLibrarySidecarIdentity).mockResolvedValue(identity)
    jest
      .mocked(commitLibrarySidecarAutomergeMutation)
      .mockImplementation(async (_library, _identity, _now, selectCommand) => {
        selectedCommand = selectCommand(document)
        return document
      })
  })

  it("should submit a reading position command when progress changes", async () => {
    await writeLocalReadingPosition(
      library,
      {
        bookId: 42,
        format: "epub",
        locator: {
          href: "chapter-1.xhtml",
          type: "application/xhtml+xml",
          locations: { progression: 0.1 },
        },
        displayProgression: 0.125,
      },
      900,
    )

    expect(selectedCommand).toEqual({
      type: "setReadingPosition",
      bookId: 42,
      value: {
        format: "EPUB",
        locatorJson: JSON.stringify({
          href: "chapter-1.xhtml",
          type: "application/xhtml+xml",
          locations: { progression: 0.1 },
        }),
        displayProgressionPpm: 125_000,
        recordedAt: 900,
        replicaId: identity.replicaId,
      },
    })
    expect(commitLibrarySidecarAutomergeMutation).toHaveBeenCalledWith(
      library,
      identity,
      900,
      expect.any(Function),
    )
  })

  it("should expose all concurrent candidates when the reader opens a conflicted position", async () => {
    const candidates = [
      {
        operationId: "1@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        value: {
          format: "PDF" as const,
          locatorJson: '{"href":"page=7","type":"application/pdf"}',
          displayProgressionPpm: 700_000,
          recordedAt: 10,
          replicaId: identity.replicaId,
        },
      },
    ]
    jest.mocked(ensureLibrarySidecarAutomergeState).mockResolvedValue(document)
    jest
      .mocked(librarySidecarReadingPositionCandidates)
      .mockReturnValue(candidates)

    await expect(
      getReadingPositionCandidates(library, 42, "pdf"),
    ).resolves.toEqual(candidates)
  })
})
