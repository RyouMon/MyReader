const { withPodfile } = require("@expo/config-plugins")

const RUST_COMPONENTS_TEST_SPEC = `  pod 'MyReaderRustComponents',
    :path => File.join(__dir__, '..', 'modules', 'myreader-rust-components', 'ios'),
    :testspecs => ['Tests']`

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withRustComponentsIosTests(config) {
  return withPodfile(config, (config) => {
    const expoModulesNeedle = "  use_expo_modules!"
    const podNeedle = "pod 'MyReaderRustComponents'"
    let { contents } = config.modResults

    if (contents.includes(expoModulesNeedle) && !contents.includes(podNeedle)) {
      contents = contents.replace(
        expoModulesNeedle,
        `${RUST_COMPONENTS_TEST_SPEC}\n${expoModulesNeedle}`,
      )
    }

    config.modResults.contents = contents
    return config
  })
}

module.exports = withRustComponentsIosTests
