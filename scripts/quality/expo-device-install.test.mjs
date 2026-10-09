import assert from "node:assert/strict"
import childProcess from "node:child_process"
import { EventEmitter } from "node:events"
import { createRequire } from "node:module"
import test from "node:test"

const mobileRequire = createRequire(
  new URL("../../my-reader-mobile/package.json", import.meta.url),
)
const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"))
const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"))
const { installAndLaunchAppAsync } = cliRequire(
  "./build/src/start/platforms/ios/devicectl.js",
)
const { getAllSpinners } = cliRequire("./build/src/utils/ora.js")

const app = {
  bundle: "/fixture/MyReader.app",
  bundleIdentifier: "fixture.myreader",
  udid: "fixture-device",
  deviceName: "Fixture iPhone",
}

function mockDeviceCtl(t, { stdout, exitCode = 0 }) {
  const calls = []
  t.mock.method(childProcess, "spawn", (command, args) => {
    assert.equal(command, "xcrun")
    calls.push(args)
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => false
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(stdout))
      child.emit("close", exitCode)
    })
    return child
  })
  t.after(() => {
    for (const spinner of [...getAllSpinners()]) spinner.stop()
  })
  return calls
}

for (const [format, stdout] of [
  ["percentage progress", "50%...\nComplete!\n"],
  ["Xcode 27 summary", "App installed:\n• bundleID: fixture.myreader\n"],
  ["no progress output", ""],
]) {
  test(`Expo finishes a successful device install with ${format}`, async (t) => {
    const calls = mockDeviceCtl(t, { stdout })
    await installAndLaunchAppAsync(app)
    assert.equal(getAllSpinners().length, 0)
    assert.equal(calls.length, 2)
    assert.deepEqual(calls[1].slice(0, 4), [
      "devicectl",
      "device",
      "process",
      "launch",
    ])
  })
}

test("Expo rejects a failed install without launching the app", async (t) => {
  const calls = mockDeviceCtl(t, { stdout: "", exitCode: 1 })
  await assert.rejects(installAndLaunchAppAsync(app), /exit code 1/)
  assert.equal(getAllSpinners().length, 0)
  assert.equal(calls.length, 1)
})
