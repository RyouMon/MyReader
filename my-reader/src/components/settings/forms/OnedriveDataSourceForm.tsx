import { Cloud, Loader2, LogIn, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { StatusNotice } from "@/components/common/StatusNotice"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { api } from "@/lib/tauri-api"
import type { OnedriveAuthResultDto } from "@/lib/tauri-specta"
import { cn } from "@/lib/utils"

interface OnedriveDataSourceFormProps {
  onSubmit: (data: {
    name: string
    rootPath?: string | null
    displayName?: string
    email?: string
    refreshToken?: string
  }) => Promise<unknown>
  loading: boolean
  fillAvailableHeight?: boolean
  autoStart?: boolean
}

export function OnedriveDataSourceForm({
  onSubmit,
  loading,
  fillAvailableHeight = false,
  autoStart = false,
}: OnedriveDataSourceFormProps) {
  const { t } = useTranslation()
  const [authResult, setAuthResult] = useState<OnedriveAuthResultDto | null>(
    null,
  )
  const [authLoading, setAuthLoading] = useState(autoStart)
  const [createLoading, setCreateLoading] = useState(false)
  const [error, setError] = useState("")
  const autoStartedRef = useRef(false)

  const autoCreate = useCallback(
    async (result: OnedriveAuthResultDto) => {
      setCreateLoading(true)
      setError("")
      try {
        const name = result.userName || result.userEmail || "OneDrive"
        await onSubmit({
          name,
          rootPath: null,
          displayName: result.userName,
          email: result.userEmail ?? undefined,
          refreshToken: result.refreshToken,
        })
      } catch (err) {
        const msg =
          typeof err === "object" && err !== null && "message" in err
            ? String((err as Record<string, unknown>).message)
            : String(err)
        setError(msg)
      } finally {
        setCreateLoading(false)
      }
    },
    [onSubmit],
  )

  const handleAuth = useCallback(async () => {
    setAuthLoading(true)
    setError("")
    try {
      const result = await api.onedriveStartAuth({
        clientId: null,
        tenantId: null,
      })
      setAuthResult(result)
      // Auto-create the data source after successful auth, matching mobile UX.
      await autoCreate(result)
    } catch (err) {
      const msg =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as Record<string, unknown>).message)
          : String(err)
      setError(msg)
    } finally {
      setAuthLoading(false)
    }
  }, [autoCreate])

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return
    autoStartedRef.current = true
    void handleAuth()
  }, [autoStart, handleAuth])

  const handleRetryCreate = () => {
    if (!authResult) return
    void autoCreate(authResult)
  }

  const busy = authLoading || createLoading || loading
  const emptyClassName = cn(
    "rounded-none border-0",
    fillAvailableHeight ? "min-h-0 flex-1 p-6 md:p-8" : "flex-none p-6",
  )

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className={cn("flex flex-col", fillAvailableHeight && "h-full min-h-0")}
    >
      {busy ? (
        <Empty className={emptyClassName} role="status" aria-live="polite">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Loader2 className="animate-spin" />
            </EmptyMedia>
            <EmptyTitle>
              {authLoading
                ? t("addDataSourceForm.onedriveAuthenticating")
                : t("addDataSourceForm.onedriveAdding")}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : !authResult ? (
        <Empty className={emptyClassName}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Cloud />
            </EmptyMedia>
            <EmptyTitle>{t("addDataSourceForm.typeOnedrive")}</EmptyTitle>
          </EmptyHeader>
          {error ? (
            <EmptyContent>
              <StatusNotice tone="error">{error}</StatusNotice>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <Empty className={emptyClassName}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Cloud />
            </EmptyMedia>
            <EmptyTitle>
              {authResult.userName || t("addDataSourceForm.typeOnedrive")}
            </EmptyTitle>
            {authResult.userEmail ? (
              <EmptyDescription>{authResult.userEmail}</EmptyDescription>
            ) : null}
          </EmptyHeader>
          {error ? (
            <EmptyContent>
              <StatusNotice tone="error">{error}</StatusNotice>
            </EmptyContent>
          ) : null}
        </Empty>
      )}

      {!busy ? (
        <DialogFooter className="mt-4 shrink-0 border-t border-border pt-3">
          {authResult ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setAuthResult(null)
                setError("")
              }}
            >
              <LogIn data-icon="inline-start" />
              {t("addDataSourceForm.changeAccount")}
            </Button>
          ) : (
            <Button type="button" onClick={() => void handleAuth()}>
              <Cloud data-icon="inline-start" />
              {t("addDataSourceForm.signInWithMicrosoft")}
            </Button>
          )}
          {authResult && error ? (
            <Button type="button" onClick={handleRetryCreate}>
              <RefreshCw data-icon="inline-start" />
              {t("addDataSourceForm.retryAdd")}
            </Button>
          ) : null}
        </DialogFooter>
      ) : null}
    </form>
  )
}
