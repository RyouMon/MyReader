jest.mock("@expo/config-plugins", () => ({
  withPodfile: (config, action) => action(config),
}))

const withMyReaderCoreIosTests = require("./with-my-reader-core-ios-tests")

const podfile = `target 'myreadermobile' do
  pod 'Readium',
    :path => File.join(readium_root, 'ios'),
    :testspecs => ['Tests']
  use_expo_modules!
end
`

function applyPlugin(contents) {
  return withMyReaderCoreIosTests({
    modResults: { contents },
  }).modResults.contents
}

it("should enable the MyReader Core test spec when generating the iOS Podfile", () => {
  const result = applyPlugin(podfile)

  expect(result).toContain(`pod 'MyReaderCore',
    :path => File.join(__dir__, '..', 'modules', 'my-reader-core', 'ios'),
    :testspecs => ['Tests']
  use_expo_modules!`)
})

it("should keep one MyReader Core test spec when applying the plugin again", () => {
  const once = applyPlugin(podfile)
  const twice = applyPlugin(once)

  expect(twice.match(/pod 'MyReaderCore'/g)).toHaveLength(1)
  expect(twice).toBe(once)
})
