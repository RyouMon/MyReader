import { useSyncExternalStore } from "react";

import { subscribeFileState, getFileStateRevision } from "../repos/file_state";

export function useFileStateRevision(): number {
  return useSyncExternalStore(subscribeFileState, getFileStateRevision, () => 0);
}