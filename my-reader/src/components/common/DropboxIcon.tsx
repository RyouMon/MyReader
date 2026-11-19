import type { LucideProps } from "lucide-react"
import { forwardRef } from "react"
import dropboxGlyph from "@/assets/brands/dropbox-glyph-128.png"
import { cn } from "@/lib/utils"

/** Official Dropbox glyph from the Dropbox developer brand toolkit. */
export const DropboxIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ className, size = 24, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 129 128"
      aria-hidden="true"
      data-icon="dropbox"
      className={cn("scale-150", className)}
      {...props}
    >
      <image href={dropboxGlyph} width="129" height="128" />
    </svg>
  ),
)

DropboxIcon.displayName = "DropboxIcon"
