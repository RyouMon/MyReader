import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { arch } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { prepareIosFixtures } from "./prepare-ios-fixtures.mjs"

export const fixtureAppId = "ryoumon.myreader.e2efixtures"

export async function installIosFixtures(device, folder, sources, output) {
  const run = (command, args) =>
    execFileSync(command, args, { encoding: "utf8", timeout: 120000 }).trim()
  const app = join(output, "FixtureHost.app")
  mkdirSync(app)
  prepareIosFixtures(app, folder, sources)
  writeFileSync(
    join(app, "Info.plist"),
    JSON.stringify({
      CFBundleIdentifier: fixtureAppId,
      CFBundleExecutable: "FixtureHost",
      CFBundleName: "MyReader Fixtures",
      CFBundleDisplayName: "MyReader Fixtures",
      CFBundlePackageType: "APPL",
      CFBundleVersion: "1",
      CFBundleShortVersionString: "1.0",
      CFBundleSupportedPlatforms: ["iPhoneSimulator"],
      MinimumOSVersion: "15.1",
      UIDeviceFamily: [1, 2],
      UILaunchScreen: {},
      UIFileSharingEnabled: true,
      LSSupportsOpeningDocumentsInPlace: true,
      FixtureFolder: folder,
    }),
  )
  run("plutil", ["-convert", "xml1", join(app, "Info.plist")])
  run("xcrun", [
    "--sdk",
    "iphonesimulator",
    "clang",
    "-fobjc-arc",
    "-isysroot",
    run("xcrun", ["--sdk", "iphonesimulator", "--show-sdk-path"]),
    "-target",
    `${arch() === "arm64" ? "arm64" : "x86_64"}-apple-ios15.1-simulator`,
    "-framework",
    "UIKit",
    "-framework",
    "Foundation",
    fileURLToPath(new URL("../fixture-host/main.m", import.meta.url)),
    "-o",
    join(app, "FixtureHost"),
  ])
  run("codesign", ["--force", "--sign", "-", app])
  run("xcrun", ["simctl", "uninstall", device, fixtureAppId])
  run("xcrun", ["simctl", "install", device, app])
  run("xcrun", ["simctl", "launch", device, fixtureAppId])
  const documents = join(
    run("xcrun", ["simctl", "get_app_container", device, fixtureAppId, "data"]),
    "Documents",
  )
  for (let attempt = 0; attempt < 100; attempt++) {
    if (existsSync(join(documents, ".failed")))
      throw new Error(readFileSync(join(documents, ".failed"), "utf8"))
    if (existsSync(join(documents, ".ready"))) return
    await delay(200)
  }
  throw new Error("Fixture app did not publish its shared Documents")
}
