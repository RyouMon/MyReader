import { useForm } from "@tanstack/react-form"
import { isTauri } from "@tauri-apps/api/core"
import { Loader2, PlusCircle } from "lucide-react"
import type { DataSourceWebdav } from "@my-reader/tools/types/data-source"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { AddPanelButton } from "@/components/common/AddPanelButton"
import { StatusNotice } from "@/components/common/StatusNotice"
import { DataSourceTypeSelector, type DataSourceType } from "@/components/settings/DataSourceTypeSelector"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  type CreateDataSourceInput,
  useDataSourceMutations,
} from "@/hooks/queries/useDataSourcesQuery"
import { OnedriveDataSourceForm } from "./OnedriveDataSourceForm"

interface AddDataSourcePanelProps {
  onCreateDataSource: (input: CreateDataSourceInput) => Promise<unknown>
}

export function AddDataSourcePanel({
  onCreateDataSource,
}: AddDataSourcePanelProps) {
  const { t } = useTranslation()
  const { testConnection } = useDataSourceMutations()
  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<DataSourceType>("webdav")
  const [submitting, setSubmitting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [testFeedback, setTestFeedback] = useState<{
    tone: "success" | "error"
    message: string
  } | null>(null)

  function clearMessages() {
    setSubmitError(null)
    setTestFeedback(null)
  }

  async function handleSubmit(input: CreateDataSourceInput) {
    setSubmitting(true)
    clearMessages()
    try {
      await onCreateDataSource(input)
      setAddPanelOpen(false)
    } catch (error) {
      setSubmitError(String(error))
      throw error
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius)] transition-colors",
        addPanelOpen
          ? "border border-primary"
          : "border border-dashed border-border",
      )}
    >
      <AddPanelButton
        label={t("addDataSourceForm.label")}
        onClick={() => {
          setAddPanelOpen((open) => !open)
          clearMessages()
        }}
      />

      {addPanelOpen && (
        <div className="border-t border-border bg-card px-4 py-4 animate-in slide-in-from-top-1 fade-in-0 duration-200">
          <DataSourceTypeSelector
            value={selectedType}
            onChange={setSelectedType}
            disabled={submitting || testing}
          />

          <div className="mt-4">
            {selectedType === "webdav" && (
              <WebdavDataSourceForm
                loading={submitting || testing}
                testing={testing}
                onSubmit={handleSubmit}
                onClearMessages={clearMessages}
                onTestConnection={async (datasource) => {
                  clearMessages()
                  if (!isTauri()) {
                    setTestFeedback({
                      tone: "error",
                      message: t("addDataSourceForm.testDesktopOnly"),
                    })
                    return
                  }
                  setTesting(true)
                  try {
                    const result = await testConnection(datasource)
                    if (result.ok) {
                      setTestFeedback({
                        tone: "success",
                        message: t("addDataSourceForm.testSuccess"),
                      })
                    } else {
                      setTestFeedback({
                        tone: "error",
                        message: result.message,
                      })
                    }
                  } finally {
                    setTesting(false)
                  }
                }}
              />
            )}
            {selectedType === "onedrive" && (
              <OnedriveDataSourceForm
                loading={submitting}
                onSubmit={async (data) => {
                  await handleSubmit({
                    type: "onedrive",
                    id: "",
                    name: data.name,
                    enabled: true,
                    clientId: "",
                    tenantId: "consumers",
                    rootPath: data.rootPath ?? null,
                    hasRefreshToken: true,
                    displayName: data.displayName ?? null,
                    email: data.email ?? null,
                    refreshToken: data.refreshToken,
                  })
                }}
              />
            )}
          </div>

          {submitError && (
            <StatusNotice tone="error" className="mt-3">
              {submitError}
            </StatusNotice>
          )}
          {testFeedback && selectedType === "webdav" && (
            <StatusNotice
              tone={testFeedback.tone === "success" ? "success" : "error"}
              className="mt-3"
            >
              {testFeedback.message}
            </StatusNotice>
          )}
        </div>
      )}
    </div>
  )
}

interface WebdavDataSourceFormProps {
  loading: boolean
  testing: boolean
  onSubmit: (datasource: DataSourceWebdav & { password?: string }) => Promise<unknown>
  onClearMessages: () => void
  onTestConnection: (datasource: DataSourceWebdav & { password?: string }) => Promise<void>
}

type WebdavFieldName =
  | "endpoint"
  | "port"
  | "username"
  | "password"
  | "rootPath"

function WebdavDataSourceForm({
  loading,
  testing,
  onSubmit,
  onClearMessages,
  onTestConnection,
}: WebdavDataSourceFormProps) {
  const { t } = useTranslation()

  const addWebdavSchema = useMemo(
    () =>
      z.object({
        type: z.literal("webdav"),
        endpoint: z.string().trim().url(t("addDataSourceForm.validation.url")),
        port: z
          .string()
          .trim()
          .regex(/^\d*$/, t("addDataSourceForm.validation.portNumber"))
          .refine(
            (value) =>
              value.length === 0 || (Number(value) >= 1 && Number(value) <= 65535),
            t("addDataSourceForm.validation.portRange"),
          ),
        username: z.string().trim().min(1, t("addDataSourceForm.validation.username")),
        password: z.string().min(1, t("addDataSourceForm.validation.password")),
        rootPath: z.string().trim(),
      }),
    [t],
  )

  function normalizeRootPath(path: string): string {
    const trimmed = path.trim()
    if (!trimmed) return "/"
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  }

  function buildWebdavName(
    endpoint: string,
    port: string,
    rootPath: string,
  ): string {
    const parsed = new URL(endpoint.trim())
    const resolvedPort =
      port.trim() ||
      parsed.port ||
      (parsed.protocol === "https:" ? "443" : "80")
    return `${parsed.protocol}//${parsed.hostname}:${resolvedPort}${normalizeRootPath(rootPath)}`
  }

  function mergeEndpointWithPort(endpoint: string, port: string): string {
    if (!port.trim()) return endpoint.trim()
    const parsed = new URL(endpoint.trim())
    parsed.port = port.trim()
    return parsed.toString()
  }

  const [testValidationErrors, setTestValidationErrors] = useState<
    Partial<Record<WebdavFieldName, string>>
  >({})

  function clearTestValidationErrors() {
    setTestValidationErrors({})
  }

  function mergeFieldErrors(
    schemaError: string | undefined,
    formErrors?: Array<{ message?: string } | undefined>,
  ) {
    if (!schemaError) return formErrors
    return [...(formErrors ?? []), { message: schemaError }]
  }

  const webdavForm = useForm({
    defaultValues: {
      type: "webdav" as const,
      endpoint: "",
      port: "",
      username: "",
      password: "",
      rootPath: "",
    },
    validators: {
      onSubmit: addWebdavSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(buildWebdavDataSourceFromForm(value))
      clearTestValidationErrors()
      webdavForm.reset()
    },
  })

  function buildWebdavDataSourceFromForm(
    value: z.infer<typeof addWebdavSchema>,
  ): DataSourceWebdav & { password?: string } {
    const endpoint = mergeEndpointWithPort(value.endpoint, value.port)
    const trimmedRoot = value.rootPath.trim()
    return {
      id: "",
      type: "webdav",
      name: buildWebdavName(value.endpoint, value.port, value.rootPath),
      enabled: true,
      endpoint,
      username: value.username.trim(),
      password: value.password,
      hasPassword: value.password.length > 0,
      rootPath: trimmedRoot ? trimmedRoot : null,
    }
  }

  function buildTestPayload(
    value: z.infer<typeof addWebdavSchema>,
  ): DataSourceWebdav & { password?: string } {
    return buildWebdavDataSourceFromForm(value)
  }

  async function handleTestConnection() {
    const parsed = addWebdavSchema.safeParse(webdavForm.state.values)
    if (!parsed.success) {
      const nextErrors: Partial<Record<WebdavFieldName, string>> = {}
      for (const issue of parsed.error.issues) {
        const fieldName = issue.path[0]
        if (
          fieldName !== "endpoint" &&
          fieldName !== "port" &&
          fieldName !== "username" &&
          fieldName !== "password" &&
          fieldName !== "rootPath"
        ) {
          continue
        }
        webdavForm.setFieldMeta(fieldName, (prev) => ({
          ...prev,
          isTouched: true,
        }))
        if (!nextErrors[fieldName]) {
          nextErrors[fieldName] = issue.message
        }
      }
      setTestValidationErrors(nextErrors)
      onClearMessages()
      return
    }
    clearTestValidationErrors()
    await onTestConnection(buildTestPayload(parsed.data))
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void webdavForm.handleSubmit()
      }}
    >
      <FieldGroup>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_136px]">
          <webdavForm.Field name="endpoint">
            {(field) => {
              const isInvalid =
                (field.state.meta.isTouched && !field.state.meta.isValid) ||
                Boolean(testValidationErrors.endpoint)
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>{t("addDataSourceForm.endpointLabel")}</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value)
                      clearTestValidationErrors()
                      onClearMessages()
                    }}
                    placeholder={t("addDataSourceForm.endpointPlaceholder")}
                    disabled={loading}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && (
                    <FieldError
                      errors={mergeFieldErrors(
                        testValidationErrors.endpoint,
                        field.state.meta.errors,
                      )}
                    />
                  )}
                </Field>
              )
            }}
          </webdavForm.Field>
          <webdavForm.Field name="port">
            {(field) => {
              const isInvalid =
                (field.state.meta.isTouched && !field.state.meta.isValid) ||
                Boolean(testValidationErrors.port)
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>{t("addDataSourceForm.portLabel")}</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value)
                      clearTestValidationErrors()
                      onClearMessages()
                    }}
                    placeholder={t("addDataSourceForm.portPlaceholder")}
                    inputMode="numeric"
                    disabled={loading}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && (
                    <FieldError
                      errors={mergeFieldErrors(
                        testValidationErrors.port,
                        field.state.meta.errors,
                      )}
                    />
                  )}
                </Field>
              )
            }}
          </webdavForm.Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <webdavForm.Field name="username">
            {(field) => {
              const isInvalid =
                (field.state.meta.isTouched && !field.state.meta.isValid) ||
                Boolean(testValidationErrors.username)
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>{t("addDataSourceForm.usernameLabel")}</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value)
                      clearTestValidationErrors()
                      onClearMessages()
                    }}
                    placeholder={t("addDataSourceForm.usernamePlaceholder")}
                    disabled={loading}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && (
                    <FieldError
                      errors={mergeFieldErrors(
                        testValidationErrors.username,
                        field.state.meta.errors,
                      )}
                    />
                  )}
                </Field>
              )
            }}
          </webdavForm.Field>
          <webdavForm.Field name="password">
            {(field) => {
              const isInvalid =
                (field.state.meta.isTouched && !field.state.meta.isValid) ||
                Boolean(testValidationErrors.password)
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>{t("addDataSourceForm.passwordLabel")}</FieldLabel>
                  <Input
                    type="password"
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value)
                      clearTestValidationErrors()
                      onClearMessages()
                    }}
                    placeholder={t("addDataSourceForm.passwordPlaceholder")}
                    disabled={loading}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && (
                    <FieldError
                      errors={mergeFieldErrors(
                        testValidationErrors.password,
                        field.state.meta.errors,
                      )}
                    />
                  )}
                </Field>
              )
            }}
          </webdavForm.Field>
        </div>
        <webdavForm.Field name="rootPath">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{t("addDataSourceForm.rootPathLabel")}</FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  clearTestValidationErrors()
                  onClearMessages()
                }}
                placeholder={t("addDataSourceForm.rootPathPlaceholder")}
                disabled={loading}
              />
            </Field>
          )}
        </webdavForm.Field>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleTestConnection()}
            disabled={loading || testing}
          >
            {testing ? t("addDataSourceForm.testing") : t("addDataSourceForm.testConnection")}
          </Button>
          <Button
            size="sm"
            type="submit"
            className="gap-1.5"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-[13px] animate-spin" />
            ) : (
              <PlusCircle className="size-[13px]" />
            )}
            {t("addDataSourceForm.label")}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
