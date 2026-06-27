import { PlusCircle } from "lucide-react"
import type { ButtonHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

interface AddPanelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
}

/**
 * 统一“新增项”入口按钮，避免设置分区出现不一致的主操作样式。
 */
export function AddPanelButton({
  label,
  className,
  type = "button",
  ...props
}: AddPanelButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "flex w-full items-center gap-2.5 bg-card px-4 py-3 text-[13.5px] font-medium text-primary transition-colors hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <PlusCircle className="size-[15px]" />
      {label}
    </button>
  )
}
