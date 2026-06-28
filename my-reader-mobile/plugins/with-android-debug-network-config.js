const { withDangerousMod } = require("@expo/config-plugins")
const fs = require("fs")
const path = require("path")

/**
 * Adds a debug-only network security config that permits cleartext traffic
 * from any domain, overriding @my-reader/readium's restrictive
 * config which only allows localhost. This is required for the Metro bundler
 * to serve the JS bundle over HTTP via the LAN IP in development.
 */
function withAndroidDebugNetworkConfig(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const platformProjectRoot = config.modRequest.platformProjectRoot

      // 1. Ensure debug/res/xml/network_security_config.xml exists
      const debugResXmlDir = path.join(
        platformProjectRoot,
        "app",
        "src",
        "debug",
        "res",
        "xml",
      )
      const networkConfigPath = path.join(
        debugResXmlDir,
        "network_security_config.xml",
      )

      const networkConfigContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`

      if (!fs.existsSync(debugResXmlDir)) {
        fs.mkdirSync(debugResXmlDir, { recursive: true })
      }

      // Only write if missing or content differs (idempotent)
      if (
        !fs.existsSync(networkConfigPath) ||
        fs.readFileSync(networkConfigPath, "utf-8") !== networkConfigContent
      ) {
        fs.writeFileSync(networkConfigPath, networkConfigContent)
      }

      // 2. Patch debug/AndroidManifest.xml
      const debugManifestPath = path.join(
        platformProjectRoot,
        "app",
        "src",
        "debug",
        "AndroidManifest.xml",
      )

      if (!fs.existsSync(debugManifestPath)) {
        throw new Error(
          `Expected debug AndroidManifest.xml at ${debugManifestPath} but it does not exist.`,
        )
      }

      let manifestContent = fs.readFileSync(debugManifestPath, "utf-8")

      // Add networkSecurityConfig attribute if missing
      if (!manifestContent.includes("android:networkSecurityConfig")) {
        manifestContent = manifestContent.replace(
          /<application\s+([^/>]*)\/>/,
          (match, attrs) => {
            return `<application ${attrs.trim()} android:networkSecurityConfig="@xml/network_security_config" />`
          },
        )
      }

      // Expand tools:replace to include networkSecurityConfig
      if (
        manifestContent.includes(
          'tools:replace="android:usesCleartextTraffic"',
        ) &&
        !manifestContent.includes(
          'tools:replace="android:usesCleartextTraffic,android:networkSecurityConfig"',
        )
      ) {
        manifestContent = manifestContent.replace(
          'tools:replace="android:usesCleartextTraffic"',
          'tools:replace="android:usesCleartextTraffic,android:networkSecurityConfig"',
        )
      }

      fs.writeFileSync(debugManifestPath, manifestContent)

      return config
    },
  ])
}

module.exports = withAndroidDebugNetworkConfig
