const { withPodfile } = require("@expo/config-plugins")

const MY_READER_CORE_TEST_SPEC = `  pod 'MyReaderCore',
    :path => File.join(__dir__, '..', 'modules', 'my-reader-core', 'ios'),
    :testspecs => ['Tests']`

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withMyReaderCoreIosTests(config) {
  return withPodfile(config, (config) => {
    const expoModulesNeedle = "  use_expo_modules!"
    const podNeedle = "pod 'MyReaderCore'"
    let { contents } = config.modResults

    if (contents.includes(expoModulesNeedle) && !contents.includes(podNeedle)) {
      contents = contents.replace(
        expoModulesNeedle,
        `${MY_READER_CORE_TEST_SPEC}\n${expoModulesNeedle}`,
      )
    }

    config.modResults.contents = contents
    return config
  })
}

module.exports = withMyReaderCoreIosTests
