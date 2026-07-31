const { withPodfile } = require("@expo/config-plugins")

const MMKV_POST_INSTALL = `    installer.pods_project.targets.each do |target|
      next unless target.name == 'MMKVCore'

      target.build_configurations.each do |build_configuration|
        definitions = Array(build_configuration.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || '$(inherited)')
        definitions << '__STDC_WANT_LIB_EXT1__=1'
        build_configuration.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = definitions.uniq
      end
    end`

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withMmkvIos(config) {
  return withPodfile(config, (config) => {
    let { contents } = config.modResults
    const postInstallNeedle = "    readium_post_install(installer)"

    if (!contents.includes("target.name == 'MMKVCore'")) {
      if (!contents.includes(postInstallNeedle)) {
        throw new Error("Unable to locate the iOS post_install block.")
      }
      contents = contents.replace(
        postInstallNeedle,
        `${postInstallNeedle}\n\n${MMKV_POST_INSTALL}`,
      )
    }

    config.modResults.contents = contents
    return config
  })
}

module.exports = withMmkvIos
