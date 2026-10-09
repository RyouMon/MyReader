jest.mock("@expo/config-plugins", () => ({
  withAppBuildGradle: (config, action) => ({
    ...config,
    app: action({ modResults: { contents: config.app } }).modResults.contents,
  }),
  withProjectBuildGradle: (config, action) => ({
    ...config,
    gradle: action({ modResults: { contents: config.gradle } }).modResults
      .contents,
  }),
  withGradleProperties: (config, action) => ({
    ...config,
    properties: action({ modResults: config.properties }).modResults,
  }),
}))

const withAndroidToolchain = require("./with-android-toolchain")

it("keeps the compiler and AGP compatibility settings through repeated prebuilds", () => {
  const generated = withAndroidToolchain({
    app: "getDefaultProguardFile('proguard-android.txt')",
    gradle: `buildscript {
  dependencies {
    classpath('com.android.tools.build:gradle')
    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')
  }
}`,
    properties: [{ type: "property", key: "android.newDsl", value: "true" }],
  })

  expect(generated.gradle).toContain(
    'classpath("com.android.tools.build:gradle:9.1.1")',
  )
  expect(generated.app).toBe(
    "getDefaultProguardFile('proguard-android-optimize.txt')",
  )
  expect(generated.gradle).toContain(
    "classpath(\"org.jetbrains.kotlin:kotlin-gradle-plugin:${findProperty('android.kotlinVersion')}\")",
  )
  expect(generated.properties).toEqual([
    { type: "property", key: "android.newDsl", value: "false" },
    { type: "property", key: "android.builtInKotlin", value: "false" },
    {
      type: "property",
      key: "android.sourceset.disallowProvider",
      value: "false",
    },
  ])
  expect(withAndroidToolchain(generated)).toEqual(generated)
})

it("fails when a template change would silently leave an incompatible toolchain", () => {
  expect(() =>
    withAndroidToolchain({ app: "", gradle: "buildscript {}", properties: [] }),
  ).toThrow("Expected the Expo com.android.tools.build:gradle classpath")
})
