import { errorMessageKey } from "@my-reader/i18n/desktop"
import { errorMessage } from "@/lib/error-presentation"
import type {
  DataSource,
  DataSourceWebdav,
} from "@my-reader/tools/types/data-source"
import { useForm } from "@tanstack/react-form"
import { isTauri } from "@tauri-apps/api/core"
import { Cable, Loader2 } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { StatusNotice } from "@/components/common/StatusNotice"
import { SaveButton } from "@/components/common/SaveButton"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { FormTextField } from "@/components/common/FormTextField"
import { FormScrollArea } from "@/components/common/FormScrollArea"
import {
  type CreateDataSourceInput,
  useDataSourceMutations,
} from "@/hooks/queries/useDataSourcesQuery"
import { cn } from "@/lib/utils"
import { OnedriveDataSourceForm } from "./OnedriveDataSourceForm"

export type CreatableDataSourceType = "webdav" | "onedrive"

interface AddDataSourceFormProps {
  type: CreatableDataSourceType
  onCreateDataSource: (input: CreateDataSourceInput) => Promise<DataSource>
  onCreated?: (dataSource: DataSource) => void
  fillAvailableHeight?: boolean
  autoStartOnedriveAuth?: boolean
}

export function AddDataSourceForm({
  type,
  onCreateDataSource,
  onCreated,
  fillAvailableHeight = false,
  autoStartOnedriveAuth = false,
}: AddDataSourceFormProps) {
  const { t } = useTranslation()
  const { testConnection } = useDataSourceMutations()
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
      const dataSource = await onCreateDataSource(input)
      onCreated?.(dataSource)
    } catch (error) {
      setSubmitError(errorMessage(error))
      throw error
    } finally {
      setSubmitting(false)
    }
  }

  const webdavFeedback =
    submitError || (testFeedback && type === "webdav") ? (
      <div className="flex flex-col gap-3">
        {submitError ? (
          <StatusNotice tone="error">{submitError}</StatusNotice>
        ) : null}
        {testFeedback && type === "webdav" ? (
          <StatusNotice
            tone={testFeedback.tone === "success" ? "success" : "error"}
          >
            {testFeedback.message}
          </StatusNotice>
        ) : null}
      </div>
    ) : null

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        fillAvailableHeight && "h-full min-h-0",
      )}
    >
      {type === "webdav" ? (
        <WebdavDataSourceForm
          loading={submitting || testing}
          submitting={submitting}
          testing={testing}
          fillAvailableHeight={fillAvailableHeight}
          feedback={fillAvailableHeight ? webdavFeedback : undefined}
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
              setTestFeedback({
                tone: result.ok ? "success" : "error",
                message: result.ok
                  ? t("addDataSourceForm.testSuccess")
                  : t(errorMessageKey(result.errorKind)),
              })
            } finally {
              setTesting(false)
            }
          }}
        />
      ) : (
        <OnedriveDataSourceForm
          loading={submitting}
          fillAvailableHeight={fillAvailableHeight}
          autoStart={autoStartOnedriveAuth}
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

      {type === "webdav" && !fillAvailableHeight ? webdavFeedback : null}
    </div>
  )
}

interface WebdavDataSourceFormProps {
  loading: boolean
  submitting: boolean
  testing: boolean
  fillAvailableHeight: boolean
  feedback?: ReactNode
  onSubmit: (
    datasource: DataSourceWebdav & { password?: string },
  ) => Promise<unknown>
  onClearMessages: () => void
  onTestConnection: (
    datasource: DataSourceWebdav & { password?: string },
  ) => Promise<void>
}

type WebdavFieldName = "endpoint" | "port" | "username" | "password"

function WebdavDataSourceForm({
  loading,
  submitting,
  testing,
  fillAvailableHeight,
  feedback,
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
              value.length === 0 ||
              (Number(value) >= 1 && Number(value) <= 65535),
            t("addDataSourceForm.validation.portRange"),
          ),
        username: z
          .string()
          .trim()
          .min(1, t("addDataSourceForm.validation.username")),
        password: z.string().min(1, t("addDataSourceForm.validation.password")),
      }),
    [t],
  )

  function buildWebdavName(endpoint: string, port: string): string {
    const parsed = new URL(endpoint.trim())
    const resolvedPort =
      port.trim() ||
      parsed.port ||
      (parsed.protocol === "https:" ? "443" : "80")
    return `${parsed.protocol}//${parsed.hostname}:${resolvedPort}${parsed.pathname}`
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
    return {
      id: "",
      type: "webdav",
      name: buildWebdavName(value.endpoint, value.port),
      enabled: true,
      endpoint,
      username: value.username.trim(),
      password: value.password,
      hasPassword: value.password.length > 0,
      rootPath: null,
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
          fieldName !== "password"
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
      className={cn(fillAvailableHeight && "flex h-full min-h-0 flex-col")}
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void webdavForm.handleSubmit()
      }}
    >
      <FormScrollArea
        data-slot="webdav-form-content"
        className={cn(fillAvailableHeight && "flex-1")}
      >
        <FieldGroup className="gap-4">
          <webdavForm.Field name="endpoint">
            {(field) => {
              const isInvalid =
                (field.state.meta.isTouched && !field.state.meta.isValid) ||
                Boolean(testValidationErrors.endpoint)
              return (
                <FormTextField
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
                  label={t("addDataSourceForm.endpointLabel")}
                  error={isInvalid}
                  helperText={
                    isInvalid
                      ? (
                          mergeFieldErrors(
                            testValidationErrors.endpoint,
                            field.state.meta.errors,
                          ) ?? []
                        )
                          .map((error) => error?.message)
                          .filter(Boolean)
                          .join(" ")
                      : undefined
                  }
                />
              )
            }}
          </webdavForm.Field>
          <webdavForm.Field name="port">
            {(field) => {
              const isInvalid =
                (field.state.meta.isTouched && !field.state.meta.isValid) ||
                Boolean(testValidationErrors.port)
              return (
                <FormTextField
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
                  disabled={loading}
                  label={t("addDataSourceForm.portLabel")}
                  error={isInvalid}
                  slotProps={{ htmlInput: { inputMode: "numeric" } }}
                  helperText={
                    isInvalid
                      ? (
                          mergeFieldErrors(
                            testValidationErrors.port,
                            field.state.meta.errors,
                          ) ?? []
                        )
                          .map((error) => error?.message)
                          .filter(Boolean)
                          .join(" ")
                      : undefined
                  }
                />
              )
            }}
          </webdavForm.Field>
          <webdavForm.Field name="username">
            {(field) => {
              const isInvalid =
                (field.state.meta.isTouched && !field.state.meta.isValid) ||
                Boolean(testValidationErrors.username)
              return (
                <FormTextField
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
                  label={t("addDataSourceForm.usernameLabel")}
                  error={isInvalid}
                  helperText={
                    isInvalid
                      ? (
                          mergeFieldErrors(
                            testValidationErrors.username,
                            field.state.meta.errors,
                          ) ?? []
                        )
                          .map((error) => error?.message)
                          .filter(Boolean)
                          .join(" ")
                      : undefined
                  }
                />
              )
            }}
          </webdavForm.Field>
          <webdavForm.Field name="password">
            {(field) => {
              const isInvalid =
                (field.state.meta.isTouched && !field.state.meta.isValid) ||
                Boolean(testValidationErrors.password)
              return (
                <FormTextField
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
                  label={t("addDataSourceForm.passwordLabel")}
                  error={isInvalid}
                  helperText={
                    isInvalid
                      ? (
                          mergeFieldErrors(
                            testValidationErrors.password,
                            field.state.meta.errors,
                          ) ?? []
                        )
                          .map((error) => error?.message)
                          .filter(Boolean)
                          .join(" ")
                      : undefined
                  }
                />
              )
            }}
          </webdavForm.Field>
        </FieldGroup>
        {feedback ? <div className="mt-3">{feedback}</div> : null}
      </FormScrollArea>
      <DialogFooter
        className={cn(
          "shrink-0 flex-row items-center justify-between border-t border-border pt-3 sm:justify-between",
          fillAvailableHeight ? "mt-4" : "mt-7",
        )}
      >
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void handleTestConnection()}
          disabled={loading || testing}
        >
          {testing ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Cable data-icon="inline-start" />
          )}
          {testing
            ? t("addDataSourceForm.testing")
            : t("addDataSourceForm.testConnection")}
        </Button>
        <SaveButton disabled={loading} saving={submitting} />
      </DialogFooter>
    </form>
  )
}
