import {
  AppError,
  AppInvariantError,
  DataIntegrityError,
  DataSourceInUseError,
  describeDownloadError,
  NetworkError,
  SyncConfigError,
  SyncConnectivityError,
} from "./app-errors"

describe("app errors", () => {
  it("should set subclass name when constructing app errors", () => {
    expect(new AppError("base").name).toBe("AppError")
    expect(new SyncConfigError("config").name).toBe("SyncConfigError")
    expect(new DataIntegrityError("bad data").name).toBe("DataIntegrityError")
    expect(new AppInvariantError("bug").name).toBe("AppInvariantError")
  })

  it("should retain structured fields when constructing rich errors", () => {
    const report = { libraryId: "lib-1" }
    const connectivity = new SyncConnectivityError(
      "unreachable",
      report as never,
    )
    const network = new NetworkError("server", 500)
    const inUse = new DataSourceInUseError("in use", ["Library"])

    expect(connectivity.report).toBe(report)
    expect(network.statusCode).toBe(500)
    expect(inUse.libraryNames).toEqual(["Library"])
  })
})

describe("describeDownloadError", () => {
  it("should return connectivity info when network error has no status code", () => {
    expect(describeDownloadError(new NetworkError("offline"))).toEqual({
      title: "Source unreachable",
      message: expect.stringContaining("Cannot access WebDAV source"),
    })
  })

  it("should return connectivity info when message contains timeout", () => {
    expect(describeDownloadError(new Error("Timeout"))).toEqual({
      title: "Source unreachable",
      message: expect.stringContaining("Cannot access WebDAV source"),
    })
  })

  it("should return connectivity info when message is network request failed", () => {
    expect(describeDownloadError("Network request failed")).toEqual({
      title: "Source unreachable",
      message: expect.stringContaining("Cannot access WebDAV source"),
    })
  })

  it("should return download failure info when error has a status code", () => {
    expect(describeDownloadError(new NetworkError("HTTP 404", 404))).toEqual({
      title: "Download failed",
      message: "HTTP 404",
    })
  })

  it("should return download failure info when value is not a connectivity error", () => {
    expect(describeDownloadError(42)).toEqual({
      title: "Download failed",
      message: "42",
    })
  })
})
