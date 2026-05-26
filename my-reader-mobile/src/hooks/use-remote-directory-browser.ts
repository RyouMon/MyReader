import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { isMissingMetadataDbError, normalizeCurrentPath } from "@/src/data/remote-library";
import type { RemoteDirEntry, RemoteLibraryOps } from "@/src/data/remote-library";
import type { DataSource } from "@/src/data/types";
import { useDataSourceStore } from "@/src/store/data-source-store";
import { useLibraryStore } from "@/src/store/library-store";

export type UseRemoteDirectoryBrowserOpts = {
  dataSourceId: string | undefined;
  currentPathParam: string | undefined;
  sourceType: "webdav" | "onedrive";
  resolveOps: (candidate: DataSource) => Promise<RemoteLibraryOps | null>;
};

export type RemoteDirectoryBrowserState = {
  /** No matching data source found in the store. */
  notFound: boolean;
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
  resolveOps,
}: UseRemoteDirectoryBrowserOpts): RemoteDirectoryBrowserState {
  const currentPath = useMemo(() => normalizeCurrentPath(currentPathParam), [currentPathParam]);
  const { dataSources } = useDataSourceStore();
  const { addResolvedLibrary } = useLibraryStore();
  const candidate = useMemo(
    () => dataSources.find((item) => item.id === dataSourceId && item.type === sourceType) ?? null,
    [dataSourceId, dataSources, sourceType],
  );

  const [ops, setOps] = useState<RemoteLibraryOps | null>(null);
  const [entries, setEntries] = useState<RemoteDirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolve() {
      if (active) {
        setOps(null);
      }
      if (!candidate) {
        return;
      }

      const result = await resolveOps(candidate);
      if (active) {
        setOps(result);
      }
    }

    void resolve();
    return () => {
      active = false;
    };
  }, [candidate, resolveOps]);

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
      const added = await addResolvedLibrary(library);
      if (added) {
        router.dismissTo("/settings");
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
    candidateId: candidate?.id,
    entries,
    loading,
    error,
    saving,
    currentPath,
    chooseCurrentPath,
  };
}
