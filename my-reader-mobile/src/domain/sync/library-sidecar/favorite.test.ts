jest.mock("./automerge-store", () => ({
  commitLibrarySidecarAutomergeMutation: jest.fn(),
}))
jest.mock("./automerge-document", () => ({
  librarySidecarFavoriteProjections: jest.fn(),
}))
jest.mock("./identity", () => ({
  ensureLibrarySidecarIdentity: jest.fn(),
}))
import type { Library } from "@my-reader/tools/types/library"

import { librarySidecarFavoriteProjections } from "./automerge-document"
import { commitLibrarySidecarAutomergeMutation } from "./automerge-store"
import { writeLocalFavorite } from "./favorite"
import { ensureLibrarySidecarIdentity } from "./identity"

const library = { id: "library-1" } as Library
const document = {} as never
const identity = {
  libraryUuid: "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
  replicaId: "018f2f8d-980b-40ef-b72e-c6e86cb7cc29",
}
let selectedCommand: unknown

describe("Automerge favorite", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(ensureLibrarySidecarIdentity).mockResolvedValue(identity)
    jest
      .mocked(commitLibrarySidecarAutomergeMutation)
      .mockImplementation(async (_library, _identity, _now, selectCommand) => {
        selectedCommand = selectCommand(document)
        return document
      })
    jest.mocked(librarySidecarFavoriteProjections).mockReturnValue([])
  })

  it("should submit a favorite command when a book is favorited", async () => {
    await writeLocalFavorite(library, 42, true, 900)

    expect(selectedCommand).toEqual({
      type: "setFavorite",
      bookId: 42,
      value: {
        isFavorite: true,
        addedAt: 900,
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

  it("should avoid a duplicate change when favorite state is unchanged", async () => {
    jest.mocked(librarySidecarFavoriteProjections).mockReturnValue([
      {
        bookId: 42,
        value: {
          isFavorite: true,
          addedAt: 700,
          recordedAt: 700,
          replicaId: identity.replicaId,
        },
      },
    ])

    await writeLocalFavorite(library, 42, true, 900)

    expect(selectedCommand).toBeNull()
  })
})
