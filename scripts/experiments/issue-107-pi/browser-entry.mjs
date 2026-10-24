import { IndexedDbStorage } from "@earendil-works/pi-durable/storage/indexeddb"
import { runScenario } from "./scenario.mjs"
const name = "myreader-i107-" + Date.now()
runScenario(
  () => IndexedDbStorage.open(name),
  async (kind) =>
    JSON.stringify(
      kind === "search"
        ? { url: "fixture://cast" }
        : { name: "陈默", aliases: ["老陈"] },
    ),
)
  .then((report) => {
    document.getElementById("result").textContent = JSON.stringify(
      report,
      null,
      2,
    )
  })
  .catch((error) => {
    document.getElementById("result").textContent = error.stack
  })
