const { withDangerousMod } = require("@expo/config-plugins")
const fs = require("node:fs/promises")
const path = require("node:path")

/**
 * WebDAV's user-selected HTTP endpoints must work in Release downloads as well
 * as Core requests. App resources override Readium's localhost-only policy.
 * Keep platform certificate validation for HTTPS; only opt in to HTTP traffic.
 */
function withAndroidNetworkConfig(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const resourceDirectory = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      )
      await fs.mkdir(resourceDirectory, { recursive: true })
      await fs.writeFile(
        path.join(resourceDirectory, "network_security_config.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`,
      )
      return config
    },
  ])
}

module.exports = withAndroidNetworkConfig
