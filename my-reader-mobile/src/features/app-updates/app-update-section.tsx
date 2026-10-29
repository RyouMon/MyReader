import { appUpdateMessage, appUpdateErrorMessage } from "@my-reader/i18n/mobile"
import { router } from "expo-router"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"
import { Button, FormSwitch, ListRow } from "@/src/components"
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
      <UpdatePreferences
        data={data}
        busy={busy}
        setPreferences={setPreferences}
      />
      <View className="border-t" style={{ borderColor: palette.border }}>
        <ListRow
          title={
            data
              ? t("appUpdates.currentVersion", { version: data.currentVersion })
              : t("appUpdates.check")
          }
          detail={statusText}
          isLast
          accessory={
            <View className="gap-1">
              <Button
                title={t("appUpdates.check")}
                variant="ghost"
                size="sm"
                disabled={busy}
                onPress={() => check()}
              />
              {data?.version ? (
                <Button
                  title={t(
                    status === "downloaded"
                      ? "appUpdates.install"
                      : "appUpdates.download",
                  )}
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onPress={onInstallerPress}
                />
              ) : null}
            </View>
          }
        />
      </View>
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
        <ListRow
          title={t("appUpdates.notes")}
          icon={{ ios: "doc.text", android: "description" }}
          value={data.version}
          isLast
          onPress={() => router.push("/update-notes")}
        />
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
  return (
    <View className="gap-3">
      <FormSwitch
        label={t("appUpdates.autoCheck")}
        description={t("appUpdates.autoCheckDetail")}
        align="between"
        disabled={busy || !data}
        value={data?.autoCheck ?? true}
        onValueChange={(value) =>
          setPreferences(value, data?.autoDownload ?? false)
        }
      />
      <FormSwitch
        label={t("appUpdates.autoDownload")}
        description={t("appUpdates.autoDownloadDetail")}
        align="between"
        disabled={busy || !data}
        value={data?.autoDownload ?? false}
        onValueChange={(value) =>
          setPreferences(data?.autoCheck ?? true, value)
        }
      />
    </View>
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
