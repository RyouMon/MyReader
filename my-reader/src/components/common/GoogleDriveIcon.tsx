import type { LucideProps } from "lucide-react"
import { forwardRef } from "react"
import googleDriveLogo from "@/assets/brands/google-drive-2026.png"

/**
 * Official Google Drive product mark. Google allows the unmodified logo in
 * apps that integrate with Drive; keep the asset multicoloured and only scale
 * it for the surrounding UI.
 * https://developers.google.com/workspace/drive/api/guides/branding
 */
export const GoogleDriveIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ className, size = 24, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 128 128"
      aria-hidden="true"
      data-icon="google-drive"
      className={className}
      {...props}
    >
      <image href={googleDriveLogo} width="128" height="128" />
    </svg>
  ),
)

GoogleDriveIcon.displayName = "GoogleDriveIcon"
