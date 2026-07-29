import {
  initializeAppConfig,
  writeMobileAppConfig,
} from "@/src/services/core/app-config"

import { createAppConfigStorage } from "./app-config-storage"

jest.mock("@/src/services/core/app-config", () => ({
  initializeAppConfig: jest.fn(),
  writeMobileAppConfig: jest.fn(),
}))

const config = {
  schemaVersion: 1,
  deviceId: null,
  preferences: {
    theme: "dark",
    language: "zh-CN",
  },
  dataSources: [],
  libraries: [],
  activeLibraryId: null,
  mobileJson: JSON.stringify({
    state: {
      settings: {
        syncOnStartup: false,
      },
      libraryViewMode: "list",
    },
    version: 0,
  }),
}

describe("app config storage", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should inject common fields when mobile state is read", async () => {
    jest.mocked(initializeAppConfig).mockResolvedValue(config)

    const value = await createAppConfigStorage().getItem("mobile")

    expect(JSON.parse(value ?? "")).toEqual({
      state: {
        settings: {
          syncOnStartup: false,
          themeMode: "dark",
          language: "zh-CN",
        },
        libraryViewMode: "list",
        dataSources: [],
        libraries: [],
        activeLibraryId: null,
      },
      version: 0,
    })
  })

  it("should store common preferences once when mobile state is written", async () => {
    jest.mocked(writeMobileAppConfig).mockResolvedValue(config)

    await createAppConfigStorage().setItem(
      "mobile",
      JSON.stringify({
        state: {
          settings: {
            themeMode: "light",
            language: "",
            syncOnStartup: true,
          },
          libraryViewMode: "grid",
          dataSources: [{ id: "source" }],
          libraries: [{ id: "library" }],
          activeLibraryId: "library",
        },
        version: 0,
      }),
    )

    expect(writeMobileAppConfig).toHaveBeenCalledWith(
      {
        theme: "light",
        language: "system",
      },
      JSON.stringify({
        state: {
          settings: {
            syncOnStartup: true,
          },
          libraryViewMode: "grid",
        },
        version: 0,
      }),
    )
  })

  it("should reset persisted fields when mobile storage is removed", async () => {
    jest.mocked(writeMobileAppConfig).mockResolvedValue({
      ...config,
      mobileJson: null,
    })

    await createAppConfigStorage().removeItem("mobile")

    expect(writeMobileAppConfig).toHaveBeenCalledWith(
      {
        theme: "system",
        language: "system",
      },
      null,
    )
  })
})
