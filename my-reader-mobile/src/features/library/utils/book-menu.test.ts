import { buildBookMenuActions } from "./book-menu"

describe("buildBookMenuActions", () => {
  it("should return detail, favorite and share actions when no readable formats", () => {
    const actions = buildBookMenuActions("notDownloaded", {
      isRemote: false,
      isFavorite: false,
      formats: [],
    })

    expect(actions.map((a) => a.id)).toEqual(["detail", "favorite", "share"])
    expect(actions.find((a) => a.id === "favorite")?.title).toBe(
      "Add to Favorites",
    )
  })

  it("should use remove from favorites title when book is favorite", () => {
    const actions = buildBookMenuActions("notDownloaded", {
      isRemote: false,
      isFavorite: true,
      formats: [],
    })

    expect(actions.find((a) => a.id === "favorite")?.title).toBe(
      "Remove from Favorites",
    )
  })

  it("should share single format directly when only one readable format exists", () => {
    const actions = buildBookMenuActions("downloaded", {
      isRemote: false,
      formats: ["EPUB"],
    })

    const share = actions.find((a) => a.id === "share:EPUB")
    expect(share).toBeDefined()
    expect(share?.title).toBe("Share")
  })

  it("should use submenu when multiple formats are available", () => {
    const actions = buildBookMenuActions("downloaded", {
      isRemote: false,
      formats: ["EPUB", "PDF"],
    })

    const share = actions.find((a) => a.id === "share")
    expect(share).toBeDefined()
    expect(share?.subactions).toHaveLength(2)
    expect(share?.subactions?.map((a) => a.id)).toEqual([
      "share:EPUB",
      "share:PDF",
    ])
  })

  it("should offer cancel download when remote book is downloading", () => {
    const actions = buildBookMenuActions("downloading", {
      isRemote: true,
      formats: ["EPUB"],
    })

    expect(actions.map((a) => a.id)).toEqual([
      "detail",
      "favorite",
      "share:EPUB",
      "cancelDownload",
    ])
  })

  it("should offer single-format download when remote book is not downloaded", () => {
    const actions = buildBookMenuActions("notDownloaded", {
      isRemote: true,
      formats: ["EPUB"],
    })

    expect(actions.map((a) => a.id)).toEqual([
      "detail",
      "favorite",
      "share:EPUB",
      "download:EPUB",
    ])
  })

  it("should offer download submenu when remote book is not downloaded and multiple formats exist", () => {
    const actions = buildBookMenuActions("notDownloaded", {
      isRemote: true,
      formats: ["EPUB", "PDF"],
    })

    const download = actions.find((a) => a.id === "download")
    expect(download).toBeDefined()
    expect(download?.subactions?.map((a) => a.id)).toEqual([
      "download:EPUB",
      "download:PDF",
    ])
  })

  it("should not offer download actions when remote book is already downloaded", () => {
    const actions = buildBookMenuActions("downloaded", {
      isRemote: true,
      formats: ["EPUB"],
    })

    expect(actions.map((a) => a.id)).toEqual([
      "detail",
      "favorite",
      "share:EPUB",
      "deleteDownload",
    ])
  })

  it("should offer no download actions when remote book is not downloaded and has no readable formats", () => {
    const actions = buildBookMenuActions("notDownloaded", {
      isRemote: true,
      formats: [],
    })

    expect(actions.map((a) => a.id)).toEqual(["detail", "favorite", "share"])
  })

  it("should not offer remote-only actions for local library when building book menu actions", () => {
    const actions = buildBookMenuActions("notDownloaded", {
      isRemote: false,
      formats: ["EPUB"],
    })

    expect(actions.map((a) => a.id)).toEqual([
      "detail",
      "favorite",
      "share:EPUB",
    ])
  })

  it("should offer default format submenu when multiple formats exist", () => {
    const actions = buildBookMenuActions("downloaded", {
      isRemote: false,
      formats: ["EPUB", "PDF"],
      selectedFormat: "EPUB",
    })

    const setDefault = actions.find((a) => a.id === "setDefaultFormat")
    expect(setDefault).toBeDefined()
    expect(setDefault?.subactions).toHaveLength(2)
    expect(setDefault?.subactions?.[0]?.title).toContain("✓")
  })

  it("should not offer default format submenu when only one format exists", () => {
    const actions = buildBookMenuActions("downloaded", {
      isRemote: false,
      formats: ["EPUB"],
    })

    expect(actions.find((a) => a.id === "setDefaultFormat")).toBeUndefined()
  })

  it("should mark selected format in default format submenu when building book menu actions", () => {
    const actions = buildBookMenuActions("downloaded", {
      isRemote: false,
      formats: ["EPUB", "CBZ", "PDF"],
      selectedFormat: "PDF",
    })

    const setDefault = actions.find((a) => a.id === "setDefaultFormat")!
    expect(setDefault.subactions?.[0]?.title).toBe("EPUB")
    expect(setDefault.subactions?.[1]?.title).toBe("CBZ")
    expect(setDefault.subactions?.[2]?.title).toBe("✓ PDF")
  })
})
