import { appUpdateMessage, appUpdateErrorMessage } from "@my-reader/i18n/mobile"
import { router } from "expo-router"
import { useTranslation } from "react-i18next"
import { Platform, Switch } from "react-native"
import { ListRow, SectionCard, SectionLabel } from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"
import { useAppUpdate } from "./use-app-update"

export function AppUpdateSection() {
  return Platform.OS === "android" ? <AndroidAppUpdateSection /> : null
}

function AndroidAppUpdateSection() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { data, error, busy, check, download, install, setPreferences } =
    useAppUpdate()
  const status = data?.status ?? "idle"
  const installerAction = status === "downloaded" ? install : download
  const onInstallerPress = busy ? undefined : installerAction
  const { statusText, errorText } = useUpdateText(data)

  return (
    <View className="gap-3">
      <SectionLabel>{t("appUpdates.title")}</SectionLabel>
      <SectionCard>
        <ListRow
          title={t("appUpdates.check")}
          value={
            data
              ? t("appUpdates.currentVersion", { version: data.currentVersion })
              : undefined
          }
          detail={statusText}
          onPress={busy ? undefined : () => check()}
        />
        <UpdatePreferences
          data={data}
          busy={busy}
          setPreferences={setPreferences}
        />
      </SectionCard>
      {data?.error || error ? (
        <Text
          accessibilityRole="alert"
          className="px-4 text-base"
          style={{ color: palette.danger }}
        >
          {errorText}
        </Text>
      ) : null}
      {data?.version ? (
        <SectionCard>
          <ListRow
            title={t("appUpdates.notes")}
            icon={{ ios: "doc.text", android: "description" }}
            value={data.version}
            onPress={() => router.push("/update-notes")}
          />
          <ListRow
            icon={{ ios: "arrow.down.circle", android: "system-update" }}
            title={
              status === "downloaded"
                ? t("appUpdates.install")
                : t("appUpdates.download")
            }
            detail={data.assetName}
            isLast
            onPress={onInstallerPress}
          />
        </SectionCard>
      ) : null}
      {status === "downloaded" ? (
        <Text className="px-4 text-base" style={{ color: palette.textMuted }}>
          {t("appUpdates.androidInstallHint")}
        </Text>
      ) : null}
    </View>
  )
}

function UpdatePreferences({
  data,
  busy,
  setPreferences,
}: Pick<ReturnType<typeof useAppUpdate>, "data" | "busy" | "setPreferences">) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  return (
    <>
      <ListRow
        title={t("appUpdates.autoCheck")}
        detail={t("appUpdates.autoCheckDetail")}
        accessory={
          <Switch
            accessibilityLabel={t("appUpdates.autoCheck")}
            disabled={busy || !data}
            value={data?.autoCheck ?? true}
            onValueChange={(value) =>
              setPreferences(value, data?.autoDownload ?? false)
            }
            trackColor={{ false: palette.border, true: palette.primary }}
            thumbColor={palette.surface}
          />
        }
      />
      <ListRow
        title={t("appUpdates.autoDownload")}
        detail={t("appUpdates.autoDownloadDetail")}
        isLast
        accessory={
          <Switch
            accessibilityLabel={t("appUpdates.autoDownload")}
            disabled={busy || !data}
            value={data?.autoDownload ?? false}
            onValueChange={(value) =>
              setPreferences(data?.autoCheck ?? true, value)
            }
            trackColor={{ false: palette.border, true: palette.primary }}
            thumbColor={palette.surface}
          />
        }
      />
    </>
  )
}

function useUpdateText(data: ReturnType<typeof useAppUpdate>["data"]) {
  const { t } = useTranslation()
  const progress = data?.totalBytes
    ? Math.floor(((data.downloadedBytes ?? 0) / data.totalBytes) * 100)
    : 0
  return {
    progress,
    statusText: t(appUpdateMessage(data?.status ?? "idle"), {
      version: data?.version ?? "",
      progress,
    }),
    errorText: t(appUpdateErrorMessage(data?.error)),
  }
}
