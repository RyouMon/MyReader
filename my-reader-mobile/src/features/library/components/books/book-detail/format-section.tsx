import Feather from "@expo/vector-icons/Feather";
import type { BookDetail } from "@my-reader/tools/types/book";
import { useTranslation } from "react-i18next";

import { Button } from "@/src/components/ui";
import { FONT_UI } from "@/src/design/typography";
import {
  cancel,
  useDownloadTaskForBookFormat,
  useDownloadTaskForPath,
} from "@/src/sync/download-store";
import { FORMAT_LABELS, formatFileSize } from "@/src/utils/book-detail";
import { Pressable, ScrollView, Text, View } from "@/tw";
import { SectionFrame, SectionHeader } from "./section-frame";
import type { DetailColors } from "./types";

type FormatSectionProps = {
  book: BookDetail;
  colors: DetailColors;
  defaultFormat: string | null;
  formatInfoMap: Record<string, { relativePath: string; localState: import("@/src/repos/file_state").LocalState | null }>;
  formatSizeMap: Map<string, number>;
  isNetworkSource: boolean;
  libraryId: string;
  onDeleteFormat: (format: string) => void;
  onDownloadFormat: (format: string) => void;
  onSetDefaultFormat: (format: string) => void;
  progress: number;
  progressLabel: string;
  readableFormats: string[];
};

export function FormatSection({
  book,
  colors,
  defaultFormat,
  formatInfoMap,
  formatSizeMap,
  isNetworkSource,
  libraryId,
  onDeleteFormat,
  onDownloadFormat,
  onSetDefaultFormat,
  progress,
  progressLabel,
  readableFormats,
}: FormatSectionProps) {
  const { t } = useTranslation();
  const readableFormatSet = new Set(readableFormats.map((format) => format.toUpperCase()));
  const defaultFormatKey = defaultFormat?.toUpperCase() ?? null;

  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} detail={t("bookDetail.formatSection.count", { count: book.formats.length })} title={t("bookDetail.formatSection.title")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
        {book.formats.map((format) => {
          const upper = format.toUpperCase();
          const formatInfo = formatInfoMap[upper];
          return (
            <FormatCard
              key={upper}
              bookId={String(book.id)}
              colors={colors}
              defaultFormatKey={defaultFormatKey}
              fileLocalState={formatInfo?.localState ?? null}
              format={upper}
              isNetworkSource={isNetworkSource}
              isReadable={readableFormatSet.has(upper)}
              libraryId={libraryId}
              onDelete={() => onDeleteFormat(upper)}
              onDownload={() => onDownloadFormat(upper)}
              onSetDefault={() => onSetDefaultFormat(upper)}
              progress={progress}
              progressLabel={progressLabel}
              relativePath={formatInfo?.relativePath}
              size={formatSizeMap.get(upper) ?? 0}
            />
          );
        })}
      </ScrollView>
    </SectionFrame>
  );
}

function FormatCard({
  bookId,
  colors,
  defaultFormatKey,
  fileLocalState,
  format,
  isNetworkSource,
  isReadable,
  libraryId,
  onDelete,
  onDownload,
  onSetDefault,
  progress,
  progressLabel,
  relativePath,
  size,
}: {
  bookId: string;
  colors: DetailColors;
  defaultFormatKey: string | null;
  fileLocalState: import("@/src/repos/file_state").LocalState | null;
  format: string;
  isNetworkSource: boolean;
  isReadable: boolean;
  libraryId: string;
  onDelete: () => void;
  onDownload: () => void;
  onSetDefault: () => void;
  progress: number;
  progressLabel: string;
  relativePath: string | undefined;
  size: number;
}) {
  const { t } = useTranslation();
  const taskByPath = useDownloadTaskForPath(libraryId, relativePath ?? "");
  const taskByFormat = useDownloadTaskForBookFormat(libraryId, bookId, format);
  const candidateTask = taskByPath ?? taskByFormat;
  const activeTask =
    candidateTask?.status === "queued" ||
    candidateTask?.status === "starting" ||
    candidateTask?.status === "downloading"
      ? candidateTask
      : undefined;
  const isDownloading =
    activeTask?.status === "starting" ||
    activeTask?.status === "downloading" ||
    activeTask?.status === "queued";
  const downloadProgress = activeTask?.progress ?? 0;
  const isPresent = fileLocalState === "present";
  const showDownload = isReadable && isNetworkSource && Boolean(relativePath) && !isPresent && !activeTask;
  const isDefault = defaultFormatKey === format;

  return (
    <Pressable
      accessibilityRole="button"
      className="w-[196px] gap-3 rounded-2xl border p-4"
      onPress={onSetDefault}
      style={{ borderColor: colors.border }}
    >
      <View className="flex-row items-center gap-2">
        <Feather
          name={isReadable ? "file-text" : "file"}
          size={20}
          color={isReadable ? colors.accent : colors.tertiary}
        />
        <Text
          className="flex-1 text-base leading-6"
          style={{ color: colors.text, fontFamily: FONT_UI, fontWeight: "600" }}
        >
          {format}
        </Text>
        <View
          className="min-h-7 justify-center rounded-full border px-3"
          style={{ borderColor: isReadable ? colors.success : colors.border }}
        >
          <Text
            className="text-xs leading-4"
            style={{
              color: isReadable ? colors.success : colors.tertiary,
              fontFamily: FONT_UI,
              fontWeight: "600",
            }}
          >
            {isReadable ? (isDefault ? t("bookDetail.formatSection.default") : t("bookDetail.formatSection.readable")) : t("bookDetail.formatSection.unsupported")}
          </Text>
        </View>
      </View>
      <Text className="text-sm leading-5" style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
        {formatFileSize(size)}
        {FORMAT_LABELS[format] ? ` · ${FORMAT_LABELS[format]}` : ""}
      </Text>

      {isDownloading ? (
        <View className="gap-1">
          <View className="flex-row items-center gap-2">
            <View
              className="h-1.5 flex-1 overflow-hidden rounded-full"
              style={{ backgroundColor: colors.progressTrack }}
            >
              <View
                className="h-full rounded-full"
                style={{
                  backgroundColor: colors.accent,
                  width: `${Math.max(0, Math.min(downloadProgress, 1)) * 100}%`,
                }}
              />
            </View>
            <Text
              className="text-xs leading-4"
              style={{ color: colors.tertiary, fontFamily: FONT_UI }}
            >
              {activeTask?.status === "queued"
                ? t("bookDetail.formatSection.queued")
                : activeTask?.status === "starting"
                  ? t("bookDetail.formatSection.preparing")
                  : `${Math.round(downloadProgress * 100)}%`}
            </Text>
          </View>
        </View>
      ) : isReadable ? (
        <View className="flex-row items-center gap-2">
          <View
            className="h-1.5 flex-1 overflow-hidden rounded-full"
            style={{ backgroundColor: colors.progressTrack }}
          >
            <View
              className="h-full rounded-full"
              style={{
                backgroundColor: colors.accent,
                width: `${Math.max(0, Math.min(progress, 1)) * 100}%`,
              }}
            />
          </View>
          <Text className="text-xs leading-4" style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
            {progress > 0 ? progressLabel : "0%"}
          </Text>
        </View>
      ) : (
        <Text className="text-xs leading-4" style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
          {t("bookDetail.formatSection.notStarted")}
        </Text>
      )}

      {isDownloading ? (
        <Pressable
          accessibilityLabel={t("bookDetail.formatSection.cancelDownload", { format })}
          accessibilityRole="button"
          className="items-center rounded-xl border py-3"
          onPress={(e) => {
            e.stopPropagation();
            activeTask && cancel(activeTask.id);
          }}
          style={{ borderColor: colors.border }}
        >
          <Text
            className="text-base"
            style={{ color: colors.muted, fontFamily: FONT_UI, fontWeight: "500" }}
          >
            {t("bookDetail.formatSection.cancel")}
          </Text>
        </Pressable>
      ) : showDownload ? (
        <Pressable
          accessibilityRole="button"
          onPress={(e) => {
            e.stopPropagation();
            onDownload();
          }}
        >
          <Button
            accessibilityLabel={t("bookDetail.formatSection.downloadFormat", { format })}
            className="rounded-xl"
            colors={{
              backgroundColor: colors.accent,
              borderColor: colors.accent,
              textColor: colors.accentText,
              underlayColor: colors.accentPressed,
            }}
            onPress={onDownload}
            size="lg"
            textStyle={{ fontFamily: FONT_UI }}
            title={t("bookDetail.formatSection.download")}
            variant="primary"
          />
        </Pressable>
      ) : isPresent ? (
        <Pressable
          accessibilityLabel={t("bookDetail.formatSection.deleteLocalFileFormat", { format })}
          accessibilityRole="button"
          className="items-center rounded-xl border py-3"
          onPress={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{ borderColor: colors.border }}
        >
          <Text className="text-sm" style={{ color: colors.muted, fontFamily: FONT_UI }}>
            {t("bookDetail.formatSection.deleteLocalFile")}
          </Text>
        </Pressable>
      ) : (
        <View className="items-center rounded-xl border py-3" style={{ borderColor: colors.border }}>
          <Text className="text-sm" style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
            {t("bookDetail.formatSection.notDownloaded")}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
