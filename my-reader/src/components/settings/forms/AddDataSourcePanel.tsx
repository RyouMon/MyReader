import { useForm } from "@tanstack/react-form"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { Loader2, PlusCircle } from "lucide-react"
import { useState } from "react"
import { z } from "zod"

import { AddPanelButton } from "@/components/common/AddPanelButton"
import { StatusNotice } from "@/components/common/StatusNotice"
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
import { cn } from "@/lib/utils"
import type { NewWebdavDataSourceInput } from "@/types/dataSource"

const addWebdavSchema = z.object({
  kind: z.literal("webdav"),
  endpoint: z.string().trim().url("请输入合法的 WebDAV 地址"),
  port: z
    .string()
    .trim()
    .regex(/^\d*$/, "端口必须为数字")
    .refine(
      (value) =>
        value.length === 0 || (Number(value) >= 1 && Number(value) <= 65535),
      "端口范围应为 1-65535",
    ),
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码或应用专用密码"),
  rootPath: z.string().trim(),
})

interface AddDataSourcePanelProps {
  onAddWebdav: (input: NewWebdavDataSourceInput) => Promise<unknown>
}

/**
 * 统一“添加数据源”入口按钮与表单面板，避免设置分区内的新增逻辑分散。
 */
export function AddDataSourcePanel({ onAddWebdav }: AddDataSourcePanelProps) {
  const [addPanelOpen, setAddPanelOpen] = useState(false)
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

  async function handleSubmitWebdav(input: NewWebdavDataSourceInput) {
    setSubmitting(true)
    clearMessages()
    try {
      await onAddWebdav(input)
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
        label="添加数据源"
        onClick={() => {
          setAddPanelOpen((open) => !open)
          clearMessages()
        }}
      />

      {addPanelOpen && (
        <div className="border-t border-border bg-card px-4 py-4 animate-in slide-in-from-top-1 fade-in-0 duration-200">
          <WebdavDataSourceForm
            loading={submitting || testing}
            testing={testing}
            onSubmit={handleSubmitWebdav}
            onClearMessages={clearMessages}
            onTestConnection={async (input) => {
              clearMessages()
              if (!isTauri()) {
                setTestFeedback({
                  tone: "error",
                  message: "仅桌面端支持测试连接",
                })
                return
              }
              setTesting(true)
              try {
                await invoke("test_webdav_connection", { input })
                setTestFeedback({
                  tone: "success",
                  message: "连接成功，可正常访问 WebDAV。",
                })
              } catch (error) {
                setTestFeedback({
                  tone: "error",
                  message: String(error),
                })
              } finally {
                setTesting(false)
              }
            }}
          />
          {submitError && (
            <StatusNotice tone="error" className="mt-3">
              {submitError}
            </StatusNotice>
          )}
          {testFeedback && (
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
  onSubmit: (input: NewWebdavDataSourceInput) => Promise<unknown>
  onClearMessages: () => void
  onTestConnection: (input: {
    endpoint: string
    username: string
    password: string
    rootPath?: string
  }) => Promise<void>
}

type WebdavFieldName = "endpoint" | "port" | "username" | "password" | "rootPath"

/**
 * WebDAV 输入表单，保留常见最小连接参数，便于后续接入校验与探活。
 */
function WebdavDataSourceForm({
  loading,
  testing,
  onSubmit,
  onClearMessages,
  onTestConnection,
}: WebdavDataSourceFormProps) {
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
      kind: "webdav" as const,
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
      await onSubmit({
        name: buildWebdavName(value.endpoint, value.port, value.rootPath),
        endpoint: mergeEndpointWithPort(value.endpoint, value.port),
        username: value.username.trim(),
        password: value.password,
        rootPath: value.rootPath.trim(),
      })
      clearTestValidationErrors()
      webdavForm.reset()
    },
  })

  function buildTestPayload(
    value: z.infer<typeof addWebdavSchema>,
  ): {
    endpoint: string
    username: string
    password: string
    rootPath?: string
  } {
    const trimmedRootPath = value.rootPath.trim()
    return {
      endpoint: mergeEndpointWithPort(value.endpoint, value.port),
      username: value.username.trim(),
      password: value.password,
      ...(trimmedRootPath ? { rootPath: trimmedRootPath } : {}),
    }
  }

  /**
   * 点击测试连接时先执行 schema 校验，校验通过后再发起真实 WebDAV 探活。
   */
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
        <webdavForm.Field name="kind">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>数据源类型</FieldLabel>
              <Select
                name={field.name}
                value={field.state.value}
                onValueChange={(value) => {
                  field.handleChange(value as "webdav")
                  clearTestValidationErrors()
                  onClearMessages()
                }}
                disabled={loading}
              >
                <SelectTrigger
                  id={field.name}
                  className="w-full"
                  onBlur={field.handleBlur}
                >
                  <SelectValue placeholder="选择数据源类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="webdav">WebDAV</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </webdavForm.Field>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_136px]">
          <webdavForm.Field name="endpoint">
            {(field) => {
              const isInvalid =
                (field.state.meta.isTouched && !field.state.meta.isValid) ||
                Boolean(testValidationErrors.endpoint)
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>服务器地址</FieldLabel>
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
                    placeholder="https://dav.example.com"
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
                  <FieldLabel htmlFor={field.name}>端口</FieldLabel>
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
                    placeholder="443"
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
                  <FieldLabel htmlFor={field.name}>用户名</FieldLabel>
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
                    placeholder="用户名"
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
                  <FieldLabel htmlFor={field.name}>密码</FieldLabel>
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
                    placeholder="密码"
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
              <FieldLabel htmlFor={field.name}>远程根路径（可选）</FieldLabel>
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
                placeholder="/"
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
            {testing ? "测试中…" : "测试连接"}
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
            添加数据源
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
