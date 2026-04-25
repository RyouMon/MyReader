import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { BookDetail } from "my-reader-tools/types/book";
import { isReadableInAppFormat, pickReadableFormat } from "my-reader-tools/utils";
import { Platform, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemePalette } from "@/src/design/tokens";
import { Image, Pressable, ScrollView, Text, View } from "@/tw";

import {
    EmptyState,
    HeaderToolbar,
    ProgressBar,
    Sheet,
    SheetOption,
    type HeaderToolbarAction
} from "../components";
import { buildCoverUri, readBookDetailFromMetadata } from "../data/calibre";
import type { BookItem, MobileLibrary, WebDavDataSource } from "../data/types";
import { buildWebDavBookCoverUri } from "../data/webdav";
import { useAppStore } from "../store/app-store";
import { useLibraryStore } from "../store/library-store";

const IDENTIFIER_LABELS: Record<string, string> = {
  isbn: "ISBN",
  goodreads: "Goodreads",
  douban: "豆瓣",
  amazon: "Amazon",
  google: "Google",
  barnesnoble: "B&N",
};

const FORMAT_LABELS: Record<string, string> = {
  EPUB: "可重排版",
  PDF: "固定版式",
  MOBI: "Kindle 格式",
  AZW3: "Kindle 格式",
  TXT: "纯文本",
  CBZ: "漫画归档",
  DJVU: "扫描文档",
  FB2: "FictionBook",
};

function formatLanguage(code: string): string {
  const map: Record<string, string> = {
    zho: "中文",
    chi: "中文",
    eng: "English",
    jpn: "日本語",
    kor: "한국어",
    fra: "Français",
    deu: "Deutsch",
    spa: "Español",
    rus: "Русский",
  };
  return map[code] ?? code;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (d.getFullYear() <= 100) return "—";
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function extractYear(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    if (year <= 100) return null;
    return String(year);
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function resolveCoverForDetail(
  library: MobileLibrary | null,
  detail: BookDetail,
  webDavSource: WebDavDataSource | null,
  fallback?: BookItem["coverUri"]
): BookItem["coverUri"] | undefined {
  if (fallback) return fallback;
  if (!library || !detail.path) return undefined;
  if (library.sourceType === "webdav" && webDavSource) {
    return buildWebDavBookCoverUri(library, webDavSource, detail.path, detail.hasCover);
  }
  return buildCoverUri(library, detail.path, detail.hasCover);
}

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const { books, activeLibrary, activeLibraryId } = useLibraryStore();
  const dataSources = useAppStore((s) => s.dataSources);

  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [formatSheetOpen, setFormatSheetOpen] = useState(false);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);

  const listBook = useMemo(() => (id ? books.find((item) => item.id === id) ?? null : null), [books, id]);

  const calibreNumericId = useMemo(() => {
    if (!id) return null;
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.trunc(n);
  }, [id]);

  const webDavSource = useMemo(() => {
    if (!activeLibrary || activeLibrary.sourceType !== "webdav") return null;
    const found = dataSources.find(
      (d) => d.id === activeLibrary.dataSourceId && d.type === "webdav"
    );
    return (found as WebDavDataSource | undefined) ?? null;
  }, [activeLibrary, dataSources]);

  const loadDetail = useCallback(async () => {
    if (!activeLibrary || calibreNumericId === null) {
      setDetail(null);
      setLoadingDetail(false);
      setDetailError(!activeLibrary ? "未选择书库" : "无效的书籍 ID");
      return;
    }

    setLoadingDetail(true);
    setDetailError(null);

    try {
      const next = await readBookDetailFromMetadata(activeLibrary, calibreNumericId);
      if (!next) {
        setDetail(null);
        setDetailError("在 metadata 中未找到该书");
        return;
      }
      setDetail(next);
      setSelectedFormat(pickReadableFormat(next.formats));
    } catch (e) {
      setDetail(null);
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingDetail(false);
    }
  }, [activeLibrary, calibreNumericId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const coverUri = useMemo(
    () =>
      detail && activeLibrary
        ? resolveCoverForDetail(activeLibrary, detail, webDavSource, listBook?.coverUri)
        : listBook?.coverUri,
    [activeLibrary, detail, listBook?.coverUri, webDavSource]
  );

  const progress =
    typeof listBook?.progress === "number" ? listBook.progress : 0;
  const progressLabel = `${Math.round(progress * 100)}%`;

  const readableFormats = useMemo(
    () => (detail ? detail.formats.filter(isReadableInAppFormat) : []),
    [detail]
  );

  const formatSizeMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!detail) return m;
    for (const fs of detail.formatSizes) {
      m.set(fs.format.toUpperCase(), fs.sizeBytes);
    }
    return m;
  }, [detail]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/library");
  }, []);

  const handleShare = useCallback(() => {
    if (!detail) return;
    const lines = [detail.title, detail.authors.filter(Boolean).join(", ") || detail.authorSort].filter(
      (line): line is string => Boolean(line)
    );
    void Share.share({
      title: detail.title,
      message: lines.join("\n"),
    });
  }, [detail]);

  const leftToolbar = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        label: "返回",
        onPress: handleBack,
        icon:
          Platform.OS === "ios" ? (
            <SymbolView name="chevron.left" size={18} tintColor={palette.text} />
          ) : (
            <MaterialIcons name="arrow-back" size={22} color={palette.text} />
          ),
        iosSfSymbol: "chevron.left",
        iconOnly: true,
      },
    ],
    [handleBack, palette.text]
  );

  const rightToolbar = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        label: "分享",
        onPress: handleShare,
        icon:
          Platform.OS === "ios" ? (
            <SymbolView name="square.and.arrow.up" size={18} tintColor={palette.text} />
          ) : (
            <MaterialIcons name="share" size={22} color={palette.text} />
          ),
        iosSfSymbol: "square.and.arrow.up",
        color: palette.text,
        iconOnly: true,
      },
    ],
    [handleShare, palette.text]
  );

  if (!id) {
    return (
      <View className="flex-1 px-4 pt-4" style={{ backgroundColor: palette.background }}>
        <EmptyState title="缺少书籍参数" detail="请从书库重新进入书籍详情。" />
      </View>
    );
  }

  if (!activeLibraryId || !activeLibrary) {
    return (
      <View className="flex-1 px-4 pt-4" style={{ backgroundColor: palette.background }}>
        <EmptyState title="没有当前书库" detail="请先在设置或书库中选择要使用的 Calibre 书库。" />
      </View>
    );
  }

  if (loadingDetail) {
    return (
      <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: palette.background }}>
        <Text className="text-sm" style={{ color: palette.textMuted }}>
          加载书籍详情…
        </Text>
      </View>
    );
  }

  if (detailError || !detail) {
    return (
      <View className="flex-1 px-4 pt-4" style={{ backgroundColor: palette.background }}>
        <EmptyState
          title="没有找到这本书"
          detail={detailError ?? "它可能已从当前书库移除，或页面参数已经失效。"}
        />
      </View>
    );
  }

  const book = detail;
  const year = extractYear(book.pubdate);
  const langDisplay = book.languages.map(formatLanguage).join(", ");
  const ratingStars = book.rating ? Math.round(book.rating / 2) : 0;
  const ratingValue = book.rating ? (book.rating / 2).toFixed(1) : null;
  const seriesLabel =
    book.series && book.seriesIndex !== null && book.seriesIndex !== undefined
      ? `${book.series} · 第 ${Number.isInteger(book.seriesIndex) ? book.seriesIndex : book.seriesIndex.toFixed(1)} 部`
      : book.series;
  const synopsisText = book.comment ? stripHtml(book.comment) : "";
  const canReadInApp = readableFormats.length > 0;
  const formatChoices =
    readableFormats.length > 0 ? readableFormats : book.formats;

  return (
    <View className="flex-1" style={{ backgroundColor: palette.background }}>
      <Stack.Screen
        options={{
          title: book.title,
        }}
      />
      <HeaderToolbar left={leftToolbar} right={rightToolbar} />
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="px-4 pb-36"
        style={{ backgroundColor: palette.background }}
      >
        <View className="gap-4 pt-2">
          <View
            className="items-center rounded-[32px] px-4 pb-5 pt-6"
            style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}
          >
            <View className="w-full items-center gap-4">
              <View className="w-[208px] overflow-hidden rounded-[26px]" style={{ backgroundColor: palette.secondary }}>
                {coverUri ? (
                  <Image source={coverUri} className="aspect-[2/3] w-full" />
                ) : (
                  <View className="aspect-[2/3] items-center justify-end px-6 py-5" style={{ backgroundColor: palette.primary }}>
                    <Text
                      className="text-center text-[22px] leading-8"
                      style={{ color: palette.primaryForeground, fontWeight: "700" }}
                    >
                      {book.title}
                    </Text>
                    <Text className="mt-2 text-sm" style={{ color: palette.primaryForeground, opacity: 0.8 }}>
                      {book.authors.join(", ") || book.authorSort}
                    </Text>
                  </View>
                )}
              </View>

              <View className="w-full gap-2">
                <Text className="text-[30px] leading-[36px]" style={{ color: palette.text, fontWeight: "700" }}>
                  {book.title}
                </Text>
                {seriesLabel ? (
                  <Text className="text-[15px] leading-6" style={{ color: palette.textMuted }}>
                    {seriesLabel}
                  </Text>
                ) : null}
                <Text className="text-sm leading-6" style={{ color: palette.textMuted }}>
                  {activeLibrary.name} · 共 {books.length} 本
                </Text>
                <View className="flex-row flex-wrap gap-x-3 gap-y-2">
                  {book.authors.map((author) => (
                    <Text key={author} className="text-base" style={{ color: palette.primary, fontWeight: "700" }}>
                      {author}
                    </Text>
                  ))}
                </View>

                <View className="mt-1 flex-row flex-wrap gap-x-2 gap-y-2" style={{ alignItems: "center" }}>
                  {year ? (
                    <Text className="text-[13px]" style={{ color: palette.textMuted }}>
                      {year}
                    </Text>
                  ) : null}
                  {year && book.publisher ? (
                    <Text className="text-[13px]" style={{ color: palette.textMuted }}>
                      ·
                    </Text>
                  ) : null}
                  {book.publisher ? (
                    <Text className="text-[13px]" style={{ color: palette.textMuted }}>
                      {book.publisher}
                    </Text>
                  ) : null}
                  {(year || book.publisher) && langDisplay ? (
                    <Text className="text-[13px]" style={{ color: palette.textMuted }}>
                      ·
                    </Text>
                  ) : null}
                  {langDisplay ? (
                    <Text className="text-[13px]" style={{ color: palette.textMuted }}>
                      {langDisplay}
                    </Text>
                  ) : null}
                  {ratingValue ? (
                    <View className="flex-row items-center gap-1">
                      <Text className="text-[13px]" style={{ color: palette.textMuted }}>
                        ·
                      </Text>
                      <View className="flex-row items-center gap-0.5">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <MaterialIcons
                            key={i}
                            name={i < ratingStars ? "star" : "star-border"}
                            size={14}
                            color={i < ratingStars ? palette.primary : palette.textMuted}
                          />
                        ))}
                      </View>
                      <Text className="text-[13px]" style={{ color: palette.textMuted }}>
                        {ratingValue}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {book.tags.length > 0 ? (
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    {book.tags.map((tag) => (
                      <View
                        key={tag}
                        className="rounded-full px-3 py-1"
                        style={{ backgroundColor: palette.background, borderColor: palette.border, borderWidth: 1 }}
                      >
                        <Text className="text-xs" style={{ color: palette.text }}>
                          {tag}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View
            className="gap-3 rounded-[24px] px-4 py-4"
            style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-[13px]" style={{ color: palette.textMuted, fontWeight: "600" }}>
                阅读进度
              </Text>
              <Text className="text-[13px]" style={{ color: palette.primary, fontWeight: "700" }}>
                {progress > 0 ? progressLabel : "未开始"}
              </Text>
            </View>
            <ProgressBar progress={progress} />
          </View>

          {synopsisText ? (
            <MetaSection palette={palette} title="简介">
              <Text
                className="text-[14px] leading-[22px]"
                style={{ color: palette.text }}
                numberOfLines={synopsisExpanded ? undefined : 6}
              >
                {synopsisText}
              </Text>
              <Pressable accessibilityRole="button" className="mt-2 self-start" onPress={() => setSynopsisExpanded((v) => !v)}>
                <Text className="text-sm" style={{ color: palette.primary, fontWeight: "600" }}>
                  {synopsisExpanded ? "收起" : "展开全文"}
                </Text>
              </Pressable>
            </MetaSection>
          ) : null}

          {book.formats.length > 0 ? (
            <MetaSection palette={palette} title="文件格式">
              <View className="gap-2">
                {book.formats.map((fmt) => {
                  const upper = fmt.toUpperCase();
                  const size = formatSizeMap.get(upper) ?? 0;
                  const readable = isReadableInAppFormat(fmt);
                  return (
                    <View
                      key={fmt}
                      className="flex-row items-center justify-between rounded-2xl px-3 py-3"
                      style={{ backgroundColor: palette.background, borderColor: palette.border, borderWidth: 1 }}
                    >
                      <View className="flex-1 flex-row items-center gap-2">
                        <View
                          className="rounded-lg px-2 py-1"
                          style={{ backgroundColor: palette.secondary }}
                        >
                          <Text className="text-[10px] font-bold" style={{ color: palette.primaryForeground }}>
                            {upper}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm" style={{ color: palette.text, fontWeight: "600" }}>
                            {upper}
                          </Text>
                          <Text className="text-xs" style={{ color: palette.textMuted }}>
                            {formatFileSize(size)}
                            {FORMAT_LABELS[upper] ? ` · ${FORMAT_LABELS[upper]}` : ""}
                            {readable ? "" : " · 应用内不支持"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </MetaSection>
          ) : null}

          {book.identifiers.length > 0 ? (
            <MetaSection palette={palette} title="标识符">
              <View className="flex-row flex-wrap gap-2">
                {book.identifiers.map((ident, idx) => (
                  <View
                    key={`${ident.idType}-${ident.value}-${idx}`}
                    className="rounded-xl px-3 py-2"
                    style={{ backgroundColor: palette.background, borderColor: palette.border, borderWidth: 1 }}
                  >
                    <Text className="text-[10px] font-semibold uppercase" style={{ color: palette.textMuted }}>
                      {IDENTIFIER_LABELS[ident.idType] ?? ident.idType}
                    </Text>
                    <Text className="mt-0.5 font-mono text-xs" style={{ color: palette.text }}>
                      {ident.value}
                    </Text>
                  </View>
                ))}
              </View>
            </MetaSection>
          ) : null}

          <MetaSection palette={palette} title="书库信息">
            <View className="gap-2">
              <InfoRow palette={palette} label="添加日期" value={formatDate(book.timestamp)} />
              <InfoRow palette={palette} label="出版日期" value={formatDate(book.pubdate)} />
              <InfoRow palette={palette} label="最后修改" value={formatDate(book.lastModified)} />
              {book.uuid ? (
                <InfoRow
                  palette={palette}
                  label="UUID"
                  value={
                    book.uuid.length > 16 ? `${book.uuid.slice(0, 8)}…${book.uuid.slice(-4)}` : book.uuid
                  }
                  mono
                />
              ) : null}
              <InfoRow palette={palette} label="库中路径" value={book.path || "—"} mono />
              <InfoRow palette={palette} label="排序作者" value={book.authorSort || "—"} />
            </View>
          </MetaSection>
        </View>
      </ScrollView>

      <View
        className="px-4 pt-3"
        style={{
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: palette.background,
          borderTopColor: palette.border,
          borderTopWidth: 1,
        }}
      >
        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            disabled={!canReadInApp}
            onPress={() => {
              if (canReadInApp && selectedFormat) {
                router.push({
                  pathname: "/reader/[id]",
                  params: { id, format: selectedFormat },
                });
              }
            }}
            className="min-h-14 flex-1 flex-row items-center justify-between rounded-[20px] px-4"
            style={{
              backgroundColor: canReadInApp ? palette.primary : palette.surface,
              opacity: canReadInApp ? 1 : 0.55,
            }}
          >
            <View className="flex-row items-center gap-3">
              <MaterialIcons
                name="menu-book"
                size={20}
                color={canReadInApp ? palette.primaryForeground : palette.textMuted}
              />
              <View>
                <Text
                  className="text-[16px]"
                  style={{ color: canReadInApp ? palette.primaryForeground : palette.textMuted, fontWeight: "700" }}
                >
                  {progress > 0 ? `继续阅读 ${progressLabel}` : "开始阅读"}
                </Text>
                <Text
                  className="text-xs"
                  style={{ color: canReadInApp ? palette.primaryForeground : palette.textMuted, opacity: 0.82 }}
                >
                  {canReadInApp
                    ? selectedFormat
                      ? `格式 ${selectedFormat}`
                      : "选择可读格式"
                    : "暂无应用内可读格式"}
                </Text>
              </View>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={22}
              color={canReadInApp ? palette.primaryForeground : palette.textMuted}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={!canReadInApp && book.formats.length === 0}
            className="min-h-14 min-w-[96px] flex-row items-center justify-center gap-1 rounded-[20px] px-4"
            onPress={() => setFormatSheetOpen(true)}
            style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}
          >
            <Text className="text-[15px]" style={{ color: palette.text, fontWeight: "700" }}>
              {selectedFormat ?? (formatChoices[0] ? formatChoices[0].toUpperCase() : "格式")}
            </Text>
            <MaterialIcons name="expand-more" size={18} color={palette.textMuted} />
          </Pressable>
        </View>
      </View>

      <Sheet open={formatSheetOpen} onClose={() => setFormatSheetOpen(false)}>
        <Text
          className="px-1 text-xs font-semibold uppercase tracking-[0.4px]"
          style={{ color: palette.textMuted }}
        >
          {readableFormats.length > 0 ? "选择阅读格式" : "可用格式"}
        </Text>
        <View className="gap-2">
          {formatChoices.map((format) => {
            const upper = format.toUpperCase();
            const readable = isReadableInAppFormat(format);
            const size = formatSizeMap.get(upper) ?? 0;
            return (
              <SheetOption
                key={upper}
                label={`${upper} · ${formatFileSize(size)}${readable ? "" : "（不支持阅读）"}`}
                active={selectedFormat === upper}
                onPress={() => {
                  setSelectedFormat(upper);
                  setFormatSheetOpen(false);
                }}
              />
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

function MetaSection({
  title,
  children,
  palette,
}: {
  title: string;
  children: ReactNode;
  palette: ReturnType<typeof useThemePalette>;
}) {
  return (
    <View
      className="gap-3 rounded-[24px] px-4 py-4"
      style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}
    >
      <Text className="text-[18px]" style={{ color: palette.text, fontWeight: "700" }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function InfoRow({
  label,
  value,
  mono,
  palette,
}: {
  label: string;
  value: string;
  mono?: boolean;
  palette: ReturnType<typeof useThemePalette>;
}) {
  return (
    <View
      className="rounded-2xl px-3 py-3"
      style={{ backgroundColor: palette.background, borderColor: palette.border, borderWidth: 1 }}
    >
      <Text className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: palette.textMuted }}>
        {label}
      </Text>
      <Text
        className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}
        style={{ color: palette.text, fontWeight: "600" }}
      >
        {value}
      </Text>
    </View>
  );
}
