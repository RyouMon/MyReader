import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Cloud, Loader2 } from "lucide-react"

import { api } from "@/lib/tauri-api"
import type { OnedriveAuthResultDto } from "@/lib/tauri-specta"

interface OnedriveDataSourceFormProps {
  onSubmit: (data: {
    name: string
    rootPath?: string | null
    displayName?: string
    email?: string
    refreshToken?: string
  }) => Promise<unknown>
  loading: boolean
}

export function OnedriveDataSourceForm({
  onSubmit,
  loading,
}: OnedriveDataSourceFormProps) {
  const { t } = useTranslation()
  const [authResult, setAuthResult] = useState<OnedriveAuthResultDto | null>(
    null,
  )
  const [authLoading, setAuthLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [error, setError] = useState("")

  const handleAuth = async () => {
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
  }

  const autoCreate = async (result: OnedriveAuthResultDto) => {
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
  }

  const handleRetryCreate = () => {
    if (!authResult) return
    void autoCreate(authResult)
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      {(authLoading || createLoading || loading) && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[13px] text-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>
            {authLoading
              ? t("addDataSourceForm.onedriveAuthenticating")
              : t("addDataSourceForm.onedriveAdding")}
          </span>
        </div>
      )}

      {!authResult && !authLoading && !createLoading && !loading && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void handleAuth()}
            disabled={authLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
          >
            <Cloud className="size-4" />
            {t("addDataSourceForm.signInWithMicrosoft")}
          </button>
        </div>
      )}

      {authResult && !createLoading && !loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2">
            <Cloud className="size-4 text-green-600" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">
                {authResult.userName}
              </p>
              {authResult.userEmail && (
                <p className="text-[11.5px] text-muted-foreground truncate">
                  {authResult.userEmail}
                </p>
              )}
            </div>
          </div>

          {error ? (
            <button
              type="button"
              onClick={handleRetryCreate}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
            >
              {t("addDataSourceForm.retryAdd")}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setAuthResult(null)
              setError("")
            }}
            className="text-[12px] text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {t("common.change")}
          </button>
        </div>
      )}

      {error && <p className="text-[12px] text-red-500">{error}</p>}
    </form>
  )
}
