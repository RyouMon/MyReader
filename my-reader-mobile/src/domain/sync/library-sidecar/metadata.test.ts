import contractFixture from "./fixtures/contract.json"

import type { ResolvedSyncTarget } from "../resolve"
import type { LibrarySidecarReplicaMetadata } from "./contract"
import {
  decodeLibrarySidecarReplicaMetadata,
  publishLibrarySidecarReplicaMetadata,
} from "./metadata"

type MetadataFixture = {
  replicaMetadata: LibrarySidecarReplicaMetadata
}

const fixture = contractFixture as MetadataFixture

describe("library sidecar replica metadata", () => {
  it("should preserve metadata when valid JSON is decoded", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify(fixture.replicaMetadata),
    )

    expect(
      decodeLibrarySidecarReplicaMetadata(
        bytes,
        fixture.replicaMetadata.replicaId,
      ),
    ).toEqual(fixture.replicaMetadata)
  })

  it("should update metadata without changing replica identity when app build changes", async () => {
    const writes: Array<{
      path: string
      value: LibrarySidecarReplicaMetadata
    }> = []
    const backend = {
      kind: "webdav",
      writeBytes: jest.fn(async (path: string, bytes: Uint8Array) => {
        writes.push({
          path,
          value: JSON.parse(new TextDecoder().decode(bytes)),
        })
      }),
    } as unknown as ResolvedSyncTarget["backend"]
    const updated = {
      ...fixture.replicaMetadata,
      app: {
        ...fixture.replicaMetadata.app,
        buildNumber: "218",
      },
    }

    await publishLibrarySidecarReplicaMetadata(backend, fixture.replicaMetadata)
    await publishLibrarySidecarReplicaMetadata(backend, updated)

    expect(writes).toHaveLength(2)
    expect(writes[1]!.path).toBe(writes[0]!.path)
    expect(writes[1]!.value.replicaId).toBe(writes[0]!.value.replicaId)
    expect(writes[1]!.value.app.buildNumber).toBe("218")
  })

  it("should return false when metadata upload fails", async () => {
    const backend = {
      kind: "webdav",
      writeBytes: jest.fn().mockRejectedValue(new Error("offline")),
    } as unknown as ResolvedSyncTarget["backend"]

    await expect(
      publishLibrarySidecarReplicaMetadata(backend, fixture.replicaMetadata),
    ).resolves.toBe(false)
  })
})
