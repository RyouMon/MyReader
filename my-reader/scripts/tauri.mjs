import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { run } from "@tauri-apps/cli"

export async function runTauri(args) {
  const separator = args.indexOf("--")
  const optionsEnd = separator < 0 ? args.length : separator
  const options = args.slice(0, optionsEnd)
  const command = options.find((arg) => !arg.startsWith("-"))
  if (
    command !== "dev" ||
    options.some((arg) => ["--help", "-h", "--version", "-V"].includes(arg))
  ) {
    await run(args, "pnpm tauri")
    return
  }

  const { createServer } = await import("vite")
  const server = await createServer({ server: { strictPort: false } })
  try {
    await server.listen()
    const devUrl =
      server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0]
    if (!devUrl) throw new Error("Vite did not expose a development URL")
    server.printUrls()
    // The listening server owns the port; Tauri must not start another one.
    const config = JSON.stringify({
      build: { devUrl, beforeDevCommand: null },
    })
    await run(
      [
        ...args.slice(0, optionsEnd),
        "--config",
        config,
        ...args.slice(optionsEnd),
      ],
      "pnpm tauri",
    )
  } finally {
    await server.close()
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runTauri(process.argv.slice(2)).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
