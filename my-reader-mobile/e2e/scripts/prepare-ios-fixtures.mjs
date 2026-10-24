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
  const resources = join(container, "FixtureData")
  const destination = join(resources, folder)
  // Stage complete bundle resources. The fixture app publishes these through
  // its shared Documents directory using iOS file coordination.
  const staging = mkdtempSync(join(container, ".myreader-fixtures-"))
  try {
    mkdirSync(join(staging, "Fixtures"))
    for (const source of sources) {
      writeFileSync(
        join(staging, "Fixtures", basename(source)),
        readFileSync(source),
      )
    }
    mkdirSync(resources, { recursive: true })
    renameSync(staging, destination)
    return destination
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
