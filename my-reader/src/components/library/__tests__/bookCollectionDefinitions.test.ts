import { describe, expect, it } from "vitest"
import {
  getVisibleStorageBookCollections,
  getVisibleTransferBookCollections,
} from "../bookCollectionDefinitions"

describe("desktop book collection definitions", () => {
  it("should show only transfer collections that currently contain books", () => {
    expect(
      getVisibleTransferBookCollections({ downloading: 2, uploading: 0 }).map(
        (collection) => collection.id,
      ),
    ).toEqual(["downloading"])

    expect(
      getVisibleTransferBookCollections({
        downloading: 0,
        uploading: 0,
      }),
    ).toEqual([])
  })

  it("should show local-only only while local files await upload", () => {
    expect(
      getVisibleStorageBookCollections(true).map((collection) => collection.id),
    ).toEqual(["localOnly"])
    expect(getVisibleStorageBookCollections(false)).toEqual([])
  })
})
