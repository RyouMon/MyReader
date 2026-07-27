jest.mock("@/src/repos/library-sidecar-sync", () => ({
  readLibrarySidecarBookmark: jest.fn(),
  withLibrarySidecarSyncTransaction: jest.fn(),
}))
jest.mock("./automerge-store", () => ({
  commitLibrarySidecarAutomergeMutation: jest.fn(),
}))
jest.mock("./automerge-document", () => ({
  librarySidecarBookmarkProjections: jest.fn(),
}))
jest.mock("./identity", () => ({
  ensureLibrarySidecarIdentity: jest.fn(),
}))
jest.mock("@/src/utils/common", () => ({
  uuid: jest.fn(() => "018f2f8d980b40efb72ec6e86cb70001"),
}))

import type { Library } from "@my-reader/tools/types/library"

import {
  readLibrarySidecarBookmark,
  withLibrarySidecarSyncTransaction,
} from "@/src/repos/library-sidecar-sync"
import { librarySidecarBookmarkProjections } from "./automerge-document"
import { commitLibrarySidecarAutomergeMutation } from "./automerge-store"
import { addLocalBookmark, removeLocalBookmark } from "./bookmark"
import { ensureLibrarySidecarIdentity } from "./identity"

const library = { id: "library-1" } as Library
const document = {} as never
const tx = {} as never
const identity = {
  libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
  replicaId: "018f2f8d-980b-40ef-b72e-c6e86cb7cc29",
}
let selectedCommand: unknown

describe("Automerge bookmark", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(ensureLibrarySidecarIdentity).mockResolvedValue(identity)
    jest
      .mocked(commitLibrarySidecarAutomergeMutation)
      .mockImplementation(async (_library, _identity, _now, selectCommand) => {
        selectedCommand = selectCommand(document)
        return document
      })
    jest
      .mocked(withLibrarySidecarSyncTransaction)
      .mockImplementation(async (_library, operation) => operation(tx))
    jest.mocked(librarySidecarBookmarkProjections).mockReturnValue([])
  })

  it("should submit a bookmark command when a bookmark is added", async () => {
    const locator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
    }
    jest.mocked(readLibrarySidecarBookmark).mockResolvedValue({
      id: "018f2f8d980b40efb72ec6e86cb70001",
      bookId: 42,
      format: "EPUB",
      locatorKey: "chapter.xhtml",
      locatorJson: JSON.stringify(locator),
      createdAt: 900,
      updatedAt: 900,
      deletedAt: null,
    })

    await addLocalBookmark(library, 42, "epub", "chapter.xhtml", locator, 900)

    expect(selectedCommand).toEqual({
      type: "setBookmark",
      value: {
        id: "018f2f8d980b40efb72ec6e86cb70001",
        bookId: 42,
        format: "EPUB",
        locatorKey: "chapter.xhtml",
        locatorJson: JSON.stringify(locator),
        createdAt: 900,
        deletedAt: null,
        recordedAt: 900,
        replicaId: identity.replicaId,
      },
    })
  })

  it("should create a tombstone when an active bookmark is removed", async () => {
    jest.mocked(librarySidecarBookmarkProjections).mockReturnValue([
      {
        id: "bookmark-id",
        bookId: 42,
        format: "EPUB",
        locatorKey: "chapter.xhtml",
        locatorJson: '{"href":"chapter.xhtml","type":"application/xhtml+xml"}',
        createdAt: 700,
        deletedAt: null,
        recordedAt: 700,
        replicaId: identity.replicaId,
      },
    ])

    await removeLocalBookmark(library, 42, "EPUB", "chapter.xhtml", 900)

    expect(selectedCommand).toEqual({
      type: "setBookmark",
      value: expect.objectContaining({
        id: "bookmark-id",
        deletedAt: 900,
        recordedAt: 900,
      }),
    })
  })
})
