jest.mock("@expo/config-plugins", () => ({
  withPodfile: (config, action) => action(config),
}))

const withRustComponentsIosTests = require("./with-rust-components-ios-tests")

const podfile = `target 'myreadermobile' do
  pod 'Readium',
    :path => File.join(readium_root, 'ios'),
    :testspecs => ['Tests']
  use_expo_modules!
end
`

function applyPlugin(contents) {
  return withRustComponentsIosTests({
    modResults: { contents },
  }).modResults.contents
}

it("should enable the Rust component test spec when generating the iOS Podfile", () => {
  const result = applyPlugin(podfile)

  expect(result).toContain(`pod 'MyReaderRustComponents',
    :path => File.join(__dir__, '..', 'modules', 'myreader-rust-components', 'ios'),
    :testspecs => ['Tests']
  use_expo_modules!`)
})

it("should keep one Rust component test spec when applying the plugin again", () => {
  const once = applyPlugin(podfile)
  const twice = applyPlugin(once)

  expect(twice.match(/pod 'MyReaderRustComponents'/g)).toHaveLength(1)
  expect(twice).toBe(once)
})
