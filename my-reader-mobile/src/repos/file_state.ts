import { eq } from "drizzle-orm";

import { uuid } from "@/src/utils/common";
import { fileState } from "@my-reader/db/schema";
import type { FileState as FileStateRow } from "@my-reader/db/types";
import { getLibraryDatabase } from "@/src/services/db/library-db";
import type { Library } from "@my-reader/tools/types/library";

type LocalState = "present" | "remote_only" | "local_only" | "dirty_push";
export type { LocalState };
export type { FileState as FileStateRow } from "@my-reader/db/types";

type Listener = () => void;

const listeners = new Set<Listener>();
let revision = 0;

function emitFileStateChanged(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeFileState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFileStateRevision(): number {
  return revision;
}

export async function upsertFileState(
  library: Library,
  path: string,
  patch: {
    localState: LocalState;
    localBlake3?: string | null;
    localSize?: number | null;
    localMtime?: number | null;
  },
): Promise<void> {
  const { db } = await getLibraryDatabase(library);
  const updatedAt = Date.now();
  const id = uuid();
  await db
    .insert(fileState)
    .values({
      id,
      path,
      localState: patch.localState,
      localBlake3: patch.localBlake3 ?? null,
      localSize: patch.localSize ?? null,
      localMtime: patch.localMtime ?? null,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [fileState.path],
      set: {
        localState: patch.localState,
        localBlake3: patch.localBlake3 ?? null,
        localSize: patch.localSize ?? null,
        localMtime: patch.localMtime ?? null,
        updatedAt,
      },
    });
  emitFileStateChanged();
}

export async function getFileState(
  library: Library,
  path: string,
): Promise<FileStateRow | null> {
  const { db } = await getLibraryDatabase(library);
  const rows = await db
    .select()
    .from(fileState)
    .where(eq(fileState.path, path));
  return rows[0] ?? null;
}

export async function listFileStates(library: Library): Promise<FileStateRow[]> {
  const { db } = await getLibraryDatabase(library);
  return db.select().from(fileState).orderBy(fileState.path);
}

export async function deleteFileState(
  library: Library,
  path: string,
): Promise<void> {
  const { db } = await getLibraryDatabase(library);
  await db.delete(fileState).where(eq(fileState.path, path));
  emitFileStateChanged();
}

export async function clearFileStatesForLibrary(library: Library): Promise<void> {
  const { db } = await getLibraryDatabase(library);
  await db.delete(fileState);
  emitFileStateChanged();
}