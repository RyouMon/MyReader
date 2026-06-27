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
  /** 主标题，纯文本。 */
  body: string
  /** 副行说明，纯文本；不传则不渲染详情区。 */
  detail?: string
  tail?: ReactNode
  actions?: ReactNode
  className?: string
  bodyClassName?: string
  detailClassName?: string
}

/**
 * 统一的行容器：图标名（头）+ 正文 + 详情（均为纯文本）+ 可选尾区与动作区。
 */
export function AppRow({
  as,
  icon,
  body,
  detail,
  tail,
  actions,
  className,
  bodyClassName,
  detailClassName,
}: AppRowProps) {
  const Component = as ?? "div"
  const Icon = icon ? (ROW_ICONS[icon] as LucideIcon) : null

  return (
    <Component className={cn("flex min-w-0 items-start gap-3", className)}>
      {Icon && (
        <div className="mt-0.5 shrink-0" data-slot="row-head">
          <div className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Icon className="size-4" />
          </div>
        </div>
      )}

      <div className={cn("min-w-0 flex-1", bodyClassName)} data-slot="row-body">
        <p className="truncate text-sm font-medium">{body}</p>
        {detail ? (
          <div className="mt-0.5 text-muted-foreground" data-slot="row-detail">
            <p className={cn("truncate text-[11.5px]", detailClassName)}>
              {detail}
            </p>
          </div>
        ) : null}
      </div>

      {tail && (
        <div className="shrink-0 self-center" data-slot="row-tail">
          {tail}
        </div>
      )}

      {actions && (
        <div className="shrink-0 self-center" data-slot="row-actions">
          {actions}
        </div>
      )}
    </Component>
  )
}
