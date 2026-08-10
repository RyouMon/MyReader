import {
  BookCopy,
  Cloud,
  Database,
  Folder,
  HardDrive,
  type LucideIcon,
  Tag,
  User,
} from "lucide-react"
import type { ElementType, ReactNode } from "react"

import { cn } from "@/lib/utils"

const ROW_ICONS = {
  folder: Folder,
  hardDrive: HardDrive,
  database: Database,
  tag: Tag,
  series: BookCopy,
  author: User,
  cloud: Cloud,
} as const

export type AppRowIconName = keyof typeof ROW_ICONS

interface AppRowProps {
  /** 根元素，默认 `div`。 */
  as?: ElementType
  /** 行首图标，仅允许传入预置名称，保证各行列头样式一致。 */
  icon?: AppRowIconName
  /** 自定义行首内容，用于需要专属图形的实体类型。 */
  head?: ReactNode
  /** 主标题，纯文本。 */
  body: string
  /** 副行说明，纯文本；不传则不渲染详情区。 */
  detail?: string
  /** 副行说明前的图形。 */
  detailPrefix?: ReactNode
  tail?: ReactNode
  actions?: ReactNode
  className?: string
  headClassName?: string
  bodyClassName?: string
  detailClassName?: string
  tailClassName?: string
  actionsClassName?: string
}

/**
 * 统一的行容器：图标名（头）+ 正文 + 详情（均为纯文本）+ 可选尾区与动作区。
 */
export function AppRow({
  as,
  icon,
  head,
  body,
  detail,
  detailPrefix,
  tail,
  actions,
  className,
  headClassName,
  bodyClassName,
  detailClassName,
  tailClassName,
  actionsClassName,
}: AppRowProps) {
  const Component = as ?? "div"
  const Icon = icon ? (ROW_ICONS[icon] as LucideIcon) : null

  return (
    <Component className={cn("flex min-w-0 items-start gap-3", className)}>
      {(head || Icon) && (
        <div
          className={cn("mt-0.5 shrink-0", headClassName)}
          data-slot="row-head"
        >
          {head ?? (
            <div className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
              {Icon ? <Icon className="size-4" /> : null}
            </div>
          )}
        </div>
      )}

      <div className={cn("min-w-0 flex-1", bodyClassName)} data-slot="row-body">
        <p className="truncate text-sm font-medium">{body}</p>
        {detail ? (
          <div
            className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground"
            data-slot="row-detail"
          >
            {detailPrefix}
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-[11.5px]",
                detailClassName,
              )}
            >
              {detail}
            </p>
          </div>
        ) : null}
      </div>

      {tail && (
        <div
          className={cn("shrink-0 self-center", tailClassName)}
          data-slot="row-tail"
        >
          {tail}
        </div>
      )}

      {actions && (
        <div
          className={cn("shrink-0 self-center", actionsClassName)}
          data-slot="row-actions"
        >
          {actions}
        </div>
      )}
    </Component>
  )
}
