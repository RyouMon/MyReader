// @vitest-environment node
import { createServer as createHttpServer } from "node:http"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { run } from "@tauri-apps/cli"
import { createServer } from "vite"
import { runTauri } from "./tauri.mjs"

vi.mock("@tauri-apps/cli", () => ({ run: vi.fn() }))
vi.mock("vite", () => ({ createServer: vi.fn() }))

let server
beforeEach(() => {
  vi.resetAllMocks()
  server = {
    listen: vi.fn(),
    close: vi.fn(),
    printUrls: vi.fn(),
    resolvedUrls: { local: ["http://localhost:1422/"], network: [] },
  }
  vi.mocked(createServer).mockResolvedValue(server)
})
afterEach(() => vi.restoreAllMocks())

it.each([
  ["build", "--no-bundle"],
  ["--version"],
  ["dev", "--help"],
])("passes %j through without starting a development server", async (...args) => {
  await runTauri(args)
  expect(run).toHaveBeenCalledWith(args, "pnpm tauri")
  expect(createServer).not.toHaveBeenCalled()
})

it("forwards runner arguments and overrides the dev URL after custom config", async () => {
  const args = [
    "--verbose",
    "dev",
    "--config",
    "custom.json",
    "--",
    "--locked",
    "--",
    "--help",
  ]
  await runTauri(args)
  const forwarded = vi.mocked(run).mock.calls[0][0]
  expect(forwarded.slice(0, 4)).toEqual(args.slice(0, 4))
  expect(forwarded[4]).toBe("--config")
  expect(JSON.parse(forwarded[5])).toEqual({
    build: { devUrl: "http://localhost:1422/", beforeDevCommand: null },
  })
  expect(forwarded.slice(6)).toEqual(args.slice(4))
  expect(server.close).toHaveBeenCalledOnce()
})

it("uses the bound network URL when Vite listens on a specific host", async () => {
  server.resolvedUrls = { local: [], network: ["http://192.0.2.1:1420/"] }
  await runTauri(["dev"])
  expect(JSON.parse(vi.mocked(run).mock.calls[0][0][2]).build.devUrl).toBe(
    "http://192.0.2.1:1420/",
  )
})

it.each([
  "listen",
  "tauri",
])("releases the development server when %s fails", async (stage) => {
  const error = new Error("startup failed")
  if (stage === "listen") server.listen.mockRejectedValue(error)
  else vi.mocked(run).mockRejectedValue(error)
  await expect(runTauri(["dev"])).rejects.toBe(error)
  expect(server.close).toHaveBeenCalledOnce()
})

it("keeps the occupied port untouched and passes Vite's fallback URL to Tauri", async () => {
  const occupied = createHttpServer((_request, response) =>
    response.end("existing server"),
  )
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve))
  const port = occupied.address().port
  let devUrl
  try {
    const vite = await vi.importActual("vite")
    vi.mocked(createServer).mockImplementation((options) =>
      vite.createServer({
        configFile: false,
        appType: "custom",
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { host: "127.0.0.1", port, ...options.server },
        plugins: [
          {
            name: "test-frontend",
            configureServer: (instance) => {
              instance.middlewares.use((_request, response) =>
                response.end("new frontend"),
              )
            },
          },
        ],
      }),
    )
    vi.mocked(run).mockImplementation(async (args) => {
      devUrl = JSON.parse(args[2]).build.devUrl
      expect(Number(new URL(devUrl).port)).toBeGreaterThan(port)
      expect(await (await fetch(devUrl)).text()).toBe("new frontend")
    })
    await runTauri(["dev"])
    await expect(fetch(devUrl)).rejects.toThrow()
    expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe(
      "existing server",
    )
  } finally {
    await new Promise((resolve) => occupied.close(resolve))
  }
})
