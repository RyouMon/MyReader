import { useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { Alert } from "react-native"

import type { DataSource, DataSourceOnedrive } from "@/src/domain/types"
import {
  invalidateOneDriveAccessToken,
  isUserCancelled,
  signIn,
} from "@/src/services/auth/onedrive"
import { useAppStore } from "@/src/store/app-store"
import { useDataSourceActions } from "../../../hooks/use-data-source-actions"

let addInProgress = false
const addInProgressListeners = new Set<() => void>()

function subscribeAddInProgress(listener: () => void) {
  addInProgressListeners.add(listener)
  return () => {
    addInProgressListeners.delete(listener)
  }
}

function getAddInProgressSnapshot() {
  return addInProgress
}

function setAddInProgress(value: boolean) {
  if (addInProgress === value) {
    return
  }
  addInProgress = value
  addInProgressListeners.forEach((listener) => listener())
}

export function useAddOneDriveDataSource() {
  const { t } = useTranslation()
  const dataSources = useAppStore((s) => s.dataSources)
  const { createDataSource, updateDataSource } = useDataSourceActions()
  const busy = useSyncExternalStore(
    subscribeAddInProgress,
    getAddInProgressSnapshot,
    getAddInProgressSnapshot,
  )

  async function addOneDriveDataSource(): Promise<DataSource | null> {
    if (addInProgress) return null
    setAddInProgress(true)
    try {
      const { accessToken, refreshToken, displayName, email } = await signIn()

      const existing = dataSources.find(
        (s) => s.type === "onedrive" && s.email && s.email === email,
      )
      if (existing) {
        Alert.alert(
          t("onedrive.add.alreadyAdded"),
          t("onedrive.add.alreadyAddedMessage", { email }),
        )
        return null
      }

      const draft: DataSource = {
        id: "",
        type: "onedrive",
        name: displayName || email || "OneDrive",
        enabled: true,
        clientId: "",
        displayName,
        email,
        rootPath: null,
        hasRefreshToken: Boolean(refreshToken),
      }

      const created = await createDataSource(draft, {
        type: "onedrive",
        accessToken,
        refreshToken: refreshToken ?? undefined,
      })

      return created
    } catch (caught) {
      if (isUserCancelled(caught)) return null
      Alert.alert(
        t("onedrive.add.authFailed"),
        caught instanceof Error
          ? caught.message
          : t("onedrive.add.authFailedMessage"),
      )
      return null
    } finally {
      setAddInProgress(false)
    }
  }

  async function reauthenticateOneDriveDataSource(
    source: DataSourceOnedrive,
  ): Promise<boolean> {
    if (addInProgress) return false
    setAddInProgress(true)
    try {
      const { accessToken, refreshToken, displayName, email } = await signIn()
      if (!refreshToken) {
        throw new Error(t("onedrive.add.authFailedMessage"))
      }

      if (
        source.email &&
        email &&
        source.email.trim().toLocaleLowerCase() !==
          email.trim().toLocaleLowerCase()
      ) {
        Alert.alert(
          t("onedrive.add.accountMismatch"),
          t("onedrive.add.accountMismatchMessage", { email: source.email }),
        )
        return false
      }

      await updateDataSource(
        {
          ...source,
          name: displayName || email || source.name,
          displayName: displayName || source.displayName,
          email: email || source.email,
          hasRefreshToken: true,
        },
        { type: "onedrive", accessToken, refreshToken },
      )
      invalidateOneDriveAccessToken(source.id)
      return true
    } catch (caught) {
      if (isUserCancelled(caught)) return false
      Alert.alert(
        t("onedrive.add.authFailed"),
        caught instanceof Error
          ? caught.message
          : t("onedrive.add.authFailedMessage"),
      )
      return false
    } finally {
      setAddInProgress(false)
    }
  }

  return { addOneDriveDataSource, reauthenticateOneDriveDataSource, busy }
}
