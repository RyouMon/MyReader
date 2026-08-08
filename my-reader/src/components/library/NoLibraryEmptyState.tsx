import { Library } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

interface NoLibraryEmptyStateProps {
  onAddLibrary: () => void
}

export function NoLibraryEmptyState({
  onAddLibrary,
}: NoLibraryEmptyStateProps) {
  const { t } = useTranslation()

  return (
    <Empty className="min-h-0 flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Library />
        </EmptyMedia>
        <EmptyTitle>{t("addLibraryFlow.noLibrary.title")}</EmptyTitle>
        <EmptyDescription>
          {t("addLibraryFlow.noLibrary.description")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" onClick={onAddLibrary}>
          {t("addLibraryFlow.title")}
        </Button>
      </EmptyContent>
    </Empty>
  )
}
