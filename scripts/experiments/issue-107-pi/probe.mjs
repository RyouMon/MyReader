import { createServer } from "node:http"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node"
import { runScenario } from "./scenario.mjs"
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json")
  res.end(
    JSON.stringify(
      req.url.startsWith("/search")
        ? { title: "沿河而行（沈川）人物", url: "fixture://cast" }
        : {
            characters: [
              { name: "陈默", aliases: ["老陈"], description: "渡口守夜人" },
            ],
          },
    ),
  )
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const directory = await mkdtemp(join(tmpdir(), "myreader-pi-"))
try {
  const report = await runScenario(
    () => openNodeSqliteStorage(join(directory, "session.sqlite")),
    async (path) => {
      const result = await fetch(
        `http://127.0.0.1:${server.address().port}/${path}`,
      )
      return result.text()
    },
  )
  console.log(JSON.stringify(report, null, 2))
} finally {
  server.close()
}
