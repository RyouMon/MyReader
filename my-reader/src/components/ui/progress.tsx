import * as React from "react"

import { cn } from "@/lib/utils"

interface ProgressProps extends React.ComponentProps<"div"> {
  value?: number
}

function Progress({ className, value = 0, ...props }: ProgressProps) {
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "bg-progress-track relative h-[3px] w-full overflow-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <div
        className="bg-progress absolute inset-y-0 start-0 h-full rounded-full transition-[width] duration-500 ease-in-out"
        style={{ width: `${value ?? 0}%` }}
      />
    </div>
  )
}

export { Progress }
