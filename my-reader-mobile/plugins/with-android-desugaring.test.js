jest.mock("@expo/config-plugins", () => ({
  withAppBuildGradle: (config, action) => action(config),
}))

const withAndroidDesugaring = require("./with-android-desugaring")

function applyPlugin(contents) {
  return withAndroidDesugaring({ modResults: { contents } }).modResults.contents
}

it("generates one desugaring configuration across repeated prebuilds", () => {
  const generated = applyPlugin(`android {
    androidResources {
    }
}
dependencies {
}`)

  expect(generated).toContain("coreLibraryDesugaringEnabled = true")
  expect(generated).toContain("com.android.tools:desugar_jdk_libs:2.1.5")
  expect(applyPlugin(generated)).toBe(generated)
})

it("updates an existing generated dependency to Readium's minimum version", () => {
  expect(
    applyPlugin(`dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}`),
  ).toContain("com.android.tools:desugar_jdk_libs:2.1.5")
})
