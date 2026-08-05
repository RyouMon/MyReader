import { useForm } from "@tanstack/react-form"
import { open } from "@tauri-apps/plugin-dialog"
import { FolderSearch, Loader2, PlusCircle } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { AddPanelButton } from "@/components/common/AddPanelButton"
import {
  DataSourceTypeSelector,
  type DataSourceType,
} from "@/components/settings/DataSourceTypeSelector"
import { WebdavFolderBrowser } from "@/components/settings/WebdavFolderBrowser"
import { OnedriveFolderBrowser } from "@/components/settings/OnedriveFolderBrowser"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "@/constants/local-library-data-source"
import { cn } from "@/lib/utils"
import { useDataSourcesQuery } from "@/hooks/queries/useDataSourcesQuery"

export type AddLibraryOperation =
  | "createMyreader"
  | "openMyreader"
  | "connectCalibre"

export interface AddLibrarySubmission {
  operation: AddLibraryOperation
  sourceType: DataSourceType
  dataSourceId: string
  path: string
}

interface AddLibraryPanelProps {
  onSubmitLibrary: (request: AddLibrarySubmission) => Promise<unknown>
}

export function AddLibraryPanel({ onSubmitLibrary }: AddLibraryPanelProps) {
  const { t } = useTranslation()
  const { data: dataSources = [], isLoading: loadingDataSources } =
    useDataSourcesQuery()

  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [operation, setOperation] =
    useState<AddLibraryOperation>("createMyreader")
  const [selectedType, setSelectedType] = useState<DataSourceType>("local")
  const [webdavBrowserOpen, setWebdavBrowserOpen] = useState(false)
  const [onedriveBrowserOpen, setOnedriveBrowserOpen] = useState(false)
  const submitInFlightRef = useRef(false)
  const pathInputRef = useRef<HTMLInputElement>(null)
  const availableWebdavSources = dataSources.filter(
    (row) => row.enabled && row.type === "webdav",
  )
  const availableOnedriveSources = dataSources.filter(
    (row) => row.enabled && row.type === "onedrive",
  )

  const addLibrarySchema = useMemo(
    () =>
      z.object({
        dataSourceId: z
          .string()
          .trim()
          .min(1, t("addLibraryForm.validation.selectDataSource")),
        path: z
          .string()
          .trim()
          .min(1, t("addLibraryForm.validation.pathRequired")),
      }),
    [t],
  )

  const addLibraryForm = useForm({
    defaultValues: {
      dataSourceId: LOCAL_LIBRARY_DATA_SOURCE_ID,
      path: "",
    },
    validators: {
      onSubmit: addLibrarySchema,
    },
    onSubmit: async ({ value }) => {
      if (submitInFlightRef.current) return
      submitInFlightRef.current = true
      setAdding(true)
      setSubmitError(null)
      try {
        await onSubmitLibrary({
          operation,
          sourceType: selectedType,
          dataSourceId: value.dataSourceId,
          path: value.path.trim(),
        })
        handleClosePanel()
      } catch (error) {
        setSubmitError(String(error))
      } finally {
        submitInFlightRef.current = false
        setAdding(false)
      }
    },
  })

  function handleOpenPanel() {
    setAddPanelOpen(true)
    setSubmitError(null)
    setOperation("createMyreader")
    setSelectedType("local")
    addLibraryForm.setFieldValue("dataSourceId", LOCAL_LIBRARY_DATA_SOURCE_ID)
    setTimeout(() => pathInputRef.current?.focus(), 50)
  }

  function handleClosePanel() {
    setAddPanelOpen(false)
    setSubmitError(null)
    addLibraryForm.reset()
    setOperation("createMyreader")
    setSelectedType("local")
  }

  function handleTypeChange(type: DataSourceType) {
    setSelectedType(type)
    setSubmitError(null)
    if (type === "local") {
      addLibraryForm.setFieldValue("dataSourceId", LOCAL_LIBRARY_DATA_SOURCE_ID)
    } else if (type === "webdav" && availableWebdavSources.length > 0) {
      addLibraryForm.setFieldValue("dataSourceId", availableWebdavSources[0].id)
    } else if (type === "onedrive" && availableOnedriveSources.length > 0) {
      addLibraryForm.setFieldValue(
        "dataSourceId",
        availableOnedriveSources[0].id,
      )
    } else {
      addLibraryForm.setFieldValue("dataSourceId", "")
    }
  }

  async function openLocalDirectoryPicker() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t(`addLibraryForm.operations.${operation}.pickerTitle`),
      })
      if (!selected) return
      const path = selected as string
      addLibraryForm.setFieldValue("path", path)
      setSubmitError(null)
      pathInputRef.current?.focus()
    } catch (error) {
      console.error(
        "Failed to open directory picker for library path. error:",
        error,
      )
    }
  }

  function handleWebdavFolderSelect(path: string) {
    addLibraryForm.setFieldValue("path", path)
    setSubmitError(null)
    pathInputRef.current?.focus()
  }

  function handleOnedriveFolderSelect(path: string) {
    addLibraryForm.setFieldValue("path", path)
    setSubmitError(null)
    pathInputRef.current?.focus()
  }

  const selectedWebdavSource = availableWebdavSources.find(
    (s) => s.id === addLibraryForm.state.values.dataSourceId,
  )
  const selectedOnedriveSource = availableOnedriveSources.find(
    (s) => s.id === addLibraryForm.state.values.dataSourceId,
  )

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg transition-colors",
        addPanelOpen
          ? "border border-primary"
          : "border border-dashed border-border",
      )}
    >
      <AddPanelButton
        label={t("addLibraryForm.label")}
        onClick={addPanelOpen ? handleClosePanel : handleOpenPanel}
      />
      {addPanelOpen && (
        <div className="border-t border-border bg-card px-4 py-4 animate-in slide-in-from-top-1 fade-in-0 duration-200">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void addLibraryForm.handleSubmit()
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="library-operation">
                  {t("addLibraryForm.operationLabel")}
                </FieldLabel>
                <Select
                  value={operation}
                  onValueChange={(value) => {
                    setOperation(value as AddLibraryOperation)
                    addLibraryForm.setFieldValue("path", "")
                    setSubmitError(null)
                  }}
                  disabled={adding}
                >
                  <SelectTrigger id="library-operation" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="createMyreader">
                        {t("addLibraryForm.operations.createMyreader.label")}
                      </SelectItem>
                      <SelectItem value="openMyreader">
                        {t("addLibraryForm.operations.openMyreader.label")}
                      </SelectItem>
                      <SelectItem value="connectCalibre">
                        {t("addLibraryForm.operations.connectCalibre.label")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t(`addLibraryForm.operations.${operation}.description`)}
                </p>
              </Field>

              {/* Type selector */}
              <Field>
                <FieldLabel>{t("addLibraryForm.typeLabel")}</FieldLabel>
                <DataSourceTypeSelector
                  value={selectedType}
                  onChange={handleTypeChange}
                  disabled={adding || loadingDataSources}
                />
              </Field>

              {/* Local: path input + browse */}
              {selectedType === "local" && (
                <addLibraryForm.Field name="path">
                  {(pathField) => {
                    const isPathInvalid =
                      pathField.state.meta.isTouched &&
                      !pathField.state.meta.isValid
                    return (
                      <Field data-invalid={isPathInvalid}>
                        <FieldLabel htmlFor={pathField.name}>
                          {t("addLibraryForm.pathLabel")}
                        </FieldLabel>
                        <div className="flex items-center gap-2">
                          <Input
                            ref={pathInputRef}
                            id={pathField.name}
                            name={pathField.name}
                            value={pathField.state.value}
                            onBlur={pathField.handleBlur}
                            onChange={(event) => {
                              pathField.handleChange(event.target.value)
                              setSubmitError(null)
                            }}
                            placeholder={t(
                              `addLibraryForm.operations.${operation}.pathPlaceholder`,
                            )}
                            className="h-9 flex-1 font-mono text-xs"
                            spellCheck={false}
                            autoComplete="off"
                            disabled={adding}
                            aria-invalid={isPathInvalid}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="shrink-0 gap-1.5"
                            onClick={() => void openLocalDirectoryPicker()}
                            disabled={adding}
                          >
                            <FolderSearch className="size-[13px]" />
                            {t("addLibraryForm.browse")}
                          </Button>
                        </div>
                        {isPathInvalid && (
                          <FieldError errors={pathField.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                </addLibraryForm.Field>
              )}

              {/* WebDAV: data source select + path input + browse */}
              {selectedType === "webdav" && (
                <>
                  <addLibraryForm.Field name="dataSourceId">
                    {(field) => {
                      const isInvalid =
                        field.state.meta.isTouched && !field.state.meta.isValid
                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name}>
                            {t("addLibraryForm.dataSourceLabel")}
                          </FieldLabel>
                          <Select
                            name={field.name}
                            value={field.state.value}
                            onValueChange={(value) => {
                              field.handleChange(value)
                              setSubmitError(null)
                            }}
                            disabled={adding || loadingDataSources}
                          >
                            <SelectTrigger
                              id={field.name}
                              className="w-full"
                              onBlur={field.handleBlur}
                              aria-invalid={isInvalid}
                            >
                              <SelectValue
                                placeholder={t(
                                  "addLibraryForm.selectDataSource",
                                )}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {availableWebdavSources.map((source) => (
                                  <SelectItem key={source.id} value={source.id}>
                                    {source.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {isInvalid && (
                            <FieldError errors={field.state.meta.errors} />
                          )}
                          <p className="text-xs text-muted-foreground">
                            {t("addLibraryForm.webdavSourceHint")}
                          </p>
                        </Field>
                      )
                    }}
                  </addLibraryForm.Field>

                  <addLibraryForm.Field name="path">
                    {(pathField) => {
                      const isPathInvalid =
                        pathField.state.meta.isTouched &&
                        !pathField.state.meta.isValid
                      const browseDisabled = adding || !selectedWebdavSource
                      return (
                        <Field data-invalid={isPathInvalid}>
                          <FieldLabel htmlFor={pathField.name}>
                            {t("addLibraryForm.pathLabel")}
                          </FieldLabel>
                          <div className="flex items-center gap-2">
                            <Input
                              ref={pathInputRef}
                              id={pathField.name}
                              name={pathField.name}
                              value={pathField.state.value}
                              onBlur={pathField.handleBlur}
                              onChange={(event) => {
                                pathField.handleChange(event.target.value)
                                setSubmitError(null)
                              }}
                              placeholder={t(
                                `addLibraryForm.operations.${operation}.remotePathPlaceholder`,
                              )}
                              className="h-9 flex-1 font-mono text-xs"
                              spellCheck={false}
                              autoComplete="off"
                              disabled={adding}
                              aria-invalid={isPathInvalid}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="shrink-0 gap-1.5"
                              onClick={() => setWebdavBrowserOpen(true)}
                              disabled={browseDisabled}
                            >
                              <FolderSearch className="size-[13px]" />
                              {t("addLibraryForm.browse")}
                            </Button>
                          </div>
                          {isPathInvalid && (
                            <FieldError errors={pathField.state.meta.errors} />
                          )}
                        </Field>
                      )
                    }}
                  </addLibraryForm.Field>

                  {selectedWebdavSource && (
                    <WebdavFolderBrowser
                      dataSourceId={selectedWebdavSource.id}
                      open={webdavBrowserOpen}
                      onOpenChange={setWebdavBrowserOpen}
                      onSelect={handleWebdavFolderSelect}
                      createSubdirectory={operation === "createMyreader"}
                    />
                  )}
                </>
              )}

              {/* OneDrive: data source select + path input + browse */}
              {selectedType === "onedrive" && (
                <>
                  <addLibraryForm.Field name="dataSourceId">
                    {(field) => {
                      const isInvalid =
                        field.state.meta.isTouched && !field.state.meta.isValid
                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name}>
                            {t("addLibraryForm.dataSourceLabel")}
                          </FieldLabel>
                          <Select
                            name={field.name}
                            value={field.state.value}
                            onValueChange={(value) => {
                              field.handleChange(value)
                              setSubmitError(null)
                            }}
                            disabled={adding || loadingDataSources}
                          >
                            <SelectTrigger
                              id={field.name}
                              className="w-full"
                              onBlur={field.handleBlur}
                              aria-invalid={isInvalid}
                            >
                              <SelectValue
                                placeholder={t(
                                  "addLibraryForm.selectDataSource",
                                )}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {availableOnedriveSources.map((source) => (
                                  <SelectItem key={source.id} value={source.id}>
                                    {source.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {isInvalid && (
                            <FieldError errors={field.state.meta.errors} />
                          )}
                          <p className="text-xs text-muted-foreground">
                            {t("addLibraryForm.onedriveSourceHint")}
                          </p>
                        </Field>
                      )
                    }}
                  </addLibraryForm.Field>

                  <addLibraryForm.Field name="path">
                    {(pathField) => {
                      const isPathInvalid =
                        pathField.state.meta.isTouched &&
                        !pathField.state.meta.isValid
                      const browseDisabled = adding || !selectedOnedriveSource
                      return (
                        <Field data-invalid={isPathInvalid}>
                          <FieldLabel htmlFor={pathField.name}>
                            {t("addLibraryForm.pathLabel")}
                          </FieldLabel>
                          <div className="flex items-center gap-2">
                            <Input
                              ref={pathInputRef}
                              id={pathField.name}
                              name={pathField.name}
                              value={pathField.state.value}
                              onBlur={pathField.handleBlur}
                              onChange={(event) => {
                                pathField.handleChange(event.target.value)
                                setSubmitError(null)
                              }}
                              placeholder={t(
                                `addLibraryForm.operations.${operation}.remotePathPlaceholder`,
                              )}
                              className="h-9 flex-1 font-mono text-xs"
                              spellCheck={false}
                              autoComplete="off"
                              disabled={adding}
                              aria-invalid={isPathInvalid}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="shrink-0 gap-1.5"
                              onClick={() => setOnedriveBrowserOpen(true)}
                              disabled={browseDisabled}
                            >
                              <FolderSearch className="size-[13px]" />
                              {t("addLibraryForm.browse")}
                            </Button>
                          </div>
                          {isPathInvalid && (
                            <FieldError errors={pathField.state.meta.errors} />
                          )}
                        </Field>
                      )
                    }}
                  </addLibraryForm.Field>

                  {selectedOnedriveSource && (
                    <OnedriveFolderBrowser
                      dataSourceId={selectedOnedriveSource.id}
                      open={onedriveBrowserOpen}
                      onOpenChange={setOnedriveBrowserOpen}
                      onSelect={handleOnedriveFolderSelect}
                      createSubdirectory={operation === "createMyreader"}
                    />
                  )}
                </>
              )}

              {submitError && (
                <p className="text-xs text-destructive animate-in fade-in-0 duration-150">
                  {submitError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleClosePanel}
                  disabled={adding}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="gap-1.5"
                  disabled={adding}
                >
                  {adding ? (
                    <Loader2 className="size-[13px] animate-spin" />
                  ) : (
                    <PlusCircle className="size-[13px]" />
                  )}
                  {adding
                    ? t("addLibraryForm.adding")
                    : t(`addLibraryForm.operations.${operation}.confirm`)}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </div>
      )}
    </div>
  )
}
