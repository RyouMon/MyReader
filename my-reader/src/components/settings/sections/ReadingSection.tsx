import { isTauri } from "@tauri-apps/api/core"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/tauri-api"
import { useAppUiStore } from "@/stores/appUiStore"

type CacheUsageDto = {
  totalBytes: number
  maxBytes: number
}

/**
 * 把字节值格式化为 MB，统一缓存显示单位。
 */
function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 阅读设置分区，聚焦缓存容量配置与缓存清理。
 */
export default function ReadingSection() {
  const { t } = useTranslation()
  const cache = useAppUiStore((s) => s.cache)
  const patchCacheSettings = useAppUiStore((s) => s.patchCacheSettings)
  const [usage, setUsage] = useState<CacheUsageDto | null>(null)
  const [inputValue, setInputValue] = useState(String(cache.maxCacheSizeMB))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setInputValue(String(cache.maxCacheSizeMB))
  }, [cache.maxCacheSizeMB])

  useEffect(() => {
    if (!isTauri()) return
    void api
      .getCacheUsage()
      .then((row) => setUsage(row))
      .catch(() => setUsage(null))
  }, [])

  const usageText = useMemo(() => {
    if (!usage) return t("settings.reading.cacheUsageEmpty")
    return t("settings.reading.cacheUsage", {
      used: formatMB(usage.totalBytes),
      total: formatMB(usage.maxBytes),
    })
  }, [usage, t])

  async function handleSaveLimit() {
    const parsed = Number(inputValue)
    if (!Number.isFinite(parsed) || parsed < 0) return
    patchCacheSettings({ maxCacheSizeMB: Math.floor(parsed) })
    if (!isTauri()) return
    await api.enforceCacheLimit()
    const row = await api.getCacheUsage()
    setUsage(row)
  }

  async function handleClearAllCache() {
    if (!isTauri()) return
    setLoading(true)
    try {
      await api.clearCache()
      const row = await api.getCacheUsage()
      setUsage(row)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-7 py-5 pb-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold">{t("settings.reading.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("settings.reading.description")}
        </p>
      </div>
      <div className="flex-1 px-7 py-5">
        <div className="max-w-xl rounded-[var(--radius)] border border-border bg-card p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">
            {t("settings.reading.cacheManagement")}
          </p>
          <p className="text-sm text-muted-foreground">{usageText}</p>
          <div className="flex items-center gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              inputMode="numeric"
              className="w-48"
            />
            <span className="text-sm text-muted-foreground">{t("settings.reading.mb")}</span>
            <Button size="sm" onClick={handleSaveLimit}>
              {t("settings.reading.saveLimit")}
            </Button>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleClearAllCache}
            disabled={loading}
          >
            {loading ? t("settings.reading.clearing") : t("settings.reading.clearAllCache")}
          </Button>
        </div>
      </div>
    </div>
  )
}
