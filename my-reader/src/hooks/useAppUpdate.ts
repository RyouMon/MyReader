import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { isTauri } from "@tauri-apps/api/core"
import { useCallback } from "react"
import { api, type AppUpdateSnapshot } from "@/lib/tauri-api"

const queryKey = ["app-update"] as const

export function useAppUpdate() {
  const client = useQueryClient()
  const supported = isTauri()
  const { mutate, isPending, error } = useMutation({
    mutationFn: (action: () => Promise<AppUpdateSnapshot | void | null>) =>
      action(),
    onSuccess: (snapshot) => {
      if (snapshot) client.setQueryData(queryKey, snapshot)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey })
    },
  })
  const query = useQuery({
    queryKey,
    queryFn: () => api.getAppUpdate(),
    enabled: supported,
    refetchInterval: (query) =>
      isPending ||
      ["checking", "downloading"].includes(query.state.data?.status ?? "")
        ? 500
        : false,
  })
  const check = useCallback(
    (manual = true) => {
      if (supported) mutate(() => api.checkAppUpdate(manual))
    },
    [mutate, supported],
  )
  const download = useCallback(
    () => mutate(() => api.downloadAppUpdate()),
    [mutate],
  )
  const install = useCallback(
    () => mutate(() => api.openAppUpdateInstaller()),
    [mutate],
  )
  const setPreferences = useCallback(
    (autoCheck: boolean, autoDownload: boolean) => {
      mutate(async () => {
        await api.setAppUpdatePreferences(autoCheck, autoDownload)
        return api.checkAppUpdate(false)
      })
    },
    [mutate],
  )
  const busy =
    isPending || ["checking", "downloading"].includes(query.data?.status ?? "")
  return {
    data: query.data,
    error: error ?? query.error,
    busy,
    supported,
    check,
    download,
    install,
    setPreferences,
  }
}
