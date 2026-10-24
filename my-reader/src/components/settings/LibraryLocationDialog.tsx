import {
  libraryLocationProblemKey,
  libraryLocationTitleKey,
} from "@my-reader/i18n/desktop"
import type { Library } from "@my-reader/tools/types/library"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { FolderBrowser } from "./FolderBrowser"
import {
  pickLibraryLocation,
  retryLibrarySync,
  useLibraryLocation,
  useLocationFolders,
  useRelocateLibrary,
} from "@/hooks/useLibraryLocation"

export function LibraryLocationDetails({
  location,
}: {
  location: NonNullable<ReturnType<typeof useLibraryLocation>["data"]>
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0 space-y-2 text-sm [overflow-wrap:anywhere]">
      <p className="font-medium">{location.libraryName}</p>
      {location.dataSourceName ? (
        <p>
          {t("libraryLocation.dataSource")}: {location.dataSourceName}
        </p>
      ) : null}
      {location.sourceRoot ? (
        <p>
          {t("libraryLocation.sourceRoot")}: {location.sourceRoot}
        </p>
      ) : null}
      <p>
        {t("libraryLocation.currentPath")}: {location.path}
      </p>
      <p>
        {t("libraryLocation.effectivePath")}: {location.effectivePath}
      </p>
      {location.problem ? (
        <div role="alert" className="space-y-2 text-danger">
          <p className="font-medium">
            {t(libraryLocationTitleKey(location.problem))}
          </p>
          <p>
            {t(libraryLocationProblemKey(location.problem), {
              path: location.effectivePath,
            })}
          </p>
          {location.problem === "data_source" ||
          location.problem === "credential" ? (
            <Link
              to="/settings"
              search={{ section: "dataSources" }}
              className="underline"
            >
              {t("libraryLocation.sourceSettings")}
            </Link>
          ) : null}
        </div>
      ) : null}
      {location.detail ? (
        <details>
          <summary>{t("libraryLocation.technicalDetails")}</summary>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs [overflow-wrap:anywhere]">
            {location.detail}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

function LocationError({ errors }: { errors: unknown[] }) {
  const error = errors.find(Boolean)
  return error ? (
    <p role="alert" className="text-danger [overflow-wrap:anywhere]">
      {String(error)}
    </p>
  ) : null
}

export function LibraryLocationDialog({
  library,
  open,
  onOpenChange,
}: {
  library: Library
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const info = useLibraryLocation(library, true, open)
  const save = useRelocateLibrary(library)
  const [path, setPath] = useState(library.sourcePath ?? "/")
  const [browsing, setBrowsing] = useState(false)
  const [localPath, setLocalPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const remote =
    library.sourceType === "webdav" || library.sourceType === "onedrive"
  const folders = useLocationFolders(library, path, open && browsing && remote)
  const location = save.data ?? info.data
  const saved = !!save.data && !save.data.problem
  async function savePath(path: string) {
    setError(null)
    const result = await save.mutateAsync(path)
    if (!result.problem) setBrowsing(false)
  }
  async function choose() {
    if (remote) {
      setBrowsing(true)
      return
    }
    try {
      const selected = await pickLibraryLocation()
      if (typeof selected === "string") setLocalPath(selected)
    } catch (error) {
      setError(String(error))
    }
  }
  async function sync() {
    setSyncing(true)
    setError(null)
    try {
      await retryLibrarySync(library.id)
    } catch (error) {
      setError(String(error))
    } finally {
      setSyncing(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!save.isPending) onOpenChange(value)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("libraryLocation.action")}</DialogTitle>
          <DialogDescription>{t("libraryLocation.keepData")}</DialogDescription>
        </DialogHeader>
        {location ? <LibraryLocationDetails location={location} /> : null}
        {info.isPending ? <p>{t("common.loading")}</p> : null}
        {saved ? (
          <p role="status" className="text-success">
            {t("libraryLocation.saved")}
          </p>
        ) : null}
        <LocationError errors={[info.error, save.error, error]} />
        {browsing ? (
          <FolderBrowser
            title={t("libraryLocation.choose")}
            open
            embedded
            onOpenChange={setBrowsing}
            currentPath={path}
            folders={folders.data ?? []}
            loading={folders.isFetching}
            error={folders.error ? String(folders.error) : null}
            loadingMessage={t("common.loading")}
            emptyMessage={t("addLibraryForm.webdavBrowserEmpty")}
            errorMessage={t("addLibraryForm.webdavBrowserError")}
            selectLabel={t("libraryLocation.save")}
            onNavigate={setPath}
            onRefresh={() => void folders.refetch()}
            onSelect={savePath}
            closeOnSelect={false}
          />
        ) : null}
        {localPath ? (
          <div className="space-y-2 [overflow-wrap:anywhere]">
            <p>{localPath}</p>
            <Button
              disabled={save.isPending}
              onClick={() => void savePath(localPath).catch(() => {})}
            >
              {t("libraryLocation.save")}
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {location?.canRelocate && !browsing ? (
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => void choose()}
            >
              {t("libraryLocation.choose")}
            </Button>
          ) : null}
          {saved ? (
            <Button disabled={syncing} onClick={() => void sync()}>
              {t("libraryLocation.retry")}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            disabled={save.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function LibraryLocationFailure({ library }: { library: Library }) {
  const info = useLibraryLocation(library, true)
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  return (
    <div className="min-w-0 space-y-3">
      {info.data ? <LibraryLocationDetails location={info.data} /> : null}
      {info.data?.canRelocate ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          {t("libraryLocation.action")}
        </Button>
      ) : null}
      {open ? (
        <LibraryLocationDialog library={library} open onOpenChange={setOpen} />
      ) : null}
    </div>
  )
}
