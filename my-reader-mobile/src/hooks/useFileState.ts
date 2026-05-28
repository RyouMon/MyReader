import { useSyncExternalStore } from "react";

import { subscribeFileState, getFileStateRevision } from "../domain/sync/actions";

export function useFileStateRevision(): number {
  return useSyncExternalStore(subscribeFileState, getFileStateRevision, () => 0);
}