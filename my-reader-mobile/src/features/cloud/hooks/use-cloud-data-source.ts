import type {
  DataSourceDropbox,
  DataSourceGdrive,
} from "@my-reader/tools/types/data-source"
import { useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { Alert } from "react-native"
import { showErrorAlert } from "@/src/constants/alert-with-status-bar"
import { useDataSourceActions } from "@/src/hooks/use-data-source-actions"
import { errorMessage } from "@/src/i18n/error-message"
import {
  configuredCloudClientId,
  invalidateCloudAccessToken,
  isUserCancelled,
  signInCloud,
} from "@/src/services/auth/cloud"
import { useAppStore } from "@/src/store/app-store"
import type { OAuthCloudProvider } from "../cloud-data-source"
import { cloudDataSource, providerTitle } from "../cloud-data-source"

let authInProgress = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setAuthInProgress(value: boolean) {
  if (authInProgress === value) return
  authInProgress = value
  for (const listener of listeners) listener()
}

export function useCloudDataSource() {
  const { t } = useTranslation()
  const dataSources = useAppStore((state) => state.dataSources)
  const { updateDataSource } = useDataSourceActions()
  const busy = useSyncExternalStore(
    subscribe,
    () => authInProgress,
    () => authInProgress,
  )

  async function authenticate(provider: OAuthCloudProvider): Promise<{
    source: DataSourceGdrive | DataSourceDropbox
    accessToken: string
    refreshToken: string
    expiresAt: number
    googleAccount?: string
  } | null> {
    if (authInProgress) return null
    setAuthInProgress(true)
    try {
      const result = await signInCloud(provider)
      const existing = dataSources.find(
        (candidate) =>
          candidate.type === provider &&
          candidate.accountId &&
          candidate.accountId === result.accountId,
      )
      if (existing) {
        Alert.alert(
          t("cloud.auth.alreadyAdded.title"),
          t("cloud.auth.alreadyAdded.detail", {
            name: existing.name,
            provider: providerTitle(provider),
          }),
        )
        return null
      }
      return {
        source: cloudDataSource(provider, {
          clientId: configuredCloudClientId(provider),
          accountId: result.accountId,
          displayName: result.displayName,
          email: result.email,
          hasRefreshToken: true,
        }),
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
        googleAccount: result.googleAccount,
      }
    } catch (caught) {
      if (!isUserCancelled(caught)) {
        showErrorAlert(t("cloud.auth.failed.title"), errorMessage(caught))
      }
      return null
    } finally {
      setAuthInProgress(false)
    }
  }

  async function reauthenticate(
    source: DataSourceGdrive | DataSourceDropbox,
  ): Promise<boolean> {
    if (authInProgress) return false
    setAuthInProgress(true)
    try {
      const result = await signInCloud(source.type)
      if (
        source.accountId &&
        result.accountId &&
        source.accountId !== result.accountId
      ) {
        Alert.alert(
          t("cloud.auth.accountMismatch.title"),
          t("cloud.auth.accountMismatch.detail", {
            email: source.email ?? source.displayName ?? source.name,
          }),
        )
        return false
      }
      await updateDataSource(
        {
          ...source,
          clientId: configuredCloudClientId(source.type),
          name: result.displayName || result.email || source.name,
          accountId: result.accountId || source.accountId,
          displayName: result.displayName || source.displayName,
          email: result.email || source.email,
          hasRefreshToken: true,
        },
        {
          type: source.type,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          accessTokenExpiresAt: result.expiresAt,
          googleAccount: result.googleAccount,
        },
      )
      await invalidateCloudAccessToken(source.id, source.type)
      return true
    } catch (caught) {
      if (!isUserCancelled(caught)) {
        showErrorAlert(t("cloud.auth.failed.title"), errorMessage(caught))
      }
      return false
    } finally {
      setAuthInProgress(false)
    }
  }

  return { authenticate, reauthenticate, busy }
}
