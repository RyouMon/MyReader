import {
  librarySidecarActorId,
  librarySidecarReplicaId,
} from "./automerge-identity"

describe("library sidecar Automerge identity", () => {
  it("should use UUID bytes when deriving an Automerge actor", () => {
    expect(librarySidecarActorId("a1b2c3d4-e5f6-4890-abcd-ef1234567890")).toBe(
      "a1b2c3d4e5f64890abcdef1234567890",
    )
  })

  it("should reject an actor when the replica ID is not lowercase UUIDv4", () => {
    expect(() =>
      librarySidecarActorId("A1B2C3D4-E5F6-4890-ABCD-EF1234567890"),
    ).toThrow("replica ID must be a lowercase UUIDv4")
  })

  it("should restore the replica ID when an Automerge actor is displayed", () => {
    expect(librarySidecarReplicaId("a1b2c3d4e5f64890abcdef1234567890")).toBe(
      "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
    )
  })
})
