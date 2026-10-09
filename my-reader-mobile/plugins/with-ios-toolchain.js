const { withPodfile } = require("@expo/config-plugins")
const {
  mergeContents,
} = require("@expo/config-plugins/build/utils/generateCode")

// React Native omits resource bundles from its deployment-target floor:
// https://github.com/react/react-native/issues/58555
const DEPLOYMENT_TARGET = `    minimum_target = Gem::Version.new(podfile_properties['ios.deploymentTarget'] || min_ios_version_supported)
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_configuration|
        current_target = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        current_target = current_target ? Gem::Version.new(current_target) : minimum_target
        build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = [minimum_target, current_target].max.to_s
      end
    end`

module.exports = function withIosToolchain(config) {
  return withPodfile(config, (config) => {
    config.modResults.contents = mergeContents({
      tag: "my-reader-ios-deployment-target",
      src: config.modResults.contents,
      newSrc: DEPLOYMENT_TARGET,
      anchor: /post_install do \|installer\|/,
      offset: 1,
      comment: "#",
    }).contents
    return config
  })
}
