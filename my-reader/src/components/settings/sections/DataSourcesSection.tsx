import { AppRow } from "@/components/common/AppRow"
import {
  GroupList,
  GroupListItem
} from "@/components/common/GroupList"
import { AddDataSourcePanel } from "@/components/settings/forms/AddDataSourcePanel"
import {
  LOCAL_LIBRARY_DATA_SOURCE_NAME,
} from "@/constants/local-library-data-source"
import { cn } from "@/lib/utils"
import { useDataSourceStore } from "@/stores/dataSourceStore"
import { Trash2, Unplug } from "lucide-react"
import type { DataSource } from "my-reader-tools/store/data-source"
import { useEffect, useMemo, useState } from "react"

/**
 * 在设置页提供数据源增删管理，帮助后续同步层复用统一连接配置。
 */
export default function DataSourcesSection() {
  const dataSources = useDataSourceStore((s) => s.dataSources)
  const loading = useDataSourceStore((s) => s.loading)
  const hydrated = useDataSourceStore((s) => s.hydrated)
  const hydrateFromBackend = useDataSourceStore((s) => s.hydrateFromBackend)
  const createDataSource = useDataSourceStore((s) => s.createDataSource)
  const deleteDataSource = useDataSourceStore((s) => s.deleteDataSource)

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    if (hydrated) return
    void hydrateFromBackend()
  }, [hydrateFromBackend, hydrated])

  async function handleDelete(id: string) {
    const target = dataSources.find((item) => item.id === id)
    if (target?.readonly) return

    if (pendingDeleteId === id) {
      setPendingDeleteId(null)
      setRemovingId(id)
      try {
        await deleteDataSource(id)
      } finally {
        setRemovingId(null)
      }
      return
    }

    setPendingDeleteId(id)
  }

  const listHint = useMemo(() => {
    if (loading) return "数据源加载中…"
    return `${dataSources.length+1} 个已添加连接`
  }, [dataSources.length, loading])

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-7 py-5 pb-4">
        <h1 className="text-xl font-semibold">数据源管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理桌面端可访问的数据来源，当前支持本地存储与 WebDAV
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-5">
        <section className="mb-5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
              已配置数据源
            </p>
            <p className="text-xs text-muted-foreground">{listHint}</p>
          </div>

          <GroupList>
            <LocalStorageStaticRow />
            {dataSources.length === 0 && !loading ? null : (
              dataSources.map((source) => (
                <DataSourceCard
                  key={source.id}
                  source={source}
                  isPendingDelete={pendingDeleteId === source.id}
                  isRemoving={removingId === source.id}
                  onDelete={handleDelete}
                />
              ))
            )}
          </GroupList>
        </section>

        <AddDataSourcePanel onCreateDataSource={createDataSource} />
      </div>
    </div>
  )
}

function LocalStorageStaticRow() {
  return (
    <GroupListItem className="bg-card transition-[opacity,transform,background-color] hover:bg-muted/40">
      <AppRow
        icon="hardDrive"
        body={LOCAL_LIBRARY_DATA_SOURCE_NAME}
        detail="当前设备本地文件系统"
        detailClassName="font-mono"
        tail={
          <div className="flex items-center gap-2">
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
              本机
            </span>
            <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              内置
            </span>
          </div>
        }
        actions={
          <div className="flex size-[30px] items-center justify-center rounded-[7px] text-muted-foreground">
            <Unplug className="size-3.5" />
          </div>
        }
      />
    </GroupListItem>
  )
}

interface DataSourceCardProps {
  source: DataSource
  isPendingDelete: boolean
  isRemoving: boolean
  onDelete: (id: string) => Promise<void>
}

/**
 * 用统一卡片承载不同类型数据源，保持列表扫描效率。
 */
function DataSourceCard({
  source,
  isPendingDelete,
  isRemoving,
  onDelete,
}: DataSourceCardProps) {
  const rowIcon = "database"
  const secondaryText = `${source.endpoint} · ${source.username}`

  return (
    <GroupListItem
      className={cn(
        "bg-card transition-[opacity,transform,background-color]",
        "hover:bg-muted/40",
        isRemoving && "pointer-events-none translate-x-2 opacity-0",
      )}
    >
      <AppRow
        icon={rowIcon}
        body={source.name}
        detail={secondaryText}
        detailClassName="font-mono"
        tail={
          <div className="flex items-center gap-2">
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
              webdav
            </span>
            {source.readonly && (
              <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                内置
              </span>
            )}
            {isPendingDelete && !source.readonly ? (
              <span className="hidden text-[11px] text-destructive md:inline">
                再次点击确认
              </span>
            ) : null}
          </div>
        }
        actions={
          source.readonly ? (
            <div className="flex size-[30px] items-center justify-center rounded-[7px] text-muted-foreground">
              <Unplug className="size-3.5" />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void onDelete(source.id)}
              className={cn(
                "flex size-[30px] items-center justify-center rounded-[7px] border transition-colors",
                isPendingDelete
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-transparent text-muted-foreground hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive",
              )}
              title="删除数据源"
            >
              <Trash2 className="size-3.5" />
            </button>
          )
        }
      />
    </GroupListItem>
  )
}
