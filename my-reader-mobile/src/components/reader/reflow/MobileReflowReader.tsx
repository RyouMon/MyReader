import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/tw";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";

type MobileReflowReaderProps = {
  bookBuffer: Uint8Array;
  format: string;
  title: string;
  initialAnchor?: { chapterIndex: number } | null;
  onStateChange: (state: ReaderState) => Promise<void>;
  onTocReady: (toc: ReaderTocItem[]) => Promise<void>;
  onRequestClose: () => Promise<void>;
  gotoPageCommand?: number;
};

export default function MobileReflowReader({
  bookBuffer,
  format,
  title,
  initialAnchor,
  onStateChange,
  onTocReady,
  onRequestClose,
  gotoPageCommand,
}: MobileReflowReaderProps) {
  void bookBuffer;
  void format;
  void initialAnchor;
  void onRequestClose;
  void gotoPageCommand;

  useEffect(() => {
    void onTocReady([]);
    void onStateChange({
      ready: false,
      currentPage: 0,
      totalPages: 0,
      progress: 0,
      chapterTitle: title,
      loading: false,
      error: "移动端 EPUB 阅读器正在迁移到 WebView/DOM 路径，当前版本暂不可用。",
    });
  }, [onStateChange, onTocReady, title]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>EPUB 暂不可用</Text>
        <Text style={styles.body}>
          移动端 EPUB 阅读正在切换到适合 WebView 的实现路径。当前版本已阻止崩溃，但阅读功能暂未完成。
        </Text>
        <Text style={styles.meta}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#111",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 12,
  },
  title: {
    color: "rgba(255,255,255,0.96)",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  meta: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    textAlign: "center",
  },
});
