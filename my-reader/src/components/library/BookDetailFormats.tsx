import { formatFileSize } from "@my-reader/tools/book-metadata"
import { BookOpen } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getBookProgressSnapshot,
  getProgressDisplay,
  getReadActionLabel,
  type ReadingProgressByBook,
} from "@/lib/readingProgress"
import type { BookDetail } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { CircularDownloadProgress } from "./CircularDownloadProgress"
import { BookFormatFileAction } from "./BookFormatFileAction"
import { BookShareMenu } from "./BookShareMenu"
import { DetailSection } from "./BookDetailSections"
import { getFormatTone } from "./bookDetailFormatting"

interface BookDetailFormatsProps {
  book: BookDetail
  activeSelectedFormat: string | null
  progressByBookId: ReadingProgressByBook
  isRemoteLibrary: boolean
  activeLibraryId: string | null
  onSelectFormat: (format: string) => void
  navigateToRead: (id: number, format?: string) => void
}

export function BookDetailFormats(props: BookDetailFormatsProps) {
  const { t } = useTranslation()
  const { book } = props
  const formatSizeMap = new Map(
    book.formatSizes.map((fs) => [fs.format, fs.sizeBytes]),
  )
  return (
    <div className="scroll-mt-6">
      {book.formats.length > 0 && (
        <DetailSection title={t("bookDetail.fileFormats")}>
          <div className="book-format-table overflow-x-auto overflow-y-hidden rounded-md">
            <table className="w-full min-w-[25rem] table-auto border-collapse">
              <thead>
                <tr className="bg-muted text-start text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="w-12 rounded-ts-md px-2 py-2 text-center whitespace-nowrap">
                    {t("bookDetail.format")}
                  </th>
                  <th className="w-16 px-2 py-2 text-center whitespace-nowrap">
                    {t("bookDetail.size")}
                  </th>
                  <th className="w-24 px-3 py-2 text-start whitespace-nowrap">
                    {t("library.sort.progress")}
                  </th>
                  <th className="w-14 px-2 py-2 text-center whitespace-nowrap">
                    {t("bookDetail.defaultReadingFormat")}
                  </th>
                  <th className="w-20 rounded-te-md px-2 py-2 text-center whitespace-nowrap">
                    {t("bookDetail.action")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {book.formats.map((fmt) => (
                  <BookFormatRow
                    key={fmt}
                    {...props}
                    fmt={fmt}
                    sizeBytes={formatSizeMap.get(fmt) ?? 0}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </DetailSection>
      )}
    </div>
  )
}

function BookFormatRow({
  book,
  activeSelectedFormat,
  progressByBookId,
  isRemoteLibrary,
  activeLibraryId,
  onSelectFormat,
  navigateToRead,
  fmt,
  sizeBytes,
}: BookDetailFormatsProps & { fmt: string; sizeBytes: number }) {
  const { t } = useTranslation()
  const readableFormats = book.readableFormats
  const upperFormat = fmt.toUpperCase()
  const isReadable = readableFormats.includes(upperFormat)
  const isDefaultFormat = activeSelectedFormat === upperFormat
  const rowProgress = getBookProgressSnapshot(
    progressByBookId,
    book.id,
    upperFormat,
  )
  const rowProgressDisplay = getProgressDisplay(rowProgress, t)
  const rowReadLabel = getReadActionLabel(rowProgress, t)
  const setDefaultFormatLabel = t("bookDetail.setDefaultFormatFor", {
    format: upperFormat,
  })
  const setDefaultFormatTooltip = t("bookDetail.setAsDefaultReadingFormat")
  const defaultFormatSwitch = (
    <Switch
      size="sm"
      checked={isDefaultFormat}
      disabled={!isReadable || isDefaultFormat}
      aria-label={setDefaultFormatLabel}
      onCheckedChange={(checked) => {
        if (!checked || !isReadable) return
        onSelectFormat(upperFormat)
      }}
    />
  )
  return (
    <tr className="border-b border-border transition-colors last:border-b-0 hover:bg-accent/30">
      <td className="px-2 py-3">
        <div className="flex min-w-0 items-center justify-center gap-2.5">
          <div
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase",
              getFormatTone(fmt),
            )}
          >
            {fmt}
          </div>
        </div>
      </td>
      <td className="px-2 py-3 text-center text-[13.5px] whitespace-nowrap">
        {formatFileSize(sizeBytes)}
      </td>
      <td className="w-24 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {rowProgress?.percent !== undefined ? (
            <>
              <div className="book-format-progress-bar flex min-w-0 flex-1 items-center gap-2">
                <Progress
                  value={rowProgress.percent}
                  className="h-1.5 min-w-10 flex-1"
                />
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  {rowProgressDisplay.text}
                </span>
              </div>
              <span className="book-format-progress-compact shrink-0 items-center gap-1.5 text-[12px] tabular-nums text-muted-foreground">
                <CircularDownloadProgress
                  percent={rowProgress.percent}
                  className="size-5"
                />
                {rowProgressDisplay.text}
              </span>
            </>
          ) : (
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
              {rowProgressDisplay.text}
            </span>
          )}
        </div>
      </td>
      <td className="w-14 px-2 py-3 text-center">
        {!isDefaultFormat && isReadable ? (
          <Tooltip>
            <TooltipTrigger asChild>{defaultFormatSwitch}</TooltipTrigger>
            <TooltipContent side="top" align="center" sideOffset={6}>
              {setDefaultFormatTooltip}
            </TooltipContent>
          </Tooltip>
        ) : (
          defaultFormatSwitch
        )}
      </td>
      <td className="px-2 py-3 text-center">
        <div className="flex justify-center">
          <ButtonGroup>
            {isReadable ? (
              <Button
                variant="ghost"
                size="icon-sm"
                title={rowReadLabel}
                aria-label={rowReadLabel}
                onClick={() => navigateToRead(book.id, fmt)}
              >
                <BookOpen />
              </Button>
            ) : null}
            {isRemoteLibrary && activeLibraryId ? (
              <BookFormatFileAction
                libraryId={activeLibraryId}
                bookId={book.id}
                bookUuid={book.uuid}
                format={fmt}
              />
            ) : null}
            <BookShareMenu
              libraryId={activeLibraryId}
              bookId={book.id}
              format={fmt}
            />
          </ButtonGroup>
        </div>
      </td>
    </tr>
  )
}
