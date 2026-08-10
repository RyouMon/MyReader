import type { LucideProps } from "lucide-react"
import { forwardRef } from "react"

import { cn } from "@/lib/utils"

/** Filled drive using MyReader's local-storage identity color. */
export const LocalStorageIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ className, size = 24, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      data-icon="local-storage"
      className={cn("text-data-source-local", className)}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.212 11.577A2 2 0 0 0 2 12.473V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11L2.212 11.577ZM2.2 11.75h19.6v1.5H2.2v-1.5ZM6 15.4a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm4 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z"
      />
    </svg>
  ),
)

LocalStorageIcon.displayName = "LocalStorageIcon"
