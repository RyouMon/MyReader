import { cn } from "@/lib/utils"

interface CircularDownloadProgressProps {
  className?: string
  percent?: number
}

export function CircularDownloadProgress({
  className,
  percent,
}: CircularDownloadProgressProps) {
  const size = 16
  const strokeWidth = 2
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const ratio =
    percent == null ? 0.1 : Math.max(0, Math.min(100, percent)) / 100
  const offset = circumference - ratio * circumference

  return (
    <span
      className={cn(
        "inline-flex size-4 items-center justify-center text-primary",
        percent == null && "animate-spin",
        className,
      )}
      aria-hidden="true"
    >
      <svg className="size-full" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-border"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </span>
  )
}
