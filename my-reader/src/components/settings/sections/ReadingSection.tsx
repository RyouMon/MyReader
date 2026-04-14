import { invoke, isTauri } from "@tauri-apps/api/core"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAppUiStore } from "@/stores/appUiStore"

type CacheUsageDto = {
  totalBytes: number
  maxBytes: number
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function ReadingSection() {
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
    void invoke<CacheUsageDto>("get_cache_usage")
      .then((row) => setUsage(row))
      .catch(() => setUsage(null))
  }, [])

  const usageText = useMemo(() => {
    if (!usage) return "缓存占用：--"
    return `缓存占用：${formatMB(usage.totalBytes)} / ${formatMB(usage.maxBytes)}`
  }, [usage])

  async function handleSaveLimit() {
    const parsed = Number(inputValue)
    if (!Number.isFinite(parsed) || parsed < 0) return
    patchCacheSettings({ maxCacheSizeMB: Math.floor(parsed) })
    if (!isTauri()) return
    await invoke("enforce_cache_limit")
    const row = await invoke<CacheUsageDto>("get_cache_usage")
    setUsage(row)
  }

  async function handleClearAllCache() {
    if (!isTauri()) return
    setLoading(true)
    try {
      await invoke("clear_cache")
      const row = await invoke<CacheUsageDto>("get_cache_usage")
      setUsage(row)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-7 py-5 pb-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold">阅读与缓存</h1>
        <p className="text-sm text-muted-foreground mt-1">
          设置阅读缓存最大容量，并支持一键全部清理
        </p>
      </div>
      <div className="flex-1 px-7 py-5">
        <div className="max-w-xl rounded-[var(--radius)] border border-border bg-card p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">
            缓存管理
          </p>
          <p className="text-sm text-muted-foreground">{usageText}</p>
          <div className="flex items-center gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              inputMode="numeric"
              className="w-48"
            />
            <span className="text-sm text-muted-foreground">MB</span>
            <Button size="sm" onClick={handleSaveLimit}>
              保存容量上限
            </Button>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleClearAllCache}
            disabled={loading}
          >
            {loading ? "清理中…" : "全部清理缓存"}
          </Button>
        </div>
      </div>
    </div>
  )
}
