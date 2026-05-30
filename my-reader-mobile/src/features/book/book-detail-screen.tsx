import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Feather from "@expo/vector-icons/Feather";
import { pickReadableFormat } from "@my-reader/tools/utils";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Share } from "react-native";

import { useTheme } from "@/src/design/tokens";
import { View } from "@/tw";

import { EmptyState, HeaderToolbar, type HeaderToolbarAction } from "@/src/components";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { readBookDetailFromMetadata } from "@/src/domain/library/calibre";
import { BookDetailContent, getDetailColors } from "@/src/features/library/components/books/book-detail";
import { useBooks } from "@/src/features/library/hooks/useLibraryQuery";
import { useAppStore } from "@/src/store/app-store";

type DetailCacheEntry = {
  detail: import("@my-reader/tools/types/book").BookDetail | null;
  error: string | null;
  loading: boolean;
};

export default function BookDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colorScheme, palette } = useTheme();
  const activeLibraryId = useAppStore((s) => s.activeLibraryId);
  const { data: books = [] } = useBooks(activeLibraryId);
  const libraries = useAppStore((s) => s.libraries);
  const activeLibrary = useMemo(
    () => libraries.find((l) => l.id === activeLibraryId) ?? null,
    [libraries, activeLibraryId],
  );
  const dataSources = useAppStore((s) => s.dataSources);
  const [currentId, setCurrentId] = useState<string | null>(id ?? null);
  const [detailCache, setDetailCache] = useState<Record<string, DetailCacheEntry>>({});
  const [selectedFormatById, setSelectedFormatById] = useState<Record<string, string | null>>({});
  const detailCacheRef = useRef(detailCache);
  const loadingIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (id && currentId === null) {
      setCurrentId(id);
    }
  }, [currentId, id]);

  useEffect(() => {
    setDetailCache({});
    setSelectedFormatById({});
    loadingIdsRef.current.clear();
  }, [activeLibraryId]);

  useEffect(() => {
    detailCacheRef.current = detailCache;
  }, [detailCache]);

  useEffect(() => {
    if (!activeLibrary || !currentId) return;
    let cancelled = false;

    const cacheEntry = detailCacheRef.current[currentId];
    if (cacheEntry || loadingIdsRef.current.has(currentId)) {
      return;
    }

    const numericId = Number(currentId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setDetailCache((prev) => ({
        ...prev,
        [currentId]: {
          detail: null,
          error: t("bookDetail.invalidId"),
          loading: false,
        },
      }));
      return;
    }

    loadingIdsRef.current.add(currentId);
    setDetailCache((prev) => ({
      ...prev,
      [currentId]: {
        detail: null,
        error: null,
        loading: true,
      },
    }));

    void readBookDetailFromMetadata(activeLibrary, Math.trunc(numericId))
      .then((next) => {
        if (cancelled) return;
        setDetailCache((prev) => ({
          ...prev,
          [currentId]: {
            detail: next,
            error: next ? null : t("bookDetail.notFoundInMeta"),
            loading: false,
          },
        }));
        if (next) {
          setSelectedFormatById((prev) =>
            Object.prototype.hasOwnProperty.call(prev, currentId)
              ? prev
              : { ...prev, [currentId]: pickReadableFormat(next.formats) }
          );
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setDetailCache((prev) => ({
          ...prev,
          [currentId]: {
            detail: null,
            error: e instanceof Error ? e.message : String(e),
            loading: false,
          },
        }));
      })
      .finally(() => {
        loadingIdsRef.current.delete(currentId);
      });

    return () => {
      cancelled = true;
    };
  }, [activeLibrary, currentId, t]);

  const currentEntry = currentId ? detailCache[currentId] : undefined;
  const currentDetail = currentEntry?.detail ?? null;

  const handleShare = useCallback(() => {
    if (!currentDetail) return;
    const lines = [
      currentDetail.title,
      currentDetail.authors.filter(Boolean).join(", ") || currentDetail.authorSort,
    ].filter((line): line is string => Boolean(line));
    void Share.share({
      title: currentDetail.title,
      message: lines.join("\n"),
    });
  }, [currentDetail]);

  const handleGoBack = useCallback(() => {
    router.back();
  }, []);

  const detailColors = useMemo(() => getDetailColors(palette, colorScheme), [palette, colorScheme]);
  const noop = useCallback(() => {}, []);

  const headerLeftActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        label: t("bookDetail.back"),
        onPress: handleGoBack,
        icon: <Feather name="arrow-left" size={20} color={palette.text} />,
        iosSfSymbol: "chevron.left",
        iconOnly: true,
        color: palette.text,
      },
    ],
    [handleGoBack, palette.text, t]
  );

  const headerRightActions = useMemo<HeaderToolbarAction[] | undefined>(() => {
    if (!currentDetail) return undefined;
    return [
      {
        label: t("bookDetail.favorite"),
        onPress: noop,
        icon: <Feather name="star" size={20} color={detailColors.muted} />,
        iosSfSymbol: "star",
        iconOnly: true,
        color: detailColors.muted,
      },
      {
        label: t("bookDetail.share"),
        onPress: handleShare,
        icon: <Feather name="share-2" size={19} color={detailColors.muted} />,
        iosSfSymbol: "square.and.arrow.up",
        iconOnly: true,
        color: detailColors.muted,
      },
    ];
  }, [currentDetail, detailColors.muted, handleShare, noop, t]);

  const screenOptions = useMemo<NativeStackNavigationOptions>(
    () => ({
      title: t("bookDetail.title"),
      headerShown: true,
      headerLargeTitle: false,
      headerLargeTitleShadowVisible: false,
      headerShadowVisible: false,
      headerBackVisible: false,
      headerBackButtonDisplayMode: "generic",
      headerStyle: { backgroundColor: palette.background },
      headerTintColor: palette.text,
    }),
    [palette.background, palette.text, t]
  );

  const getListBook = useCallback(
    (bookId: string) => books.find((item) => item.id === bookId) ?? null,
    [books]
  );

  const handleSelectFormat = useCallback((bookId: string, format: string | null) => {
    setSelectedFormatById((prev) => ({ ...prev, [bookId]: format }));
  }, []);

  const openReader = useCallback((bookId: string, format: string | null) => {
    if (!format) return;
    router.push({
      pathname: "/reader/[id]",
      params: { id: bookId, format },
    });
  }, []);

  const selectedFormat = currentId
    ? (selectedFormatById[currentId] ??
        (currentEntry?.detail ? pickReadableFormat(currentEntry.detail.formats) : null))
    : null;

  if (!currentId) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <HeaderToolbar left={headerLeftActions} right={headerRightActions} />
        <View className="flex-1 px-4 pt-4" style={{ backgroundColor: palette.background }}>
          <EmptyState title={t("bookDetail.missingParam.title")} detail={t("bookDetail.missingParam.detail")} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        </View>
      </>
    );
  }

  if (!activeLibraryId || !activeLibrary) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <HeaderToolbar left={headerLeftActions} right={headerRightActions} />
        <View className="flex-1 px-4 pt-4" style={{ backgroundColor: palette.background }}>
          <EmptyState title={t("bookDetail.noLibrary.title")} detail={t("bookDetail.noLibrary.detail")} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        </View>
      </>
    );
  }

  return (
    <View className="flex-1 overflow-hidden" style={{ backgroundColor: palette.background }}>
      <Stack.Screen options={screenOptions} />
      <HeaderToolbar left={headerLeftActions} right={headerRightActions} />
      <ErrorBoundary
        title={t("bookDetail.loadFailed")}
        message={t("bookDetail.loadFailedMessage")}
        onRetry={() => {
          if (currentId) {
            loadingIdsRef.current.delete(currentId);
            setDetailCache((prev) => {
              const next = { ...prev };
              delete next[currentId];
              return next;
            });
          }
        }}
      >
        <BookDetailContent
          activeLibrary={activeLibrary}
          bookId={currentId}
          colors={detailColors}
          detail={currentEntry?.detail ?? null}
          detailError={currentEntry?.error ?? null}
          listBook={getListBook(currentId)}
          loadingDetail={currentEntry?.loading ?? true}
          onOpenReader={openReader}
          onSelectFormat={handleSelectFormat}
          selectedFormat={selectedFormat}
          dataSources={dataSources}
        />
      </ErrorBoundary>
    </View>
  );
}
