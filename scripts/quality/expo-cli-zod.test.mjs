import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const mobileRequire = createRequire(
  new URL("../../my-reader-mobile/package.json", import.meta.url),
)
const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"))
const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"))
const { PluginSchema, DevToolsPluginOutputSchema } = cliRequire(
  "./build/src/start/server/DevToolsPlugin.schema.js",
)
const { createMCPDevToolsExtensionSchema } = cliRequire(
  "./build/src/start/server/createMCPDevToolsExtensionSchema.js",
)

const plugin = {
  packageName: "reader-tools",
  packageRoot: "/reader-tools",
  cliExtensions: {
    description: "Reader development commands",
    entryPoint: "commands.js",
    commands: [
      {
        name: "open-book",
        title: "Open book",
        environments: ["cli", "mcp"],
        parameters: [
          { name: "title", type: "text" },
          { name: "page", type: "number" },
          { name: "confirm", type: "confirm" },
        ],
      },
    ],
  },
}

test("Expo DevTools accepts its plugin contract and rejects invalid command parameters", () => {
  assert.deepEqual(PluginSchema.parse(plugin), plugin)
  const invalid = structuredClone(plugin)
  invalid.cliExtensions.commands[0].parameters[0].type = "unsupported"
  const result = PluginSchema.safeParse(invalid)
  assert.equal(result.success, false)
  assert.deepEqual(result.error.issues[0].path, [
    "cliExtensions",
    "commands",
    0,
    "parameters",
    0,
    "type",
  ])
})

test("Expo MCP command schemas preserve parameter types and reject unknown inputs", () => {
  const schema = createMCPDevToolsExtensionSchema(plugin)
  const command = {
    command: "open-book",
    title: "Example",
    page: 2,
    confirm: true,
  }
  assert.deepEqual(schema.parse(command), command)
  assert.deepEqual(schema.parse({ command: "open-book" }), {
    command: "open-book",
  })
  for (const invalid of [
    { ...command, command: "unknown" },
    { ...command, title: 3 },
    { ...command, page: "two" },
    { ...command, confirm: "yes" },
    { ...command, extra: true },
  ]) {
    assert.equal(schema.safeParse(invalid).success, false)
  }
})

test("Expo DevTools output validates text, audio and image responses", () => {
  const output = [
    { type: "text", text: "Opened", level: "info" },
    { type: "audio", url: "https://example.com/audio.wav" },
    { type: "image", url: "https://example.com/page.png", text: "Page" },
  ]
  assert.deepEqual(DevToolsPluginOutputSchema.parse(output), output)
  for (const invalid of [
    [{ type: "text", text: "Failure", level: "unknown" }],
    [{ type: "audio", url: "invalid" }],
    [{ type: "video", url: "https://example.com/video.mp4" }],
  ]) {
    assert.equal(DevToolsPluginOutputSchema.safeParse(invalid).success, false)
  }
})
