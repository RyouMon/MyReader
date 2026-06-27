import { AlertCircle, CheckCircle2, Info } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface StatusNoticeProps {
  tone?: "info" | "success" | "error"
  className?: string
  children: ReactNode
}

/**
 * 通用状态提示框，统一承载提示、成功与失败反馈样式。
 */
export function StatusNotice({
  tone = "info",
  className,
  children,
}: StatusNoticeProps) {
  const icon =
    tone === "success" ? (
      <CheckCircle2 className="mt-[1px] size-3.5 shrink-0 text-success" />
    ) : tone === "error" ? (
      <AlertCircle className="mt-[1px] size-3.5 shrink-0 text-destructive" />
    ) : (
      <Info className="mt-[1px] size-3.5 shrink-0 text-primary" />
    )

  const toneClassName =
    tone === "success"
      ? "border-success/30 bg-success-soft"
      : tone === "error"
        ? "border-destructive/30 bg-destructive/10"
        : "border-primary/20 bg-card"

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-md border p-3 text-[12.5px] leading-relaxed",
        toneClassName,
        className,
      )}
    >
      {icon}
      <div className="min-w-0 text-muted-foreground">{children}</div>
    </div>
  )
}
