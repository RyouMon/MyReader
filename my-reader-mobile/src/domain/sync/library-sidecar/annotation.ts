import type { Library } from "@my-reader/tools/types/library"

import {
  readLibrarySidecarAnnotation,
  withLibrarySidecarSyncTransaction,
  type LibrarySidecarAnnotationRow,
} from "@/src/repos/library-sidecar-sync"
import {
  librarySidecarAnnotationProjections,
  type LibrarySidecarAnnotationValue,
} from "./automerge-document"
import { commitLibrarySidecarAutomergeMutation } from "./automerge-store"
import { ensureLibrarySidecarIdentity } from "./identity"

async function projectedAnnotation(
  library: Library,
  id: string,
): Promise<LibrarySidecarAnnotationRow | null> {
  return withLibrarySidecarSyncTransaction(library, (tx) =>
    readLibrarySidecarAnnotation(tx, id),
  )
}

export async function createLocalAnnotation(
  library: Library,
  value: Omit<
    LibrarySidecarAnnotationValue,
    "createdAt" | "updatedAt" | "deleted" | "deletedAt"
  >,
  nowMs = Date.now(),
): Promise<LibrarySidecarAnnotationRow> {
  const identity = await ensureLibrarySidecarIdentity(library)
  await commitLibrarySidecarAutomergeMutation(library, identity, nowMs, () => ({
    type: "createAnnotation",
    value: {
      ...value,
      createdAt: nowMs,
      updatedAt: nowMs,
      deleted: false,
      deletedAt: null,
    },
  }))
  const row = await projectedAnnotation(library, value.id)
  if (!row) throw new Error("Annotation creation returned no row")
  return row
}

export async function updateLocalAnnotation(
  library: Library,
  id: string,
  color: string,
  note: string | null,
  nowMs = Date.now(),
): Promise<LibrarySidecarAnnotationRow | null> {
  const identity = await ensureLibrarySidecarIdentity(library)
  let exists = true
  await commitLibrarySidecarAutomergeMutation(
    library,
    identity,
    nowMs,
    (document) => {
      const current = librarySidecarAnnotationProjections(document).find(
        (annotation) => annotation.id === id && !annotation.deleted,
      )
      if (!current) {
        exists = false
        return null
      }
      return { type: "updateAnnotation", id, color, note, updatedAt: nowMs }
    },
  )
  return exists ? projectedAnnotation(library, id) : null
}

export async function deleteLocalAnnotation(
  library: Library,
  id: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const identity = await ensureLibrarySidecarIdentity(library)
  let exists = true
  await commitLibrarySidecarAutomergeMutation(
    library,
    identity,
    nowMs,
    (document) => {
      const current = librarySidecarAnnotationProjections(document).find(
        (annotation) => annotation.id === id && !annotation.deleted,
      )
      if (!current) {
        exists = false
        return null
      }
      return { type: "deleteAnnotation", id, deletedAt: nowMs }
    },
  )
  return exists
}
