import { getActiveTransferBookCollections } from "./book-collection-definitions"

jest.mock("@expo/material-symbols/cloud_off.xml", () => ({ uri: "cloud-off" }))
jest.mock("@expo/material-symbols/download.xml", () => ({ uri: "download" }))
jest.mock("@expo/material-symbols/downloading.xml", () => ({
  uri: "downloading",
}))
jest.mock("@expo/material-symbols/history.xml", () => ({ uri: "history" }))
jest.mock("@expo/material-symbols/star.xml", () => ({ uri: "star" }))
jest.mock("@expo/material-symbols/upload.xml", () => ({ uri: "upload" }))
jest.mock("@/assets/icons/book_2.xml", () => ({ uri: "book" }))

describe("getActiveTransferBookCollections", () => {
  it("should return only transfer collections that currently contain books", () => {
    const result = getActiveTransferBookCollections({
      all: 4,
      recentlyRead: 0,
      favorites: 0,
      downloaded: 1,
      downloading: 2,
      uploading: 0,
      localOnly: 1,
    })

    expect(result.map((collection) => collection.id)).toEqual(["downloading"])
  })
})
