const withCloudAuthSchemes = require("./with-cloud-auth-schemes")

jest.mock("@expo/config-plugins", () => ({
  withInfoPlist: (config, action) => action(config),
  withAndroidManifest: (config, action) => action(config),
}))

it("registers the iOS Google callback and Android AppAuth callback", () => {
  const result = withCloudAuthSchemes({
    modResults: {
      CFBundleURLTypes: [],
      manifest: {
        application: [
          {
            activity: [],
          },
        ],
      },
    },
  })

  const iosSchemes = result.modResults.CFBundleURLTypes.flatMap(
    (entry) => entry.CFBundleURLSchemes ?? [],
  )
  expect(iosSchemes).toContain(
    "com.googleusercontent.apps.679889280827-l7r5uvus691p8ighv14ti401817sts0b",
  )

  const receiver = result.modResults.manifest.application[0].activity[0]
  const androidSchemes = receiver["intent-filter"].flatMap((filter) =>
    (filter.data ?? []).map((entry) => entry.$["android:scheme"]),
  )
  expect(androidSchemes).toEqual(["ryoumon.myreadermobile.auth"])
})

it("is idempotent when Expo prebuild runs more than once", () => {
  const initial = {
    modResults: {
      CFBundleURLTypes: [],
      manifest: { application: [{ activity: [] }] },
    },
  }
  const once = withCloudAuthSchemes(initial)
  const twice = withCloudAuthSchemes(once)
  const receiver = twice.modResults.manifest.application[0].activity[0]
  expect(receiver["intent-filter"]).toHaveLength(1)
  expect(twice.modResults.CFBundleURLTypes).toHaveLength(1)
})
