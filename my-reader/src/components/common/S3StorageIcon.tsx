import { Database, type LucideProps } from "lucide-react"
import { forwardRef } from "react"

import { cn } from "@/lib/utils"

/** Database-shaped icon for S3-compatible object storage. */
export const S3StorageIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ className, ...props }, ref) => (
    <Database
      ref={ref}
      {...props}
      data-icon="s3-storage"
      className={cn("text-primary", className)}
    />
  ),
)

S3StorageIcon.displayName = "S3StorageIcon"
