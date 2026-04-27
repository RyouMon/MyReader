import Feather from "@expo/vector-icons/Feather";
import type { BookDetail } from "my-reader-tools/types/book";

import { Pressable, ScrollView, Text, View } from "../../../tw";
import { Button } from "../../ui";
import { FONT_UI } from "../../../design/typography";
import { FORMAT_LABELS, formatFileSize } from "../../../utils/book-detail";
import {
  cancel,
  useDownloadTaskForBookFormat,
  useDownloadTaskForPath,
} from "../../../sync/download-store";
import type { DetailColors } from "./types";
import { SectionFrame, SectionHeader } from "./section-frame";

type FormatSectionProps = {
  book: BookDetail;
  colors: DetailColors;
  formatInfoMap: Record<string, { relativePath: string; localState: import("../../../sync/file_state").LocalState | null }>;
  formatSizeMap: Map<string, number>;
  isNetworkSource: boolean;
  libraryId: string;
  onDeleteFormat: (format: string) => void;
  onDownloadFormat: (format: string) => void;
  onReadFormat: (format: string) => void;
  progress: number;
  progressLabel: string;
  readableFormats: string[];
  selectedFormat: string | null;
};

export function FormatSection({
  book,
  colors,
  formatInfoMap,
  formatSizeMap,
  isNetworkSource,
  libraryId,
  onDeleteFormat,
  onDownloadFormat,
  onReadFormat,
  progress,
  progressLabel,
  readableFormats,
  selectedFormat,
}: FormatSectionProps) {
  const readableFormatSet = new Set(readableFormats.map((format) => format.toUpperCase()));
  const selectedFormatKey = selectedFormat?.toUpperCase() ?? null;

  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} detail={`${book.formats.length} 种格式`} title="文件格式" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
        {book.formats.map((format) => {
          const upper = format.toUpperCase();
          const formatInfo = formatInfoMap[upper];
          return (
            <FormatCard
              key={upper}
              colors={colors}
              fileLocalState={formatInfo?.localState ?? null}
              bookId={String(book.id)}
              format={upper}
              isNetworkSource={isNetworkSource}
              isReadable={readableFormatSet.has(upper)}
              isSelected={selectedFormatKey === upper}
              libraryId={libraryId}
              onDelete={() => onDeleteFormat(upper)}
              onDownload={() => onDownloadFormat(upper)}
              onRead={() => onReadFormat(upper)}
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
  fileLocalState,
  format,
  isNetworkSource,
  isReadable,
  isSelected,
  libraryId,
  onDelete,
  onDownload,
  onRead,
  progress,
  progressLabel,
  relativePath,
  size,
}: {
  bookId: string;
  colors: DetailColors;
  fileLocalState: import("../../../sync/file_state").LocalState | null;
  format: string;
  isNetworkSource: boolean;
  isReadable: boolean;
  isSelected: boolean;
  libraryId: string;
  onDelete: () => void;
  onDownload: () => void;
  onRead: () => void;
  progress: number;
  progressLabel: string;
  relativePath: string | undefined;
  size: number;
}) {
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
  const readActionLabel = progress > 0 ? "继续阅读" : "开始阅读";

  return (
    <View
      className="w-[196px] gap-3 rounded-2xl p-4"
      style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
    >
      <View className="flex-row items-center gap-2">
        <Feather
          name={isReadable ? "file-text" : "file"}
          size={20}
          color={isReadable ? colors.accent : colors.tertiary}
        />
        <Text
          className="flex-1 text-base leading-6"
          style={{ color: colors.text, fontFamily: FONT_UI, fontWeight: "700" }}
        >
          {format}
        </Text>
        <View
          className="min-h-7 justify-center rounded-full px-3"
          style={{ backgroundColor: isReadable ? colors.successBg : colors.disabledBg }}
        >
          <Text
            className="text-xs leading-4"
            style={{
              color: isReadable ? colors.success : colors.disabledText,
              fontFamily: FONT_UI,
              fontWeight: "600",
            }}
          >
            {isReadable ? (isSelected ? "当前" : "可阅读") : "不支持"}
          </Text>
        </View>
      </View>
      <Text className="text-[13px] leading-5" style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
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
                ? "排队中"
                : activeTask?.status === "starting"
                  ? "准备中"
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
          未开始阅读
        </Text>
      )}

      {isDownloading ? (
        <Pressable
          accessibilityLabel={`取消下载 ${format}`}
          accessibilityRole="button"
          className="items-center rounded-2xl py-3"
          onPress={() => activeTask && cancel(activeTask.id)}
          style={{ backgroundColor: colors.disabledBg, borderColor: colors.border, borderWidth: 1 }}
        >
          <Text
            className="text-[15px]"
            style={{ color: colors.muted, fontFamily: FONT_UI, fontWeight: "600" }}
          >
            取消
          </Text>
        </Pressable>
      ) : showDownload ? (
        <Button
          accessibilityLabel={`下载 ${format}`}
          className="rounded-2xl"
          colors={{
            backgroundColor: colors.accent,
            borderColor: colors.accent,
            textColor: colors.accentText,
            underlayColor: colors.accentPressed,
          }}
          onPress={onDownload}
          size="lg"
          textStyle={{ fontFamily: FONT_UI }}
          title="下载"
          variant="primary"
        />
      ) : isPresent ? (
        <View className="gap-2">
          <Button
            accessibilityLabel={`${readActionLabel} ${format}`}
            className="rounded-2xl"
            colors={{
              backgroundColor: isReadable ? colors.accent : colors.card,
              borderColor: isReadable ? colors.accent : colors.text,
              textColor: isReadable ? colors.accentText : colors.text,
              underlayColor: isReadable ? colors.accentPressed : colors.disabledBg,
            }}
            onPress={onRead}
            size="lg"
            textStyle={{ fontFamily: FONT_UI }}
            title={readActionLabel}
            variant="primary"
          />
          <Pressable
            accessibilityLabel={`删除本地文件 ${format}`}
            accessibilityRole="button"
            className="items-center py-1"
            onPress={onDelete}
          >
            <Text className="text-[13px]" style={{ color: colors.muted, fontFamily: FONT_UI }}>
              删除本地文件
            </Text>
          </Pressable>
        </View>
      ) : (
        <Button
          accessibilityLabel={`${readActionLabel} ${format}`}
          className="rounded-2xl"
          colors={{
            backgroundColor: isReadable ? colors.accent : colors.card,
            borderColor: isReadable ? colors.accent : colors.text,
            textColor: isReadable ? colors.accentText : colors.text,
            underlayColor: isReadable ? colors.accentPressed : colors.disabledBg,
          }}
          disabled={!isReadable}
          onPress={onRead}
          size="lg"
          textStyle={{ fontFamily: FONT_UI }}
          title={isReadable ? readActionLabel : "不支持阅读"}
          variant={isReadable ? "primary" : "outline"}
        />
      )}
    </View>
  );
}
