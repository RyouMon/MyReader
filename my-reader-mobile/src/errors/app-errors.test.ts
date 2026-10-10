import {
  AppError,
  AppInvariantError,
  DataIntegrityError,
  DataSourceInUseError,
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
