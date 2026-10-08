import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

interface GroupListProps {
  className?: string
  children: ReactNode
}

/**
 * 提供统一分组列表容器，保证设置页各模块的列表边框与背景一致。
 */
export function GroupList({ className, children }: GroupListProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {children}
    </div>
  )
}

type GroupListItemProps = ComponentProps<"div">

/**
 * 承载分组列表中的单条记录，统一分隔线、内边距与状态动效基线。
 */
export function GroupListItem({ className, ...props }: GroupListItemProps) {
  return (
    <div
      className={cn(
        "border-b border-border/70 px-4 py-3 transition-[background-color,opacity,transform] last:border-b-0",
        className,
      )}
      {...props}
    />
  )
}
