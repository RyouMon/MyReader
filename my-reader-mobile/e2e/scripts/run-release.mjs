import { execFileSync, spawn } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { verifyJUnit } from "../../../scripts/release/junit.mjs"
import { validateMaestroSuite } from "../../../scripts/release/maestro-suite.mjs"
import { inspectRelease } from "./inspect-release.mjs"

const mobile = fileURLToPath(new URL("../../", import.meta.url))
const e2e = join(mobile, "e2e")
const [platform, artifactArgument, device] = process.argv.slice(2)
if (!["ios", "android"].includes(platform) || !artifactArgument || !device) {
  throw new Error(
    "Usage: node e2e/scripts/run-release.mjs ios|android <Release.app|release.apk> <device-id>",
  )
}
if (platform === "android" && !device.startsWith("emulator-"))
  throw new Error("Use a dedicated Android emulator for the release suite")
const artifact = resolve(artifactArgument)
const appId = "ryoumon.myreadermobile"
const davPort = Number(process.env.E2E_DAV_PORT || 8082)
const ttsPort = Number(process.env.E2E_TTS_PORT || 5050)
const runId = `${platform}-${Date.now()}`
const rootFolder = `MyReaderE2E-${runId}`
const output = resolve(
  process.env.E2E_REPORT_DIR || join(e2e, ".artifacts", runId),
)
mkdirSync(output, { recursive: true })
rmSync(join(output, "passed.json"), { force: true })
const identity = inspectRelease(platform, artifact, appId)
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: mobile,
    stdio: "inherit",
    timeout: 20 * 60 * 1000,
    ...options,
  })
const read = (command, args) =>
  run(command, args, { encoding: "utf8", stdio: "pipe" }).trim()
const children = []
function service(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: mobile,
    stdio: "inherit",
    env: { ...process.env, ...env },
  })
  children.push(child)
  child.on("error", (error) => {
    console.error(error)
    process.exitCode = 1
  })
  return child
}
async function ready(url, child, options = {}) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Fixture server exited: ${child.exitCode}`)
    try {
      if (
        (await fetch(url, { ...options, signal: AbortSignal.timeout(2000) })).ok
      )
        return
    } catch {
      /* Server is still starting. */
    }
    await delay(100)
  }
  throw new Error(`Fixture server did not become ready: ${url}`)
}

let fixtureRoot
try {
  if (platform === "ios") {
    run("xcrun", ["simctl", "bootstatus", device, "-b"])
    run("xcrun", ["simctl", "install", device, artifact])
    run("xcrun", ["simctl", "launch", device, "com.apple.DocumentsApp"])
    const groups = join(
      process.env.HOME,
      "Library/Developer/CoreSimulator/Devices",
      device,
      "data/Containers/Shared/AppGroup",
    )
    for (let attempt = 0; attempt < 100 && !fixtureRoot; attempt++) {
      for (const group of readdirSync(groups)) {
        const metadata = join(
          groups,
          group,
          ".com.apple.mobile_container_manager.metadata.plist",
        )
        if (!existsSync(metadata)) continue
        if (
          read("plutil", [
            "-extract",
            "MCMMetadataIdentifier",
            "raw",
            "-o",
            "-",
            metadata,
          ]) === "group.com.apple.FileProvider.LocalStorage"
        ) {
          fixtureRoot = join(
            groups,
            group,
            "File Provider Storage/Downloads",
            rootFolder,
          )
          break
        }
      }
      if (!fixtureRoot) await delay(200)
    }
    if (!fixtureRoot) throw new Error("Files local storage did not initialize")
    mkdirSync(join(fixtureRoot, "Fixtures"), { recursive: true })
    run("xcrun", ["simctl", "terminate", device, "com.apple.DocumentsApp"])
  } else {
    run("adb", ["-s", device, "shell", "am", "force-stop", appId], {
      timeout: 30000,
    })
    run("adb", ["-s", device, "install", "--no-streaming", "-r", artifact], {
      timeout: 120000,
    })
    // Remove only Metro's mapping. Fixture mappings are independent.
    if (read("adb", ["-s", device, "reverse", "--list"]).includes("tcp:8081")) {
      run("adb", ["-s", device, "reverse", "--remove", "tcp:8081"])
    }
    fixtureRoot = `/sdcard/Download/${rootFolder}`
    run("adb", [
      "-s",
      device,
      "shell",
      "mkdir",
      "-p",
      `${fixtureRoot}/Fixtures`,
    ])
    for (const port of [ttsPort, davPort])
      run("adb", ["-s", device, "reverse", `tcp:${port}`, `tcp:${port}`])
  }
  run(process.env.E2E_PYTHON || "python3", [
    join(e2e, "scripts/build-fixture.py"),
    join(e2e, ".artifacts/MyReader-TTS.epub"),
  ])
  for (const source of [
    join(e2e, ".artifacts/MyReader-TTS.epub"),
    join(e2e, "fixtures/formats/MyReader-QA.pdf"),
    join(e2e, "fixtures/formats/MyReader-QA.cbz"),
  ]) {
    if (platform === "ios")
      cpSync(source, join(fixtureRoot, "Fixtures", source.split("/").at(-1)))
    else run("adb", ["-s", device, "push", source, `${fixtureRoot}/Fixtures/`])
  }
  const davRoot = join(output, "webdav")
  mkdirSync(join(davRoot, "Shared"), { recursive: true })
  const python = process.env.E2E_PYTHON || "python3"
  const dav = service(python, [
    join(e2e, "scripts/webdav-fixture.py"),
    davRoot,
    String(davPort),
  ])
  const tts = service(
    process.execPath,
    [join(e2e, "scripts/tts-fixture-server.mjs")],
    { TTS_FIXTURE_AUDIO_REPEATS: "16", TTS_FIXTURE_PORT: String(ttsPort) },
  )
  await ready(`http://127.0.0.1:${davPort}/`, dav, {
    headers: {
      authorization: `Basic ${Buffer.from("maestro:fixture-webdav-key").toString("base64")}`,
    },
  })
  await ready(`http://127.0.0.1:${ttsPort}/health`, tts)
  const environment = {
    APP_ID: appId,
    E2E_ROOT_FOLDER: rootFolder,
    LOCAL_LIBRARY_NAME: `E2E-${runId}`,
    EPUB_IMPORT_FILE_NAME: "MyReader-TTS.epub",
    EPUB_BOOK_TITLE: "MyReader TTS E2E",
    EPUB_BOOK_AUTHOR: "MyReader",
    PDF_PICKER_FILE_NAME: "MyReader-QA(.pdf)?",
    PDF_BOOK_TITLE: "MyReader QA PDF",
    PDF_BOOK_AUTHOR: "MyReader",
    CBZ_IMPORT_FILE_NAME: "MyReader-QA.cbz",
    CBZ_BOOK_TITLE: "MyReader-QA",
    ANDROID_STORAGE_LABEL:
      platform === "android"
        ? read("adb", ["-s", device, "shell", "getprop", "ro.product.model"])
        : "",
    WEBDAV_URL: `http://127.0.0.1:${davPort}`,
    WEBDAV_LIBRARY_NAME: `Remote-${runId}`,
    TTS_URL: `http://127.0.0.1:${ttsPort}/openai/v1`,
  }
  const suite = JSON.parse(
    readFileSync(join(e2e, "release-suite.json"), "utf8"),
  )[platform]
  validateMaestroSuite(e2e, suite)
  writeFileSync(
    join(output, "application.json"),
    JSON.stringify(
      {
        ...identity,
        artifact,
        platform,
        device,
        commit: read("git", ["rev-parse", "HEAD"]),
        dirty: read("git", ["status", "--porcelain"]),
        suite,
      },
      null,
      2,
    ),
  )
  for (const [index, flow] of suite.entries()) {
    const report = join(output, `maestro-${index}.xml`)
    run("maestro", [
      "test",
      "--udid",
      device,
      "--platform",
      platform,
      "--config",
      join(e2e, "config.yaml"),
      "--format",
      "JUNIT",
      "--output",
      report,
      "--test-output-dir",
      output,
      "--debug-output",
      join(output, `debug-${index}`),
      ...Object.entries(environment).flatMap(([key, value]) => [
        "-e",
        `${key}=${value}`,
      ]),
      join(e2e, flow),
    ])
    verifyJUnit(report, 1)
    if (flow.endsWith("local-reader.yaml"))
      run(
        process.execPath,
        [join(e2e, "scripts/assert-tts-fixture-requests.mjs"), "openai"],
        {
          env: {
            ...process.env,
            TTS_FIXTURE_URL: `http://127.0.0.1:${ttsPort}`,
          },
        },
      )
  }
  writeFileSync(
    join(output, "passed.json"),
    JSON.stringify(
      {
        platform,
        sha256: identity.sha256,
        suite,
        commit: read("git", ["rev-parse", "HEAD"]),
      },
      null,
      2,
    ),
  )
} finally {
  for (const child of children) child.kill("SIGTERM")
  if (fixtureRoot && platform === "ios")
    rmSync(fixtureRoot, { recursive: true, force: true })
  if (fixtureRoot && platform === "android") {
    try {
      run("adb", ["-s", device, "shell", "rm", "-rf", fixtureRoot], {
        timeout: 15000,
      })
      for (const port of [ttsPort, davPort])
        run("adb", ["-s", device, "reverse", "--remove", `tcp:${port}`], {
          timeout: 15000,
        })
    } catch (error) {
      console.error(
        `Could not remove fixture files/ports from ${device}: ${error.message}`,
      )
    }
  }
}
