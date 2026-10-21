import assert from "node:assert/strict"
import test from "node:test"
import {
  validateAndroidRelease,
  validateIosRelease,
} from "../../my-reader-mobile/e2e/scripts/inspect-release.mjs"

const appId = "ryoumon.myreadermobile"
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
