const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function librarySidecarActorId(replicaId: string): string {
  if (!UUID_V4_PATTERN.test(replicaId)) {
    throw new Error("replica ID must be a lowercase UUIDv4")
  }
  return replicaId.replace(/-/g, "")
}

export function librarySidecarReplicaId(actorId: string): string {
  if (!/^[0-9a-f]{32}$/.test(actorId)) {
    throw new Error("Automerge actor must contain 16 bytes")
  }
  return [
    actorId.slice(0, 8),
    actorId.slice(8, 12),
    actorId.slice(12, 16),
    actorId.slice(16, 20),
    actorId.slice(20),
  ].join("-")
}
