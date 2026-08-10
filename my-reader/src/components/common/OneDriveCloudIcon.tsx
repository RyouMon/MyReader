import { Cloud, type LucideProps } from "lucide-react"
import { forwardRef } from "react"

import { cn } from "@/lib/utils"

/** Filled OneDrive cloud using the provider's shared brand color. */
export const OneDriveCloudIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ className, ...props }, ref) => (
    <Cloud
      ref={ref}
      {...props}
      fill="currentColor"
      className={cn("text-brand-onedrive", className)}
    />
  ),
)

OneDriveCloudIcon.displayName = "OneDriveCloudIcon"
