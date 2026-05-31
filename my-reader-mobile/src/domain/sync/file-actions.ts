import { useAppStore } from "@/src/store/app-store";

import { deleteFileEverywhere, evictLocalFile, openSyncContext } from "@/src/domain/sync/actions";

/** Evicts a downloaded file from local cache only. */
export async function evictLocalFileForLibrary(
  libraryId: string,
  relativePath: string,
): Promise<void> {
  const state = useAppStore.getState();
  const library = state.libraries.find((item) => item.id === libraryId);
  if (!library) return;
  const ctx = await openSyncContext(library, state.dataSources);
  await evictLocalFile(ctx, relativePath);
}

/** Deletes a file locally and on the remote backend. */
export async function deleteFileEverywhereForLibrary(
  libraryId: string,
  relativePath: string,
): Promise<void> {
  const state = useAppStore.getState();
  const library = state.libraries.find((item) => item.id === libraryId);
  if (!library) return;
  const ctx = await openSyncContext(library, state.dataSources);
  await deleteFileEverywhere(ctx, relativePath);
}

/** @deprecated alias */
export const deleteRemoteFileForLibrary = deleteFileEverywhereForLibrary;
