import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import {
  createBrowseRemoteOps,
  isMissingMetadataDbError,
  normalizeCurrentPath,
} from "@/src/domain/library/remote-library";
import type { RemoteDirEntry, RemoteLibraryOps } from "@/src/domain/library/remote-library";
import { useAppStore } from "@/src/store/app-store";
import { registerLibrary } from "@/src/domain/library/hooks/library-actions";
import { notifyLibraryAdded } from "@/src/domain/notifications/library-notifications";

export type UseRemoteDirectoryBrowserOpts = {
  dataSourceId: string | undefined;
  currentPathParam: string | undefined;
  sourceType: "webdav" | "onedrive";
};

export type RemoteDirectoryBrowserState = {
  /** No matching data source found in the store. */
  notFound: boolean;
  /** Data source found but credentials could not be resolved. */
  resolveFailed: boolean;
  candidateId: string | undefined;
  entries: RemoteDirEntry[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  currentPath: string;
  chooseCurrentPath: (errorMessages: { notValidTitle: string; notValidMessage: string; generic: string }) => Promise<void>;
};

export function useRemoteDirectoryBrowser({
  dataSourceId,
  currentPathParam,
  sourceType,
}: UseRemoteDirectoryBrowserOpts): RemoteDirectoryBrowserState {
  const currentPath = useMemo(() => normalizeCurrentPath(currentPathParam), [currentPathParam]);
  const dataSources = useAppStore((state) => state.dataSources);
  const candidate = useMemo(
    () => dataSources.find((item) => item.id === dataSourceId && item.type === sourceType) ?? null,
    [dataSourceId, dataSources, sourceType],
  );

  const [ops, setOps] = useState<RemoteLibraryOps | null>(null);
  const [resolveFailed, setResolveFailed] = useState(false);
  const [entries, setEntries] = useState<RemoteDirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolve() {
      if (!candidate) {
        return;
      }

      if (active) {
        setOps(null);
        setResolveFailed(false);
        setLoading(true);
        setError(null);
      }

      const result = await createBrowseRemoteOps(candidate);
      if (active) {
        setOps(result);
        if (!result) {
          setResolveFailed(true);
          setLoading(false);
        }
      }
    }

    void resolve();
    return () => {
      active = false;
    };
  }, [candidate]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!ops) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const items = await ops.listDirectory(currentPath === "/" ? "" : currentPath);
        if (active) {
          setEntries(items.filter((item) => item.isDirectory));
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Failed to read directory");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [currentPath, ops]);

  async function chooseCurrentPath(errorMessages: {
    notValidTitle: string;
    notValidMessage: string;
    generic: string;
  }) {
    if (!ops) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const library = await ops.createLibraryFromPath(currentPath || "/");
      const added = await registerLibrary(library);
      if (added) {
        router.dismissTo("/settings");
        notifyLibraryAdded(added.name);
      }
    } catch (caught) {
      if (isMissingMetadataDbError(caught)) {
        showAlertWithStatusBarRestore(errorMessages.notValidTitle, errorMessages.notValidMessage);
        return;
      }
      setError(caught instanceof Error ? caught.message : errorMessages.generic);
    } finally {
      setSaving(false);
    }
  }

  return {
    notFound: candidate === null,
    resolveFailed,
    candidateId: candidate?.id,
    entries,
    loading,
    error,
    saving,
    currentPath,
    chooseCurrentPath,
  };
}
