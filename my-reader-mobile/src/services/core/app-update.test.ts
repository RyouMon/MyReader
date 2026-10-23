import { Platform } from "react-native"
import { getContentUriAsync } from "expo-file-system/legacy"
import { startActivityAsync } from "expo-intent-launcher"
import {
  appUpdateCheck,
  appUpdateDownload,
  appUpdateInitialize,
  appUpdateInstallerPath,
  appUpdateSetPreferences,
} from "my-reader-core"
import {
  checkAppUpdate,
  downloadAppUpdate,
  getAppUpdate,
  installAppUpdate,
  setAppUpdatePreferences,
} from "./app-update"

jest.mock("expo-application", () => ({ nativeApplicationVersion: "0.18.0" }))
jest.mock("expo-constants", () => ({ expoConfig: { version: "0.99.0" } }))
jest.mock("expo-file-system", () => ({
  Directory: jest.fn(() => ({ uri: "file:///documents/updates" })),
  Paths: { document: "file:///documents" },
}))
jest.mock("expo-file-system/legacy", () => ({ getContentUriAsync: jest.fn() }))
jest.mock("expo-intent-launcher", () => ({ startActivityAsync: jest.fn() }))
jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("my-reader-core", () => ({
  appUpdateInitialize: jest.fn(async () => ({})),
  appUpdateSnapshot: jest.fn(() => ({ status: "idle" })),
  appUpdateCheck: jest.fn(async () => ({ status: "downloaded" })),
  appUpdateDownload: jest.fn(async () => ({ status: "downloaded" })),
  appUpdateSetPreferences: jest.fn(async () => ({})),
  appUpdateInstallerPath: jest.fn(),
}))

const originalPlatform = Platform.OS
afterEach(() => {
  Platform.OS = originalPlatform
})
beforeEach(() => {
  jest.clearAllMocks()
  Platform.OS = "android"
})

it("initializes with the installed binary version and a private download directory", async () => {
  await getAppUpdate()
  expect(appUpdateInitialize).toHaveBeenCalledWith(
    "/documents/updates",
    "0.18.0",
  )
})

it("does not contact the updater on iOS", async () => {
  Platform.OS = "ios"
  await expect(checkAppUpdate(true)).rejects.toThrow(
    "UPDATE_UNSUPPORTED_PLATFORM",
  )
  expect(appUpdateCheck).not.toHaveBeenCalled()
  expect(appUpdateInitialize).not.toHaveBeenCalled()
})

it("keeps automatic checks and downloads separate from installation", async () => {
  await checkAppUpdate(false)
  await setAppUpdatePreferences(true, true)
  await downloadAppUpdate()
  expect(appUpdateCheck).toHaveBeenCalledWith(false, expect.any(BigInt))
  expect(appUpdateSetPreferences).toHaveBeenCalledWith(true, true)
  expect(appUpdateDownload).toHaveBeenCalledTimes(1)
  expect(appUpdateInstallerPath).not.toHaveBeenCalled()
  expect(startActivityAsync).not.toHaveBeenCalled()
})

it("hands only a verified APK to the system installer with a temporary read grant", async () => {
  jest
    .mocked(appUpdateInstallerPath)
    .mockResolvedValue("/documents/updates/MyReader.apk")
  jest
    .mocked(getContentUriAsync)
    .mockResolvedValue("content://myreader/MyReader.apk")
  await installAppUpdate()
  expect(getContentUriAsync).toHaveBeenCalledWith(
    "file:///documents/updates/MyReader.apk",
  )
  expect(startActivityAsync).toHaveBeenCalledWith(
    "android.intent.action.VIEW",
    {
      data: "content://myreader/MyReader.apk",
      type: "application/vnd.android.package-archive",
      flags: 1,
    },
  )
})

it("does not open an installer when the cached file fails verification", async () => {
  jest
    .mocked(appUpdateInstallerPath)
    .mockRejectedValue(new Error("UPDATE_INTEGRITY_FAILED"))
  await expect(installAppUpdate()).rejects.toThrow("UPDATE_INTEGRITY_FAILED")
  expect(getContentUriAsync).not.toHaveBeenCalled()
  expect(startActivityAsync).not.toHaveBeenCalled()
})
