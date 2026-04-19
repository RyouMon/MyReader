import { useForm } from "@tanstack/react-form"
import { open } from "@tauri-apps/plugin-dialog"
import { FolderSearch, Loader2, PlusCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { z } from "zod"

import { AddPanelButton } from "@/components/common/AddPanelButton"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  LOCAL_LIBRARY_DATA_SOURCE_ID,
  LOCAL_LIBRARY_DATA_SOURCE_NAME,
} from "@/constants/local-library-data-source"
import { useDataSourceStore } from "@/stores/dataSourceStore"
import type { DataSource } from "my-reader-tools/store/data-source"

const addLibrarySchema = z.object({
  dataSourceId: z.string().trim().min(1, "请先选择数据源"),
  path: z.string().trim().min(1, "请输入书库路径"),
})

interface AddLibraryPanelProps {
  onAddLibrary: (path: string) => Promise<unknown>
}

/**
 * 统一“添加书库”入口按钮与表单面板，便于在设置页复用与维护。
 */
export function AddLibraryPanel({ onAddLibrary }: AddLibraryPanelProps) {
  const dataSources = useDataSourceStore((s) => s.dataSources)
  const hydrated = useDataSourceStore((s) => s.hydrated)
  const loadingDataSources = useDataSourceStore((s) => s.loading)
  const hydrateFromBackend = useDataSourceStore((s) => s.hydrateFromBackend)

  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const pathInputRef = useRef<HTMLInputElement>(null)
  const availableWebdavSources = dataSources.filter((row) => row.enabled)

  useEffect(() => {
    if (hydrated) return
    void hydrateFromBackend()
  }, [hydrateFromBackend, hydrated])

  const addLibraryForm = useForm({
    defaultValues: {
      dataSourceId: LOCAL_LIBRARY_DATA_SOURCE_ID,
      path: "",
    },
    validators: {
      onSubmit: addLibrarySchema,
    },
    onSubmit: async ({ value }) => {
      setAdding(true)
      setSubmitError(null)
      try {
        await onAddLibrary(value.path.trim())
        handleClosePanel()
      } catch (error) {
        setSubmitError(String(error))
      } finally {
        setAdding(false)
      }
    },
  })

  function handleOpenPanel() {
    setAddPanelOpen(true)
    setSubmitError(null)
    addLibraryForm.setFieldValue("dataSourceId", LOCAL_LIBRARY_DATA_SOURCE_ID)
    setTimeout(() => pathInputRef.current?.focus(), 50)
  }

  function handleClosePanel() {
    setAddPanelOpen(false)
    setSubmitError(null)
    addLibraryForm.reset()
  }

  function resolveSelectedWebdavSource(
    id: string,
    rows: DataSource[],
  ): DataSource | undefined {
    return rows.find((row) => row.id === id)
  }

  async function openLocalDirectoryPicker() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择 Calibre 书库目录",
      })
      if (!selected) return
      const path = selected as string
      addLibraryForm.setFieldValue("path", path)
      setSubmitError(null)
      pathInputRef.current?.focus()
    } catch (error) {
      console.error("Failed to open directory picker for library path. error:", error)
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius)] transition-colors",
        addPanelOpen ? "border border-primary" : "border border-dashed border-border",
      )}
    >
      <AddPanelButton
        label="添加书库"
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
              <addLibraryForm.Field name="dataSourceId">
                {(field) => {
                  const isLocalPick = field.state.value === LOCAL_LIBRARY_DATA_SOURCE_ID
                  const selectedWebdav = resolveSelectedWebdavSource(
                    field.state.value,
                    availableWebdavSources,
                  )
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  const browseDisabled =
                    adding || loadingDataSources || !isLocalPick
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>数据源</FieldLabel>
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
                          <SelectValue placeholder="选择已配置数据源" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value={LOCAL_LIBRARY_DATA_SOURCE_ID}>
                              {LOCAL_LIBRARY_DATA_SOURCE_NAME}
                            </SelectItem>
                            {availableWebdavSources.map((source) => (
                              <SelectItem key={source.id} value={source.id}>
                                {source.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {selectedWebdav && (
                        <p className="text-xs text-muted-foreground">
                          当前选中 WebDAV，暂不支持目录浏览。
                        </p>
                      )}
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      <addLibraryForm.Field name="path">
                        {(pathField) => {
                          const isPathInvalid =
                            pathField.state.meta.isTouched &&
                            !pathField.state.meta.isValid
                          return (
                            <Field data-invalid={isPathInvalid}>
                              <FieldLabel htmlFor={pathField.name}>书库路径</FieldLabel>
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
                                  placeholder="输入 Calibre 书库路径，例如 D:\CalibreLibrary"
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
                                  disabled={browseDisabled}
                                >
                                  <FolderSearch className="size-[13px]" />
                                  浏览
                                </Button>
                              </div>
                              {isPathInvalid && (
                                <FieldError errors={pathField.state.meta.errors} />
                              )}
                            </Field>
                          )
                        }}
                      </addLibraryForm.Field>
                    </Field>
                  )
                }}
              </addLibraryForm.Field>
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
                  取消
                </Button>
                <Button type="submit" size="sm" className="gap-1.5" disabled={adding}>
                  {adding ? (
                    <Loader2 className="size-[13px] animate-spin" />
                  ) : (
                    <PlusCircle className="size-[13px]" />
                  )}
                  {adding ? "添加中…" : "确认添加"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </div>
      )}
    </div>
  )
}
