import type { LucideProps } from "lucide-react"
import { forwardRef } from "react"

import { cn } from "@/lib/utils"

/** Filled server rack using MyReader's WebDAV identity color. */
export const WebdavServerIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ className, size = 24, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      data-icon="webdav-server"
      className={cn("text-data-source-webdav", className)}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm5 1h6v2h-6V6ZM4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm3 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm5 1h6v2h-6v-2Z"
      />
    </svg>
  ),
)

WebdavServerIcon.displayName = "WebdavServerIcon"
