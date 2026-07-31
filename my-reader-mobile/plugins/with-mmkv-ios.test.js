jest.mock("@expo/config-plugins", () => ({
  withPodfile: (config, action) => action(config),
}))

const withMmkvIos = require("./with-mmkv-ios")

const podfile = `target 'myreadermobile' do
  post_install do |installer|
    react_native_post_install(installer)
    readium_post_install(installer)
  end
end
`

function applyPlugin(contents) {
  return withMmkvIos({
    modResults: { contents },
  }).modResults.contents
}

it("should add the MMKV Annex K definition when generating the iOS Podfile", () => {
  const result = applyPlugin(podfile)

  expect(result).toContain("target.name == 'MMKVCore'")
  expect(result).toContain("__STDC_WANT_LIB_EXT1__=1")
})

it("should keep one MMKV Annex K definition when applying the plugin again", () => {
  const once = applyPlugin(podfile)
  const twice = applyPlugin(once)

  expect(twice.match(/__STDC_WANT_LIB_EXT1__=1/g)).toHaveLength(1)
  expect(twice).toBe(once)
})
