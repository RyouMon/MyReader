import fs from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const webServerPort = 55173
const webDriverPort = 9515
const previewServerHost = "localhost"
const edgeDriverBinaryPath = path.resolve(projectRoot, "msedgedriver.exe")

let webServerProcess: ReturnType<typeof spawn> | undefined
let edgeDriverProcess: ReturnType<typeof spawn> | undefined

function stopProcessTree(processRef: ReturnType<typeof spawn> | undefined) {
  if (!processRef?.pid) return
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", `${processRef.pid}`, "/T", "/F"], {
      stdio: "ignore",
      shell: true,
    })
    return
  }
  processRef.kill()
}

function ensureEdgeDriverBinary() {
  if (fs.existsSync(edgeDriverBinaryPath)) return
  const downloadResult = spawnSync("msedgedriver-tool", [], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
  })
  if (downloadResult.status !== 0 || !fs.existsSync(edgeDriverBinaryPath)) {
    throw new Error("failed to download msedgedriver binary")
  }
}

async function waitForPreviewServerReady() {
  const serverUrl = `http://${previewServerHost}:${webServerPort}`
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(serverUrl)
      if (response.ok) return
    } catch {
      // wait and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error("preview server did not become ready in time")
}

async function startPreviewServer() {
  webServerProcess = spawn(
    "pnpm",
    [
      "run",
      "preview",
      "--",
      "--port",
      `${webServerPort}`,
      "--host",
      previewServerHost,
      "--strictPort",
    ],
    {
      cwd: projectRoot,
      stdio: [null, process.stdout, process.stderr],
      shell: true,
    },
  )
  await waitForPreviewServerReady()
}

function startEdgeDriver() {
  edgeDriverProcess = spawn(edgeDriverBinaryPath, [`--port=${webDriverPort}`], {
    stdio: [null, process.stdout, process.stderr],
    shell: true,
  })
}

function cleanupProcesses() {
  stopProcessTree(webServerProcess)
  stopProcessTree(edgeDriverProcess)
  webServerProcess = undefined
  edgeDriverProcess = undefined
}

export const config = {
  host: "127.0.0.1",
  port: webDriverPort,
  path: "/",
  baseUrl: `http://${previewServerHost}:${webServerPort}`,
  specs: ["./features/**/*.feature"],
  maxInstances: 1,

  capabilities: [
    {
      maxInstances: 1,
      browserName: "MicrosoftEdge",
    },
  ],

  reporters: ["spec"],
  framework: "cucumber",
  cucumberOpts: {
    require: ["./step-definitions/**/*.ts"],
    timeout: 120000,
    strict: true,
    retry: 1,
    retryTagFilter: "@flaky",
  },

  connectionRetryCount: 0,

  onPrepare: async () => {
    cleanupProcesses()
    ensureEdgeDriverBinary()
    const frontendBuildResult = spawnSync(
      "npm",
      ["run", "build:frontend:e2e"],
      { cwd: projectRoot, stdio: "inherit", shell: true },
    )
    if (frontendBuildResult.status !== 0) {
      throw new Error("failed to build frontend dist for webdriver tests")
    }
    startEdgeDriver()
    await startPreviewServer()
  },

  onComplete: () => {
    cleanupProcesses()
  },
}
