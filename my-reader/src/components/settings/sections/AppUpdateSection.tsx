import {
  appUpdateMessage,
  appUpdateErrorMessage,
} from "@my-reader/i18n/desktop"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { AppRow } from "@/components/common/AppRow"
import { FormSwitch } from "@/components/common/FormSwitch"
import { useAppUpdate } from "@/hooks/useAppUpdate"
import { ReleaseNotes } from "./ReleaseNotes"

export default function AppUpdateSection() {
  const { t } = useTranslation()
  const {
    data,
    error,
    busy,
    supported,
    check,
    download,
    install,
    setPreferences,
  } = useAppUpdate()
  const status = data?.status ?? "idle"
  const { progress, statusText, errorText } = useUpdateText(data)

  return (
    <section className="w-full space-y-5" aria-label={t("appUpdates.title")}>
      <UpdatePreferences
        data={data}
        busy={busy}
        setPreferences={setPreferences}
      />
      <div className="space-y-3">
        <AppRow
          className="flex-wrap items-center"
          bodyClassName="flex-none"
          body={
            data
              ? t("appUpdates.currentVersion", { version: data.currentVersion })
              : ""
          }
          tail={
            <Button
              variant="outline"
              disabled={busy || !supported}
              onClick={() => check()}
            >
              {t("appUpdates.check")}
            </Button>
          }
          actionsClassName="ml-auto min-w-0 shrink"
          actions={
            <div className="flex flex-wrap items-center justify-end gap-3">
              <p role="status" className="text-sm text-muted-foreground">
                {statusText}
              </p>
              {data?.version && status !== "downloaded" ? (
                <Button disabled={busy} onClick={download}>
                  {t("appUpdates.download")}
                </Button>
              ) : null}
              {status === "downloaded" ? (
                <Button disabled={busy} onClick={install}>
                  {t("appUpdates.install")}
                </Button>
              ) : null}
            </div>
          }
        />
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
      {data?.version ? (
        <section
          className="space-y-3 border-t border-border pt-5 text-sm"
          aria-label={t("appUpdates.notes")}
        >
          <h3 className="font-semibold">
            {t("appUpdates.latestVersion", { version: data.version })}
          </h3>
          <ReleaseNotes>
            {data.notes?.trim() || t("appUpdates.notesEmpty")}
          </ReleaseNotes>
        </section>
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
    <div className="flex flex-col gap-4">
      <FormSwitch
        align="between"
        label={t("appUpdates.autoCheck")}
        description={t("appUpdates.autoCheckDetail")}
        checked={data?.autoCheck ?? true}
        disabled={busy || !data}
        onCheckedChange={(value) =>
          setPreferences(value, data?.autoDownload ?? false)
        }
      />
      <FormSwitch
        align="between"
        label={t("appUpdates.autoDownload")}
        description={t("appUpdates.autoDownloadDetail")}
        checked={data?.autoDownload ?? false}
        disabled={busy || !data}
        onCheckedChange={(value) =>
          setPreferences(data?.autoCheck ?? true, value)
        }
      />
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
