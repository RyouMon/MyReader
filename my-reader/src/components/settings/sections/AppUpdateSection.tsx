import {
  appUpdateMessage,
  appUpdateErrorMessage,
} from "@my-reader/i18n/desktop"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useAppUpdate } from "@/hooks/useAppUpdate"

export default function AppUpdateSection() {
  const { t } = useTranslation()
  const {
    data,
    error,
    busy,
    supported,
    check,
    download,
    reveal,
    setPreferences,
  } = useAppUpdate()
  const status = data?.status ?? "idle"
  const { progress, statusText, errorText } = useUpdateText(data)

  return (
    <section className="w-full space-y-5" aria-label={t("appUpdates.title")}>
      <div>
        <h2 className="text-base font-semibold">{t("appUpdates.title")}</h2>
        {data ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("appUpdates.currentVersion", { version: data.currentVersion })}
          </p>
        ) : null}
      </div>
      <UpdatePreferences
        data={data}
        busy={busy}
        setPreferences={setPreferences}
      />
      <div className="space-y-3">
        <p role="status" className="text-sm text-muted-foreground">
          {statusText}
        </p>
        {status === "downloading" ? (
          <progress
            className="h-2 w-full accent-primary"
            value={progress}
            max={100}
            aria-label={t("appUpdates.download")}
          />
        ) : null}
        {data?.error || error ? (
          <p role="alert" className="text-sm text-danger">
            {errorText}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !supported}
            onClick={() => check()}
          >
            {t("appUpdates.check")}
          </Button>
          {data?.version && status !== "downloaded" ? (
            <Button disabled={busy} onClick={download}>
              {t("appUpdates.download")}
            </Button>
          ) : null}
          {status === "downloaded" ? (
            <Button disabled={busy} onClick={reveal}>
              {t("appUpdates.showInstaller")}
            </Button>
          ) : null}
        </div>
        {data?.assetName ? (
          <p className="break-all text-xs text-muted-foreground">
            {data.assetName}
          </p>
        ) : null}
        {status === "downloaded" ? (
          <p className="text-sm text-muted-foreground">
            {t("appUpdates.manualInstall")}
          </p>
        ) : null}
      </div>
      {data?.notes ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            {t("appUpdates.notes")}
          </summary>
          <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">
            {data.notes}
          </p>
        </details>
      ) : null}
    </section>
  )
}

function UpdatePreferences({
  data,
  busy,
  setPreferences,
}: Pick<ReturnType<typeof useAppUpdate>, "data" | "busy" | "setPreferences">) {
  const { t } = useTranslation()
  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      <label className="flex items-center justify-between gap-4 p-4">
        <span className="space-y-1">
          <span className="block text-sm font-medium">
            {t("appUpdates.autoCheck")}
          </span>
          <span className="block text-sm text-muted-foreground">
            {t("appUpdates.autoCheckDetail")}
          </span>
        </span>
        <Switch
          aria-label={t("appUpdates.autoCheck")}
          checked={data?.autoCheck ?? true}
          disabled={busy || !data}
          onCheckedChange={(value) =>
            setPreferences(value, data?.autoDownload ?? false)
          }
        />
      </label>
      <label className="flex items-center justify-between gap-4 p-4">
        <span className="space-y-1">
          <span className="block text-sm font-medium">
            {t("appUpdates.autoDownload")}
          </span>
          <span className="block text-sm text-muted-foreground">
            {t("appUpdates.autoDownloadDetail")}
          </span>
        </span>
        <Switch
          aria-label={t("appUpdates.autoDownload")}
          checked={data?.autoDownload ?? false}
          disabled={busy || !data}
          onCheckedChange={(value) =>
            setPreferences(data?.autoCheck ?? true, value)
          }
        />
      </label>
    </div>
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
