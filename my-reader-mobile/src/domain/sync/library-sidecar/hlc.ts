import {
  LIBRARY_SIDECAR_MAX_FUTURE_SKEW_MS,
  type LibrarySidecarHlc,
} from "./contract"

const U64_MAX = (1n << 64n) - 1n
const HLC_PATTERN = /^([0-9a-f]{16})-([0-9a-f]{16})-([0-9a-f]{32})$/
const REPLICA_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type LibrarySidecarHlcValue = {
  physicalMs: bigint
  counter: bigint
  replicaId: string
}

export type LibrarySidecarHlcState = {
  physicalMs: bigint
  counter: bigint
}

export class LibrarySidecarContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LibrarySidecarContractError"
  }
}

function assertU64(value: bigint, field: string): void {
  if (value < 0n || value > U64_MAX) {
    throw new LibrarySidecarContractError(`${field} must be an unsigned u64`)
  }
}

function compactReplicaId(replicaId: string): string {
  if (!REPLICA_ID_PATTERN.test(replicaId)) {
    throw new LibrarySidecarContractError(
      "replicaId must be a lowercase UUIDv4",
    )
  }
  return replicaId.replace(/-/g, "")
}

function expandReplicaId(value: string): string {
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-")
}

export function formatLibrarySidecarHlc(
  value: LibrarySidecarHlcValue,
): LibrarySidecarHlc {
  assertU64(value.physicalMs, "physicalMs")
  assertU64(value.counter, "counter")
  return [
    value.physicalMs.toString(16).padStart(16, "0"),
    value.counter.toString(16).padStart(16, "0"),
    compactReplicaId(value.replicaId),
  ].join("-")
}

export function parseLibrarySidecarHlc(
  value: LibrarySidecarHlc,
): LibrarySidecarHlcValue {
  const match = HLC_PATTERN.exec(value)
  if (!match) {
    throw new LibrarySidecarContractError("invalid sidecar HLC")
  }
  const replicaId = expandReplicaId(match[3]!)
  if (!REPLICA_ID_PATTERN.test(replicaId)) {
    throw new LibrarySidecarContractError("HLC replicaId must be a UUIDv4")
  }
  return {
    physicalMs: BigInt(`0x${match[1]}`),
    counter: BigInt(`0x${match[2]}`),
    replicaId,
  }
}

export function compareLibrarySidecarHlc(
  left: LibrarySidecarHlc,
  right: LibrarySidecarHlc,
): number {
  parseLibrarySidecarHlc(left)
  parseLibrarySidecarHlc(right)
  return left < right ? -1 : left > right ? 1 : 0
}

function incrementCounter(counter: bigint): bigint {
  if (counter === U64_MAX) {
    throw new LibrarySidecarContractError("HLC counter overflow")
  }
  return counter + 1n
}

function assertHlcState(state: LibrarySidecarHlcState): void {
  assertU64(state.physicalMs, "physicalMs")
  assertU64(state.counter, "counter")
}

export function nextLibrarySidecarHlc(
  local: LibrarySidecarHlcState,
  nowMs: bigint,
  replicaId: string,
): LibrarySidecarHlcValue {
  assertHlcState(local)
  assertU64(nowMs, "nowMs")
  compactReplicaId(replicaId)
  if (nowMs > local.physicalMs) {
    return { physicalMs: nowMs, counter: 0n, replicaId }
  }
  return {
    physicalMs: local.physicalMs,
    counter: incrementCounter(local.counter),
    replicaId,
  }
}

export function observeLibrarySidecarHlc(
  local: LibrarySidecarHlcState,
  remote: LibrarySidecarHlcValue,
  nowMs: bigint,
  replicaId: string,
): LibrarySidecarHlcValue {
  assertHlcState(local)
  assertU64(remote.physicalMs, "remote.physicalMs")
  assertU64(remote.counter, "remote.counter")
  assertU64(nowMs, "nowMs")
  compactReplicaId(remote.replicaId)
  compactReplicaId(replicaId)
  const physicalMs = [local.physicalMs, remote.physicalMs, nowMs].reduce(
    (maximum, value) => (value > maximum ? value : maximum),
  )

  let counter: bigint
  if (physicalMs === local.physicalMs && physicalMs === remote.physicalMs) {
    counter = incrementCounter(
      local.counter > remote.counter ? local.counter : remote.counter,
    )
  } else if (physicalMs === local.physicalMs) {
    counter = incrementCounter(local.counter)
  } else if (physicalMs === remote.physicalMs) {
    counter = incrementCounter(remote.counter)
  } else {
    counter = 0n
  }

  return { physicalMs, counter, replicaId }
}

export function isLibrarySidecarHlcInFuture(
  remote: LibrarySidecarHlc,
  nowMs: number,
): boolean {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new LibrarySidecarContractError(
      "nowMs must be a non-negative safe integer",
    )
  }
  return (
    parseLibrarySidecarHlc(remote).physicalMs >
    BigInt(nowMs) + BigInt(LIBRARY_SIDECAR_MAX_FUTURE_SKEW_MS)
  )
}
