import { Collapsible } from "radix-ui"
import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

export function CollapsibleSection({
  title,
  summary,
  open,
  onOpenChange,
  children,
}: {
  title: ReactNode
  summary?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center gap-2">
        <Collapsible.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="min-w-0 flex-1 justify-between px-0 hover:bg-transparent"
          >
            <span className="truncate">{title}</span>
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              {summary ? (
                <span className="truncate font-normal">{summary}</span>
              ) : null}
              <ChevronDown className={open ? "rotate-180" : undefined} />
            </span>
          </Button>
        </Collapsible.Trigger>
      </div>
      <Collapsible.Content className="pt-3 pb-4">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
