jest.mock("@expo/config-plugins", () => ({
  withPodfile: (config, action) => action(config),
}))

const withReadiumIos = require("./with-readium-ios")

const podfile = `require File.join(File.dirname(\`node --print "require.resolve('react-native/package.json')"\`), "scripts/react_native_pods")

target 'myreadermobile' do
  use_expo_modules!
  config = use_native_modules!(config_command)

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
  end
end
`

function applyPlugin(contents) {
  return withReadiumIos({
    modResults: { contents },
  }).modResults.contents
}

it("should enable the Readium test spec when generating the iOS Podfile", () => {
  const result = applyPlugin(podfile)

  expect(result).toContain(`pod 'Readium',
    :path => File.join(readium_root, 'ios'),
    :testspecs => ['Tests']
  use_expo_modules!`)
})

it("should configure MMKVCore when generating the iOS Podfile", () => {
  const result = applyPlugin(podfile)

  expect(result).toContain("target.name == 'MMKVCore'")
  expect(result).toContain("__STDC_WANT_LIB_EXT1__=1")
})

it("should keep one Readium test spec when applying the plugin again", () => {
  const once = applyPlugin(podfile)
  const twice = applyPlugin(once)

  expect(twice.match(/:testspecs => \['Tests'\]/g)).toHaveLength(1)
  expect(twice.match(/__STDC_WANT_LIB_EXT1__=1/g)).toHaveLength(1)
  expect(twice).toBe(once)
})
