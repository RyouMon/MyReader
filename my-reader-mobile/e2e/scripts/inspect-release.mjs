import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

export function validateAndroidRelease(badging, entries, appId) {
  if (!badging.includes(`package: name='${appId}'`))
    throw new Error("Unexpected APK application ID")
  if (badging.includes("application-debuggable"))
    throw new Error("Maestro requires a release APK, not a debug application")
  if (!entries.includes("assets/index.android.bundle"))
    throw new Error("APK has no embedded JavaScript bundle")
}

export function validateIosRelease(info, hasBundle, appId) {
  if (info.CFBundleIdentifier !== appId)
    throw new Error("Unexpected iOS application ID")
  if (info.DTPlatformName !== "iphonesimulator")
    throw new Error(
      "Use a Release simulator .app; a device IPA cannot run in Simulator",
    )
  if (!hasBundle)
    throw new Error(
      "Application has no embedded main.jsbundle; Metro builds cannot be tested",
    )
}

export function androidBuildTool(name) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (!sdk) throw new Error("Set ANDROID_HOME to the Android SDK")
  const versions = readdirSync(join(sdk, "build-tools")).sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true }),
  )
  const executable = versions
    .map((version) => join(sdk, "build-tools", version, name))
    .find(existsSync)
  if (!executable) throw new Error(`Android build tool is missing: ${name}`)
  return executable
}

export function inspectRelease(platform, artifact, appId) {
  const run = (command, args) =>
    execFileSync(command, args, { encoding: "utf8" }).trim()
  if (platform === "android") {
    const badging = run(androidBuildTool("aapt"), ["dump", "badging", artifact])
    const entries = run("unzip", ["-Z1", artifact]).split("\n")
    validateAndroidRelease(badging, entries, appId)
    run(androidBuildTool("apksigner"), ["verify", artifact])
    return {
      sha256: createHash("sha256").update(readFileSync(artifact)).digest("hex"),
      badging,
    }
  }
  const info = JSON.parse(
    run("plutil", [
      "-convert",
      "json",
      "-o",
      "-",
      join(artifact, "Info.plist"),
    ]),
  )
  validateIosRelease(info, existsSync(join(artifact, "main.jsbundle")), appId)
  run("codesign", ["--verify", "--deep", "--strict", artifact])
  // Hash every packaged file, including resources, so evidence identifies the installed app.
  const digest = createHash("sha256")
  function hashDirectory(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory())
        hashDirectory(join(directory, entry.name), `${relative}/`)
      else if (entry.isFile())
        digest
          .update(relative)
          .update("\0")
          .update(readFileSync(join(directory, entry.name)))
    }
  }
  hashDirectory(artifact)
  return {
    sha256: digest.digest("hex"),
    bundleId: info.CFBundleIdentifier,
    version: info.CFBundleShortVersionString,
    build: info.CFBundleVersion,
  }
}
