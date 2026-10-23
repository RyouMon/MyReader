import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { Platform } from "react-native"
import {
  checkAppUpdate,
  downloadAppUpdate,
  getAppUpdate,
  installAppUpdate,
  setAppUpdatePreferences,
} from "@/src/services/core/app-update"

const queryKey = ["app-update"] as const
type Snapshot = Awaited<ReturnType<typeof getAppUpdate>>

export function useAppUpdate() {
  const client = useQueryClient()
  const supported = Platform.OS === "android"
  const { mutate, isPending, error } = useMutation({
    mutationFn: (action: () => Promise<Snapshot | void>) => action(),
    onSuccess: (snapshot) => {
      if (snapshot) client.setQueryData(queryKey, snapshot)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey })
    },
  })
  const query = useQuery({
    queryKey,
    queryFn: getAppUpdate,
    enabled: supported,
    refetchInterval: (query) =>
      isPending ||
      ["checking", "downloading"].includes(query.state.data?.status ?? "")
        ? 500
        : false,
  })
  const check = useCallback(
    (manual = true) => {
      if (supported) mutate(() => checkAppUpdate(manual))
    },
    [mutate, supported],
  )
  const download = useCallback(() => mutate(downloadAppUpdate), [mutate])
  const install = useCallback(() => mutate(installAppUpdate), [mutate])
  const setPreferences = useCallback(
    (autoCheck: boolean, autoDownload: boolean) => {
      mutate(() => setAppUpdatePreferences(autoCheck, autoDownload))
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
