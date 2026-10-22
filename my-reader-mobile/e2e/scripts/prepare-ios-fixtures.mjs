import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, join } from "node:path"

export function prepareIosFixtures(container, folder, sources) {
  const downloads = join(container, "File Provider Storage/Downloads")
  const destination = join(downloads, folder)
  // Prepare complete files outside the File Provider's watched storage. In-place
  // copies can leave Files displaying an item whose document ID cannot resolve.
  const staging = mkdtempSync(join(container, ".myreader-fixtures-"))
  try {
    mkdirSync(join(staging, "Fixtures"))
    for (const source of sources) {
      writeFileSync(
        join(staging, "Fixtures", basename(source)),
        readFileSync(source),
      )
    }
    mkdirSync(downloads, { recursive: true })
    renameSync(staging, destination)
    return destination
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
