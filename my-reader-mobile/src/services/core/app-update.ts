import { nativeApplicationVersion } from "expo-application"
import Constants from "expo-constants"
import { Directory, Paths } from "expo-file-system"
import { getContentUriAsync } from "expo-file-system/legacy"
import { startActivityAsync } from "expo-intent-launcher"
import {
  appUpdateCheck,
  appUpdateDownload,
  appUpdateInitialize,
  appUpdateInstallerPath,
  appUpdateSetPreferences,
  appUpdateSnapshot,
} from "my-reader-core"
import { Platform } from "react-native"
import { toNativeFilesystemPath } from "../fs/path"

let initialization: Promise<void> | undefined

async function initialize() {
  if (Platform.OS !== "android") throw new Error("UPDATE_UNSUPPORTED_PLATFORM")
  if (!initialization) {
    const version = nativeApplicationVersion ?? Constants.expoConfig?.version
    if (!version) throw new Error("UPDATE_INVALID_VERSION")
    initialization = appUpdateInitialize(
      toNativeFilesystemPath(new Directory(Paths.document, "updates").uri),
      version,
    )
      .then(() => {})
      .catch((error: unknown) => {
        initialization = undefined
        throw error
      })
  }
  await initialization
}

export async function getAppUpdate() {
  await initialize()
  return appUpdateSnapshot()
}

export async function checkAppUpdate(manual: boolean) {
  await initialize()
  return appUpdateCheck(manual, BigInt(Date.now()))
}

export async function downloadAppUpdate() {
  await initialize()
  return appUpdateDownload()
}

export async function setAppUpdatePreferences(
  autoCheck: boolean,
  autoDownload: boolean,
) {
  await initialize()
  await appUpdateSetPreferences(autoCheck, autoDownload)
  return appUpdateCheck(false, BigInt(Date.now()))
}

export async function installAppUpdate() {
  await initialize()
  const path = await appUpdateInstallerPath()
  const contentUri = await getContentUriAsync(`file://${path}`)
  await startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: "application/vnd.android.package-archive",
    flags: 1,
  })
}
