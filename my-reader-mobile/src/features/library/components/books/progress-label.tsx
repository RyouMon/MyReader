import { memo } from "react";
import { useTranslation } from "react-i18next";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";
import type { BookProgressSnapshot } from "./book-cover";

export function getProgressDisplay(
  progress: BookProgressSnapshot | undefined,
  t: (key: string) => string,
): { text: string; isUnread: boolean; isFinished: boolean; isStatusLabel: boolean } {
  if (progress?.statusLabel) {
    return { text: progress.statusLabel, isUnread: false, isFinished: false, isStatusLabel: true };
  }

  const percent = progress?.percent ?? 0;
  const hasProgress = typeof progress?.percent === "number";
  const roundedPercent = Math.round(percent);
  const isUnread = !hasProgress || roundedPercent <= 0;
  const isFinished = hasProgress && roundedPercent >= 100;

  if (isUnread) {
    return { text: t("bookRow.unread"), isUnread: true, isFinished: false, isStatusLabel: true };
  }
  if (isFinished) {
    return { text: t("bookRow.finished"), isUnread: false, isFinished: true, isStatusLabel: true };
  }
  return { text: `${roundedPercent}%`, isUnread: false, isFinished: false, isStatusLabel: false };
}

type ProgressLabelProps = {
  progress?: BookProgressSnapshot;
};

function ProgressLabelImpl({ progress }: ProgressLabelProps) {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const { text, isUnread, isFinished, isStatusLabel } = getProgressDisplay(progress, t);

  if (isStatusLabel) {
    const backgroundColor = isUnread
      ? palette.surface
      : isFinished
        ? palette.successSoft
        : "rgba(217,119,87,0.14)";
    const color = isUnread ? palette.textMuted : isFinished ? palette.success : palette.primary;

    return (
      <View className="self-start rounded px-1.5 py-0.5" style={{ backgroundColor }}>
        <Text className="text-sm" style={{ color }}>
          {text}
        </Text>
      </View>
    );
  }

  return (
    <Text
      style={{ color: palette.textMuted }}
    >
      {text}
    </Text>
  );
}

const ProgressLabel = memo(ProgressLabelImpl);

export { ProgressLabel };
