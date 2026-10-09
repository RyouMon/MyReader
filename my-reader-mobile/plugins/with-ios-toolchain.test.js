jest.mock("@expo/config-plugins", () => ({
  withPodfile: (config, action) => action(config),
}))

const withIosToolchain = require("./with-ios-toolchain")

function applyPlugin(contents) {
  return withIosToolchain({ modResults: { contents } }).modResults.contents
}

it("keeps the Podfile post-install hook intact through repeated prebuilds", () => {
  const podfile = `target 'MyReader' do
  post_install do |installer|
    react_native_post_install(installer)
  end
end
`
  const generated = applyPlugin(podfile)

  expect(generated).not.toBe(podfile)
  expect(generated).toContain("    react_native_post_install(installer)")
  expect(applyPlugin(generated)).toBe(generated)
})

it("fails when a template change would omit the deployment-target fix", () => {
  expect(() => applyPlugin("target 'MyReader' do\nend\n")).toThrow()
})
