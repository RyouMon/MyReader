const { withPodfile } = require("@expo/config-plugins")

const READIUM_SOURCES = `source 'https://github.com/readium/podspecs'
source 'https://cdn.cocoapods.org/'
`

const READIUM_LOAD = `readium_root = File.dirname(\`node --print "require.resolve('@my-reader/readium/package.json')"\`.strip)
load File.join(readium_root, 'scripts', 'readium_pods.rb')
load File.join(readium_root, 'scripts', 'readium_post_install.rb')`

const READIUM_TEST_SPEC = `  pod 'Readium',
    :path => File.join(readium_root, 'ios'),
    :testspecs => ['Tests']`

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withReadiumIos(config) {
  return withPodfile(config, (config) => {
    let { contents } = config.modResults

    if (!contents.includes("readium/podspecs")) {
      const firstLineBreak = contents.indexOf("\n")
      const insertAt = firstLineBreak >= 0 ? firstLineBreak + 1 : 0
      contents =
        contents.slice(0, insertAt) +
        READIUM_SOURCES +
        "\n" +
        contents.slice(insertAt)
    }

    const rnPodsRequire =
      'require File.join(File.dirname(`node --print "require.resolve(\'react-native/package.json\')"`), "scripts/react_native_pods")'
    if (
      contents.includes(rnPodsRequire) &&
      !contents.includes("load File.join(readium_root")
    ) {
      contents = contents.replace(
        rnPodsRequire,
        `${rnPodsRequire}\n${READIUM_LOAD.trim()}\n`,
      )
    }

    const expoModulesNeedle = "  use_expo_modules!"
    if (
      contents.includes(expoModulesNeedle) &&
      !contents.includes(":testspecs => ['Tests']")
    ) {
      contents = contents.replace(
        expoModulesNeedle,
        `${READIUM_TEST_SPEC}\n${expoModulesNeedle}`,
      )
    }

    const nativeModulesNeedle = "config = use_native_modules!(config_command)"
    if (
      contents.includes(nativeModulesNeedle) &&
      !contents.includes(`${nativeModulesNeedle}\n\n  readium_pods`)
    ) {
      contents = contents.replace(
        nativeModulesNeedle,
        `${nativeModulesNeedle}\n\n  readium_pods`,
      )
    }

    const postInstallNeedle = `:ccache_enabled => ccache_enabled?(podfile_properties),\n    )\n  end`
    if (
      contents.includes(postInstallNeedle) &&
      !contents.includes("    readium_post_install(installer)")
    ) {
      contents = contents.replace(
        postInstallNeedle,
        `:ccache_enabled => ccache_enabled?(podfile_properties),\n    )\n\n    readium_post_install(installer)\n  end`,
      )
    }

    config.modResults.contents = contents
    return config
  })
}

module.exports = withReadiumIos
