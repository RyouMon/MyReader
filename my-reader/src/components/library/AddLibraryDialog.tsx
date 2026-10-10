import { apiErrorKind } from "@/lib/api-error"
import type { DesktopTranslationKey } from "@my-reader/i18n/desktop"
import { appendRemotePathSegment } from "@my-reader/tools/remote-path"
import type { DataSource } from "@my-reader/tools/types/data-source"
import { join } from "@tauri-apps/api/path"
import { open as openDirectory } from "@tauri-apps/plugin-dialog"
import { CircleHelp, FolderOpen, Library, Loader2, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  FlowDialogChoice,
  FlowDialogContent,
  FlowDialogHeader,
} from "@/components/common/FlowDialog"
import { LocalStorageIcon } from "@/components/common/LocalStorageIcon"
import { OneDriveCloudIcon } from "@/components/common/OneDriveCloudIcon"
import { SectionHeader } from "@/components/common/SectionHeader"
import { WebdavServerIcon } from "@/components/common/WebdavServerIcon"
import { StatusNotice } from "@/components/common/StatusNotice"
import {
  AddDataSourceForm,
  type CreatableDataSourceType,
} from "@/components/settings/forms/AddDataSourcePanel"
import { OnedriveFolderBrowser } from "@/components/settings/OnedriveFolderBrowser"
import { WebdavFolderBrowser } from "@/components/settings/WebdavFolderBrowser"
import { Button } from "@/components/ui/button"
import { Dialog, DialogFooter } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  useDataSourceMutations,
  useDataSourcesQuery,
} from "@/hooks/queries/useDataSourcesQuery"
import { useLibraryMutations } from "@/hooks/queries/useLibrariesQuery"
import { formatApiError } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

type LibraryOperation = "create" | "open"

type CreationLocation =
  | { type: "local"; parentPath: string }
  | { type: "remote"; parentPath: string; source: DataSource }

type FlowStep =
  | { kind: "action" }
  | { kind: "location"; operation: LibraryOperation }
  | {
      kind: "addDataSource"
      operation: LibraryOperation
      sourceType: CreatableDataSourceType
    }
  | { kind: "remoteBrowser"; operation: LibraryOperation; source: DataSource }
  | { kind: "nameLibrary"; location: CreationLocation }

interface AddLibraryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddLibraryDialog({
  open,
  onOpenChange,
}: AddLibraryDialogProps) {
  const { t } = useTranslation()
  const { data: dataSources = [], isLoading: loadingDataSources } =
    useDataSourcesQuery()
  const { createDataSource } = useDataSourceMutations()
  const {
    createLocalMyreaderLibrary,
    createRemoteMyreaderLibrary,
    openExistingLocalLibrary,
    openExistingRemoteLibrary,
  } = useLibraryMutations()
  const [step, setStep] = useState<FlowStep>({ kind: "action" })
  const [libraryName, setLibraryName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enabledDataSources = dataSources.filter((source) => source.enabled)

  useEffect(() => {
    if (!open) return
    setStep({ kind: "action" })
    setLibraryName("")
    setSubmitting(false)
    setError(null)
  }, [open])

  function goToLocation(operation: LibraryOperation) {
    setError(null)
    setStep({ kind: "location", operation })
  }

  function goToNameLibrary(location: CreationLocation) {
    setLibraryName(t("library.defaultMyreaderName"))
    setError(null)
    setStep({ kind: "nameLibrary", location })
  }

  function resetFlow() {
    setStep({ kind: "action" })
    setLibraryName("")
    setSubmitting(false)
    setError(null)
  }

  function closeFlow() {
    resetFlow()
    onOpenChange(false)
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen && submitting) return
    if (!nextOpen) resetFlow()
    onOpenChange(nextOpen)
  }

  function formatLibraryError(
    caught: unknown,
    operation: LibraryOperation,
  ): string {
    const detail = formatApiError(caught)
    const kind = apiErrorKind(caught)
    if (kind === "LibraryAlreadyExists") {
      return t("addLibraryFlow.errors.duplicate")
    }
    if (kind === "MetadataDbNotFound" || kind === "LibraryMarkerNotFound") {
      return t("addLibraryFlow.errors.unrecognized")
    }
    return t(
      operation === "create"
        ? "addLibraryFlow.errors.create"
        : "addLibraryFlow.errors.open",
      { detail },
    )
  }

  async function handleChooseLocal(operation: LibraryOperation) {
    setError(null)
    try {
      const selected = await openDirectory({
        directory: true,
        multiple: false,
        title:
          operation === "create"
            ? t("addLibraryFlow.local.createPickerTitle")
            : t("addLibraryFlow.local.openPickerTitle"),
      })
      if (typeof selected !== "string") return
      if (operation === "create") {
        goToNameLibrary({ type: "local", parentPath: selected })
        return
      }

      setSubmitting(true)
      try {
        await openExistingLocalLibrary(selected)
        toast.success(t("addLibraryFlow.opened"))
        closeFlow()
      } catch (caught) {
        setError(formatLibraryError(caught, "open"))
      } finally {
        setSubmitting(false)
      }
    } catch (caught) {
      setError(formatLibraryError(caught, "open"))
    }
  }

  async function handleOpenRemote(source: DataSource, rootPath: string) {
    setSubmitting(true)
    try {
      await openExistingRemoteLibrary({
        dataSourceId: source.id,
        rootPath,
        sourceType: source.type,
      })
      toast.success(t("addLibraryFlow.opened"))
      closeFlow()
    } catch (caught) {
      throw new Error(formatLibraryError(caught, "open"))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateLibrary() {
    if (step.kind !== "nameLibrary") return
    const name = libraryName.trim()
    if (!isValidLibraryName(name)) return

    setSubmitting(true)
    setError(null)
    try {
      if (step.location.type === "local") {
        const libraryPath = await join(step.location.parentPath, name)
        await createLocalMyreaderLibrary(libraryPath)
      } else {
        const rootPath = appendRemotePathSegment(step.location.parentPath, name)
        if (!rootPath) return
        await createRemoteMyreaderLibrary({
          dataSourceId: step.location.source.id,
          rootPath,
        })
      }
      toast.success(t("addLibraryFlow.created"))
      closeFlow()
    } catch (caught) {
      setError(formatLibraryError(caught, "create"))
    } finally {
      setSubmitting(false)
    }
  }

  function renderRemoteBrowser(
    browserStep: Extract<FlowStep, { kind: "remoteBrowser" }>,
  ) {
    const browserProps = {
      dataSourceId: browserStep.source.id,
      open,
      onOpenChange: handleDialogOpenChange,
      embedded: true,
      closeOnSelect: false,
      selectingLabel: t("addLibraryFlow.opening"),
      onSelect: (path: string) => {
        if (browserStep.operation === "create") {
          goToNameLibrary({
            type: "remote",
            parentPath: path,
            source: browserStep.source,
          })
          return
        }
        return handleOpenRemote(browserStep.source, path)
      },
    }

    return browserStep.source.type === "webdav" ? (
      <WebdavFolderBrowser {...browserProps} />
    ) : (
      <OnedriveFolderBrowser {...browserProps} />
    )
  }

  const copy = flowStepCopy(step)
  function handleBack() {
    if (step.kind === "location") {
      setError(null)
      setStep({ kind: "action" })
    } else if (step.kind === "addDataSource" || step.kind === "remoteBrowser") {
      goToLocation(step.operation)
    } else {
      goToLocation("create")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <FlowDialogContent>
        <FlowDialogHeader
          title={t(copy.title)}
          description={copy.description ? t(copy.description) : undefined}
          onBack={submitting || step.kind === "action" ? undefined : handleBack}
          backLabel={t("common.back")}
          closeLabel={t("common.close")}
          showCloseButton={!submitting}
        />

        <div
          className={cn(
            "min-h-0 px-6 py-5",
            step.kind === "remoteBrowser" ||
              step.kind === "addDataSource" ||
              step.kind === "nameLibrary"
              ? "overflow-hidden"
              : "overflow-y-auto",
          )}
        >
          {step.kind === "action" ? (
            <div className="space-y-4">
              <div className="grid gap-3">
                <FlowDialogChoice
                  icon={Plus}
                  title={t("addLibraryFlow.create.title")}
                  description={t("addLibraryFlow.create.description")}
                  onClick={() => goToLocation("create")}
                />
                <FlowDialogChoice
                  icon={FolderOpen}
                  title={t("addLibraryFlow.open.title")}
                  description={t("addLibraryFlow.open.description")}
                  onClick={() => goToLocation("open")}
                />
              </div>
              <StatusNotice
                icon={
                  <CircleHelp
                    aria-hidden="true"
                    className="mt-[1px] size-4 shrink-0 text-primary"
                  />
                }
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      {t("addLibraryFlow.help.myreader.title")}
                    </p>
                    <p>{t("addLibraryFlow.help.myreader.body")}</p>
                  </div>
                  <div className="space-y-1 border-t border-border pt-3">
                    <p className="font-medium text-foreground">
                      {t("addLibraryFlow.help.calibre.title")}
                    </p>
                    <p>{t("addLibraryFlow.help.calibre.body")}</p>
                  </div>
                  <div className="space-y-1 border-t border-border pt-3">
                    <p className="font-medium text-foreground">
                      {t("addLibraryFlow.help.sync.title")}
                    </p>
                    <p>{t("addLibraryFlow.help.sync.body")}</p>
                  </div>
                  <div className="space-y-1 border-t border-border pt-3">
                    <p className="font-medium text-foreground">
                      {t("addLibraryFlow.help.choice.title")}
                    </p>
                    <p>{t("addLibraryFlow.help.choice.body")}</p>
                  </div>
                </div>
              </StatusNotice>
            </div>
          ) : null}

          {step.kind === "location" ? (
            <LibraryLocationChoices
              enabledDataSources={enabledDataSources}
              loadingDataSources={loadingDataSources}
              submitting={submitting}
              error={error}
              onChooseLocal={() => void handleChooseLocal(step.operation)}
              onChooseRemote={(source) => {
                setError(null)
                setStep({
                  kind: "remoteBrowser",
                  operation: step.operation,
                  source,
                })
              }}
              onAddSource={(sourceType) =>
                setStep({
                  kind: "addDataSource",
                  operation: step.operation,
                  sourceType,
                })
              }
            />
          ) : null}

          {step.kind === "addDataSource" ? (
            <AddDataSourceForm
              type={step.sourceType}
              fillAvailableHeight
              autoStartOnedriveAuth={step.sourceType === "onedrive"}
              onCreateDataSource={createDataSource}
              onCreated={(source) => {
                setError(null)
                setStep({
                  kind: "remoteBrowser",
                  operation: step.operation,
                  source,
                })
              }}
            />
          ) : null}

          {step.kind === "remoteBrowser" ? renderRemoteBrowser(step) : null}

          {step.kind === "nameLibrary" ? (
            <NewLibraryNameForm
              libraryName={libraryName}
              submitting={submitting}
              error={error}
              parentPath={step.location.parentPath}
              onNameChange={(name) => {
                setLibraryName(name)
                setError(null)
              }}
              onSubmit={handleCreateLibrary}
            />
          ) : null}
        </div>
      </FlowDialogContent>
    </Dialog>
  )
}

function flowStepCopy(step: FlowStep): {
  title: DesktopTranslationKey
  description?: DesktopTranslationKey
} {
  switch (step.kind) {
    case "action":
      return {
        title: "addLibraryFlow.title",
        description: "addLibraryFlow.description",
      }
    case "location":
      return {
        title: "addLibraryFlow.location.title",
        description:
          step.operation === "create"
            ? "addLibraryFlow.location.createDescription"
            : "addLibraryFlow.location.openDescription",
      }
    case "addDataSource":
      return {
        title:
          step.sourceType === "webdav"
            ? "addLibraryFlow.addWebdav.title"
            : "addLibraryFlow.addOnedrive.title",
      }
    case "remoteBrowser":
      return {
        title:
          step.source.type === "webdav"
            ? "addLibraryForm.webdavBrowserTitle"
            : "addDataSourceForm.onedriveBrowserTitle",
      }
    case "nameLibrary":
      return {
        title: "addLibraryFlow.name.title",
        description: "addLibraryFlow.name.description",
      }
  }
}

function NewLibraryNameForm({
  libraryName,
  submitting,
  error,
  parentPath,
  onNameChange,
  onSubmit,
}: {
  libraryName: string
  submitting: boolean
  error: string | null
  parentPath: string
  onNameChange: (name: string) => void
  onSubmit: () => Promise<void>
}) {
  const { t } = useTranslation()
  const name = libraryName.trim()
  const nameInvalid = libraryName.length > 0 && !isValidLibraryName(name)
  return (
    <form
      className="flex h-full min-h-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        <Field data-invalid={nameInvalid}>
          <FieldLabel htmlFor="new-library-name">
            {t("addLibraryFlow.name.label")}
          </FieldLabel>
          <Input
            id="new-library-name"
            value={libraryName}
            onChange={(event) => {
              onNameChange(event.target.value)
            }}
            disabled={submitting}
            aria-invalid={nameInvalid}
            autoFocus
            autoComplete="off"
          />
          <FieldDescription>
            {nameInvalid
              ? t("addLibraryFlow.name.invalid")
              : t("addLibraryFlow.name.parent", {
                  path: parentPath,
                })}
          </FieldDescription>
        </Field>

        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
      </div>

      <DialogFooter className="mt-4 shrink-0 border-t border-border pt-3">
        <Button type="submit" disabled={submitting || !name || nameInvalid}>
          {submitting ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Library data-icon="inline-start" />
          )}
          {submitting
            ? t("addLibraryFlow.creating")
            : t("addLibraryFlow.create.action")}
        </Button>
      </DialogFooter>
    </form>
  )
}

function LibraryLocationChoices({
  enabledDataSources,
  loadingDataSources,
  submitting,
  error,
  onChooseLocal,
  onChooseRemote,
  onAddSource,
}: {
  enabledDataSources: DataSource[]
  loadingDataSources: boolean
  submitting: boolean
  error: string | null
  onChooseLocal: () => void
  onChooseRemote: (source: DataSource) => void
  onAddSource: (sourceType: CreatableDataSourceType) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-5">
      <section>
        <SectionHeader title={t("addLibraryFlow.storageLocations")} />
        <div className="grid gap-2">
          <FlowDialogChoice
            icon={LocalStorageIcon}
            title={t("addLibraryFlow.local.title")}
            description={t("addLibraryFlow.local.description")}
            disabled={submitting}
            loading={submitting}
            onClick={onChooseLocal}
          />
          {loadingDataSources ? (
            <div
              className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : (
            enabledDataSources.map((source) => (
              <FlowDialogChoice
                key={source.id}
                icon={
                  source.type === "webdav"
                    ? WebdavServerIcon
                    : OneDriveCloudIcon
                }
                title={
                  source.type === "onedrive"
                    ? source.displayName || source.name
                    : source.name
                }
                description={
                  source.type === "webdav"
                    ? source.endpoint
                    : source.email || undefined
                }
                disabled={submitting}
                onClick={() => onChooseRemote(source)}
              />
            ))
          )}
        </div>
      </section>

      <section>
        <SectionHeader title={t("addLibraryFlow.addStorage")} />
        <div className="grid grid-cols-2 gap-2">
          <FlowDialogChoice
            compact
            icon={WebdavServerIcon}
            title={t("addLibraryFlow.addWebdav.title")}
            disabled={submitting}
            onClick={() => onAddSource("webdav")}
          />
          <FlowDialogChoice
            compact
            icon={OneDriveCloudIcon}
            title={t("addLibraryFlow.addOnedrive.title")}
            disabled={submitting}
            onClick={() => onAddSource("onedrive")}
          />
        </div>
      </section>

      {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
    </div>
  )
}

function isValidLibraryName(name: string): boolean {
  return name.length > 0 && name !== "." && name !== ".." && !/[\\/]/.test(name)
}
