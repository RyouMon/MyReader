import { appendErrorDetail } from "@my-reader/i18n/mobile"
import type {
  DataSourceDropbox,
  DataSourceGdrive,
  DataSourceS3,
} from "@my-reader/tools/types/data-source"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  EmptyState,
  FormSwitch,
  FormTextField,
  PrimaryButton,
  Screen,
} from "@/src/components"
import { showErrorAlert } from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import type { DataSource } from "@/src/domain/types"
import {
  type CloudDataSource,
  type CloudProvider,
  cloudBrowserPath,
  isOAuthCloudProvider,
  providerTitle,
} from "@/src/features/cloud/cloud-data-source"
import { useCloudDataSource } from "@/src/features/cloud/hooks/use-cloud-data-source"
import { useDataSourceActions } from "@/src/hooks/use-data-source-actions"
import { errorMessage } from "@/src/i18n/error-message"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers"
import { readS3Credentials } from "@/src/services/storage/credentials"
import { useAppStore } from "@/src/store/app-store"
import { View } from "@/tw"

type CloudAddDataSourceScreenProps = {
  provider: CloudProvider
}

type OAuthSource = DataSourceGdrive | DataSourceDropbox

function initialS3Field(
  source: CloudDataSource | undefined,
  field: "name" | "endpoint" | "bucket" | "region",
): string {
  if (source?.type !== "s3") return field === "name" ? "S3" : ""
  return source[field]
}

function initialName(
  source: CloudDataSource | undefined,
  provider: CloudProvider,
): string {
  return source?.type === "s3" ? source.name : providerTitle(provider)
}

function initialVirtualHostStyle(source: CloudDataSource | undefined): boolean {
  return source?.type === "s3" ? source.virtualHostStyle : false
}

function isAddLibraryFlow(from: string | undefined): boolean {
  return from === "add-library"
}

type CloudDataSourceFieldsProps = {
  provider: CloudProvider
  editing: boolean
  saving: boolean
  authenticating: boolean
  credentialsLoading: boolean
  rootPath: string
  name: string
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  virtualHostStyle: boolean
  setRootPath: (value: string) => void
  setName: (value: string) => void
  setEndpoint: (value: string) => void
  setBucket: (value: string) => void
  setRegion: (value: string) => void
  setAccessKeyId: (value: string) => void
  setSecretAccessKey: (value: string) => void
  setSessionToken: (value: string) => void
  setVirtualHostStyle: (value: boolean) => void
  onOAuthSave: () => void
}

function CloudDataSourceFields({
  provider,
  editing,
  saving,
  authenticating,
  credentialsLoading,
  rootPath,
  name,
  endpoint,
  bucket,
  region,
  accessKeyId,
  secretAccessKey,
  sessionToken,
  virtualHostStyle,
  setRootPath,
  setName,
  setEndpoint,
  setBucket,
  setRegion,
  setAccessKeyId,
  setSecretAccessKey,
  setSessionToken,
  setVirtualHostStyle,
  onOAuthSave,
}: CloudDataSourceFieldsProps) {
  const { t } = useTranslation()
  if (isOAuthCloudProvider(provider)) {
    return (
      <>
        <FormTextField
          label={t("cloud.form.rootPathLabel")}
          value={rootPath}
          onChangeText={setRootPath}
          placeholder="/"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!saving && !authenticating}
        />
        <View className="rounded-2xl px-4 py-2">
          <PrimaryButton
            title={t(
              editing ? "cloud.form.reauthenticate" : "cloud.form.signIn",
            )}
            disabled={saving || authenticating}
            onPress={onOAuthSave}
          />
        </View>
      </>
    )
  }

  const editable = !saving && !credentialsLoading
  return (
    <>
      <FormTextField
        label={t("cloud.form.nameLabel")}
        value={name}
        onChangeText={setName}
        autoCorrect={false}
        editable={editable}
      />
      <FormTextField
        label={t("cloud.form.endpointLabel")}
        value={endpoint}
        onChangeText={setEndpoint}
        placeholder="https://s3.example.com"
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      <FormTextField
        label={t("cloud.form.bucketLabel")}
        value={bucket}
        onChangeText={setBucket}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      <FormTextField
        label={t("cloud.form.regionLabel")}
        value={region}
        onChangeText={setRegion}
        placeholder="us-east-1"
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      <FormTextField
        label={t("cloud.form.rootPathLabel")}
        value={rootPath}
        onChangeText={setRootPath}
        placeholder="/"
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      <FormTextField
        label={t("cloud.form.accessKeyLabel")}
        value={accessKeyId}
        onChangeText={setAccessKeyId}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      <FormTextField
        label={t("cloud.form.secretKeyLabel")}
        value={secretAccessKey}
        onChangeText={setSecretAccessKey}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      <FormTextField
        label={t("cloud.form.sessionTokenLabel")}
        value={sessionToken}
        onChangeText={setSessionToken}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      <FormSwitch
        label={t("cloud.form.virtualHostStyle")}
        value={virtualHostStyle}
        onValueChange={setVirtualHostStyle}
        disabled={saving || credentialsLoading}
      />
    </>
  )
}

export function CloudAddDataSourceScreen({
  provider,
}: CloudAddDataSourceScreenProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { dataSourceId, from, libraryAction, returnPath, returnToBrowser } =
    useLocalSearchParams<{
      dataSourceId?: string
      from?: string
      libraryAction?: string
      returnPath?: string
      returnToBrowser?: string
    }>()
  const dataSources = useAppStore((state) => state.dataSources)
  const source = useMemo<CloudDataSource | undefined>(
    () =>
      dataSources.find(
        (candidate) =>
          candidate.id === dataSourceId && candidate.type === provider,
      ) as CloudDataSource | undefined,
    [dataSourceId, dataSources, provider],
  )
  const editing = Boolean(dataSourceId && source)
  const missingEditTarget = Boolean(dataSourceId && !source)
  const { createDataSource, updateDataSource, testDataSourceConnection } =
    useDataSourceActions()
  const {
    authenticate,
    reauthenticate,
    busy: authenticating,
  } = useCloudDataSource()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(initialName(source, provider))
  const [endpoint, setEndpoint] = useState(initialS3Field(source, "endpoint"))
  const [bucket, setBucket] = useState(initialS3Field(source, "bucket"))
  const [region, setRegion] = useState(initialS3Field(source, "region"))
  const [rootPath, setRootPath] = useState(source?.rootPath ?? "")
  const [accessKeyId, setAccessKeyId] = useState("")
  const [secretAccessKey, setSecretAccessKey] = useState("")
  const [sessionToken, setSessionToken] = useState("")
  const [credentialsLoading, setCredentialsLoading] = useState(
    source?.type === "s3",
  )
  const [virtualHostStyle, setVirtualHostStyle] = useState(
    initialVirtualHostStyle(source),
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (source?.type !== "s3") {
      setCredentialsLoading(false)
      return
    }

    let active = true
    setCredentialsLoading(true)
    void readS3Credentials(source.id)
      .then((credentials) => {
        if (!active || !credentials) return
        setAccessKeyId(credentials.accessKeyId)
        setSecretAccessKey(credentials.secretAccessKey)
        setSessionToken(credentials.sessionToken ?? "")
      })
      .finally(() => {
        if (active) setCredentialsLoading(false)
      })

    return () => {
      active = false
    }
  }, [source])

  function returnToNextStep(created: DataSource) {
    if (returnToBrowser === "true" || isAddLibraryFlow(from)) {
      const params = {
        dataSourceId: created.id,
        sourceType: provider,
        currentPath: returnPath ?? "/",
        libraryAction: libraryAction === "create" ? "create" : "open",
        ...(from ? { from } : {}),
      }
      if (isAddLibraryFlow(from)) {
        router.replace({ pathname: "/settings/add-library/browser", params })
      } else {
        router.replace({
          pathname: cloudBrowserPath(provider) as never,
          params: params as never,
        })
      }
      return
    }
    if (editing && router.canGoBack()) {
      router.back()
      return
    }
    router.dismissTo("/settings/data-sources")
  }

  async function persistOAuthSource(
    nextSource: OAuthSource,
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
    googleAccount?: string,
  ) {
    const secrets = {
      type: nextSource.type,
      accessToken,
      refreshToken,
      accessTokenExpiresAt: expiresAt,
      googleAccount,
    } as const
    let stored: DataSource
    if (editing) {
      await updateDataSource(nextSource, secrets)
      stored = nextSource
    } else {
      stored = await createDataSource(nextSource, secrets)
    }
    returnToNextStep(stored)
  }

  async function handleOAuthSave() {
    if (!isOAuthCloudProvider(provider) || saving || authenticating) return
    setError(null)
    setSaving(true)
    try {
      if (
        editing &&
        source &&
        (source.type === "gdrive" || source.type === "dropbox")
      ) {
        const authenticated = await reauthenticate(source)
        if (!authenticated) return
        const nextSource = {
          ...source,
          rootPath: rootPath.trim() || null,
        }
        await updateDataSource(nextSource)
        returnToNextStep(nextSource)
        return
      }

      const result = await authenticate(provider)
      if (!result) return
      const nextSource = {
        ...result.source,
        rootPath: rootPath.trim() || null,
      }
      const test = await testDataSourceConnection(nextSource, {
        type: provider,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        accessTokenExpiresAt: result.expiresAt,
        googleAccount: result.googleAccount,
      })
      if (!test.ok) {
        showErrorAlert(
          t("cloud.form.connectionFailed"),
          appendErrorDetail(errorMessage(test.message), test),
        )
        return
      }
      await persistOAuthSource(
        nextSource,
        result.accessToken,
        result.refreshToken,
        result.expiresAt,
        result.googleAccount,
      )
    } catch (caught) {
      showErrorAlert(
        t(editing ? "cloud.form.updateFailed" : "cloud.form.addFailed"),
        errorMessage(caught),
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleS3Save() {
    if (provider !== "s3" || saving || credentialsLoading) return
    const required: Array<[string, string]> = [
      [endpoint, "cloud.form.endpointRequired"],
      [bucket, "cloud.form.bucketRequired"],
      [region, "cloud.form.regionRequired"],
      [accessKeyId, "cloud.form.accessKeyRequired"],
      [secretAccessKey, "cloud.form.secretKeyRequired"],
    ]
    const missing = required.find(([value]) => !value.trim())
    if (missing) {
      setError(String(t(missing[1] as never)))
      return
    }
    setError(null)
    setSaving(true)
    try {
      const nextSource: DataSourceS3 = {
        id: source?.type === "s3" ? source.id : "",
        type: "s3",
        enabled: true,
        name: name.trim() || "S3",
        endpoint: endpoint.trim(),
        bucket: bucket.trim(),
        region: region.trim(),
        rootPath: rootPath.trim() || null,
        virtualHostStyle,
        hasCredentials: true,
      }
      const test = await testDataSourceConnection(nextSource, {
        type: "s3",
        accessKeyId: accessKeyId.trim(),
        secretAccessKey,
        sessionToken: sessionToken.trim() || undefined,
      })
      if (!test.ok) {
        showErrorAlert(
          t("cloud.form.connectionFailed"),
          appendErrorDetail(errorMessage(test.message), test),
        )
        return
      }
      const secrets = {
        type: "s3" as const,
        accessKeyId: accessKeyId.trim(),
        secretAccessKey,
        sessionToken: sessionToken.trim() || undefined,
      }
      if (editing) {
        await updateDataSource(nextSource, secrets)
      }
      const stored = editing
        ? nextSource
        : await createDataSource(nextSource, secrets)
      returnToNextStep(stored)
    } catch (caught) {
      showErrorAlert(
        t(editing ? "cloud.form.updateFailed" : "cloud.form.addFailed"),
        errorMessage(caught),
      )
    } finally {
      setSaving(false)
    }
  }

  const isAddFlow = isAddLibraryFlow(from)
  const { options, toolbar } = useScreenHeader({
    title: t(editing ? "cloud.form.editTitle" : "cloud.form.addTitle", {
      provider: providerTitle(provider),
    }),
    ...(isAddFlow
      ? {
          back: "hidden" as const,
          left: [
            {
              label: t("back"),
              onPress: () => router.back(),
              iosSfSymbol: "chevron.left" as const,
              iconOnly: true,
            },
          ],
        }
      : { backTitle: t("back") }),
    right: missingEditTarget
      ? []
      : [
          createSaveAction({
            label:
              saving || authenticating
                ? t("cloud.form.saving")
                : t("cloud.form.save"),
            onPress: () =>
              void (isOAuthCloudProvider(provider)
                ? handleOAuthSave()
                : handleS3Save()),
            loading: saving || authenticating,
            color: palette.primary,
          }),
        ],
  })

  if (missingEditTarget) {
    return (
      <>
        <Stack.Screen options={options} />
        {toolbar}
        <Screen>
          <EmptyState
            title={t("dataSource.notFound.title")}
            detail={t("dataSource.notFound.detail")}
            action={
              <PrimaryButton
                title={t("dataSource.backToList")}
                onPress={() => router.replace("/settings/data-sources")}
              />
            }
            icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
          />
        </Screen>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <Screen>
          <View className="gap-3">
            <CloudDataSourceFields
              provider={provider}
              editing={editing}
              saving={saving}
              authenticating={authenticating}
              credentialsLoading={credentialsLoading}
              rootPath={rootPath}
              name={name}
              endpoint={endpoint}
              bucket={bucket}
              region={region}
              accessKeyId={accessKeyId}
              secretAccessKey={secretAccessKey}
              sessionToken={sessionToken}
              virtualHostStyle={virtualHostStyle}
              setRootPath={setRootPath}
              setName={setName}
              setEndpoint={setEndpoint}
              setBucket={setBucket}
              setRegion={setRegion}
              setAccessKeyId={setAccessKeyId}
              setSecretAccessKey={setSecretAccessKey}
              setSessionToken={setSessionToken}
              setVirtualHostStyle={setVirtualHostStyle}
              onOAuthSave={() => void handleOAuthSave()}
            />
            {error ? (
              <View className="px-4">
                <PrimaryButton title={error} disabled />
              </View>
            ) : null}
          </View>
        </Screen>
      </View>
    </>
  )
}
