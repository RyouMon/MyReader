import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  validateAndroidRelease,
  validateIosRelease,
} from "../../my-reader-mobile/e2e/scripts/inspect-release.mjs"
import { prepareIosFixtures } from "../../my-reader-mobile/e2e/scripts/prepare-ios-fixtures.mjs"

const appId = "ryoumon.myreadermobile"
test("iOS fixture app receives a complete resource set, with original book bytes", (t) => {
  const root = mkdtempSync(join(tmpdir(), "reader-ios-fixtures-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const container = join(root, "container")
  mkdirSync(container)
  const book = join(root, "book.pdf")
  const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 0xff])
  writeFileSync(book, bytes)
  const folder = "MyReaderE2E-test"
  const destination = join(container, "FixtureData", folder)

  assert.throws(
    () =>
      prepareIosFixtures(container, folder, [book, join(root, "missing.epub")]),
    /ENOENT/,
  )
  assert.equal(existsSync(destination), false)
  assert.deepEqual(readdirSync(container), [])

  assert.equal(prepareIosFixtures(container, folder, [book]), destination)
  assert.deepEqual(readFileSync(join(destination, "Fixtures/book.pdf")), bytes)
  assert.deepEqual(readdirSync(container), ["FixtureData"])
  assert.throws(() => prepareIosFixtures(container, folder, [book]))
  assert.deepEqual(readFileSync(join(destination, "Fixtures/book.pdf")), bytes)
})

test("Android Maestro rejects debug, wrong applications and Metro-only APKs", () => {
  const badging = `package: name='${appId}' versionCode='1'`
  const entries = ["assets/index.android.bundle"]
  assert.doesNotThrow(() => validateAndroidRelease(badging, entries, appId))
  assert.throws(
    () =>
      validateAndroidRelease(
        `${badging}\napplication-debuggable`,
        entries,
        appId,
      ),
    /debug/,
  )
  assert.throws(() => validateAndroidRelease(badging, [], appId), /embedded/)
  assert.throws(
    () => validateAndroidRelease("package: name='other'", entries, appId),
    /application ID/,
  )
})

test("iOS Maestro requires an embedded simulator application for the intended app", () => {
  const info = { CFBundleIdentifier: appId, DTPlatformName: "iphonesimulator" }
  assert.doesNotThrow(() => validateIosRelease(info, true, appId))
  assert.throws(() => validateIosRelease(info, false, appId), /Metro/)
  assert.throws(
    () =>
      validateIosRelease({ ...info, DTPlatformName: "iphoneos" }, true, appId),
    /IPA/,
  )
  assert.throws(
    () =>
      validateIosRelease({ ...info, CFBundleIdentifier: "other" }, true, appId),
    /application ID/,
  )
})
