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
      "bookRemovalActions",
    ])
    expect(actions.at(-1)).toMatchObject({
      displayInline: true,
      subactions: [{ id: "deleteDownload" }],
    })
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

  it("should group downloaded-file and whole-book deletion together at the end for remote MyReader libraries", () => {
    const managed = buildBookMenuActions("downloaded", {
      isManaged: true,
      isRemote: true,
      formats: ["EPUB"],
    })
    const calibre = buildBookMenuActions("downloaded", {
      isManaged: false,
      isRemote: false,
      formats: ["EPUB"],
    })

    expect(managed.map((action) => action.id)).toEqual([
      "detail",
      "favorite",
      "share:EPUB",
      "editMetadata",
      "bookRemovalActions",
    ])
    const removalGroup = managed.at(-1)
    expect(removalGroup?.displayInline).toBe(true)
    expect(removalGroup?.subactions?.map((action) => action.id)).toEqual([
      "deleteDownload",
      "deleteBook",
    ])
    expect(
      removalGroup?.subactions?.find((action) => action.id === "deleteBook")
        ?.attributes,
    ).toEqual({ destructive: true })
    expect(
      calibre.some(
        (action) =>
          action.id === "deleteBook" ||
          action.subactions?.some((subaction) => subaction.id === "deleteBook"),
      ),
    ).toBe(false)
  })

  it("should disable deleting a local file until the remote copy is confirmed", () => {
    const pendingUpload = buildBookMenuActions("downloaded", {
      isManaged: true,
      isRemote: true,
      canDeleteDownload: false,
      formats: ["EPUB"],
    })
    const uploaded = buildBookMenuActions("downloaded", {
      isManaged: true,
      isRemote: true,
      canDeleteDownload: true,
      formats: ["EPUB"],
    })

    const pendingDelete = pendingUpload
      .find((action) => action.id === "bookRemovalActions")
      ?.subactions?.find((action) => action.id === "deleteDownload")
    const uploadedDelete = uploaded
      .find((action) => action.id === "bookRemovalActions")
      ?.subactions?.find((action) => action.id === "deleteDownload")

    expect(pendingDelete?.attributes).toEqual({
      destructive: true,
      disabled: true,
    })
    expect(uploadedDelete?.attributes).toEqual({
      destructive: true,
      disabled: false,
    })
  })

  it("should offer upload before the separated removal group only when a remote MyReader file can upload", () => {
    const uploadable = buildBookMenuActions("downloaded", {
      isManaged: true,
      isRemote: true,
      canUpload: true,
      formats: ["EPUB"],
    })
    const uploading = buildBookMenuActions("downloaded", {
      isManaged: true,
      isRemote: true,
      canUpload: false,
      formats: ["EPUB"],
    })

    expect(uploadable.map((action) => action.id)).toEqual([
      "detail",
      "favorite",
      "share:EPUB",
      "uploadFile",
      "editMetadata",
      "bookRemovalActions",
    ])
    expect(uploadable.at(-1)?.displayInline).toBe(true)
    expect(uploading.some((action) => action.id === "uploadFile")).toBe(false)
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
