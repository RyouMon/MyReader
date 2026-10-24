const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")

jest.mock("@expo/config-plugins", () => ({
  withDangerousMod: (config, [, action]) => action(config),
}))

const withAndroidNetworkConfig = require("./with-android-network-config")

it("permits user-configured HTTP servers in the Release source set without replacing TLS trust", async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "myreader-network-"))
  try {
    await withAndroidNetworkConfig({
      modRequest: { platformProjectRoot: project },
    })
    const policy = await fs.readFile(
      path.join(project, "app/src/main/res/xml/network_security_config.xml"),
      "utf8",
    )
    expect(policy).toContain('<base-config cleartextTrafficPermitted="true"')
    expect(policy).not.toContain("trust-anchors")
    expect(policy).not.toContain("domain-config")
  } finally {
    await fs.rm(project, { recursive: true, force: true })
  }
})
