import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview/lib/WebViewTypes";

import { Text } from "@/tw";

export type ReflowBridgeChapter = {
  index: number;
  title: string;
  html: string;
};

export type ReflowBridgeLocation = {
  chapterIndex: number;
  progressInChapter: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

type ReflowWebViewBridgeProps = {
  chapters: ReflowBridgeChapter[];
  currentChapterIndex: number;
  initialProgress?: number;
  textScale?: number;
  theme?: "light" | "dark";
  onLocationChange?: (location: ReflowBridgeLocation) => void;
  onChapterChange?: (chapterIndex: number) => void;
};

type BridgeMessage =
  | { type: "ready" }
  | { type: "location"; payload: ReflowBridgeLocation }
  | { type: "chapter-change"; payload: { chapterIndex: number } };

function escapeForHtmlScript(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function buildBridgeHtml(payload: {
  chapters: ReflowBridgeChapter[];
  currentChapterIndex: number;
  initialProgress: number;
  textScale: number;
  theme: "light" | "dark";
}) {
  const serialized = escapeForHtmlScript(JSON.stringify(payload));

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f7f3ec;
        --surface: #fffdf8;
        --text: #3b322b;
        --text-muted: #7d6f64;
        --border: #e6ddd1;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: var(--bg);
        color: var(--text);
        font-family: "Noto Sans SC", "DM Sans", system-ui, sans-serif;
      }
      body.theme-dark {
        --bg: #1c1916;
        --surface: #25211d;
        --text: #eee7dd;
        --text-muted: #b8ab9d;
        --border: #3a332d;
      }
      #root {
        min-height: 100vh;
        padding: 0 0 24px;
      }
      section[data-chapter-index] {
        padding: 24px 20px 32px;
        border-bottom: 1px solid var(--border);
      }
      .reader-body-content {
        color: var(--text);
        font-size: calc(18px * var(--text-scale, 1));
        line-height: 1.85;
        word-break: break-word;
      }
      .reader-body-content img,
      .reader-body-content svg,
      .reader-body-content video,
      .reader-body-content canvas {
        max-width: 100%;
        height: auto;
      }
      .reader-body-content a { color: inherit; }
      h1, h2, h3, h4, h5, h6 { color: var(--text); }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      (function () {
        const bridge = window.ReactNativeWebView;
        const state = ${serialized};
        let ticking = false;

        function post(message) {
          if (bridge && typeof bridge.postMessage === "function") {
            bridge.postMessage(JSON.stringify(message));
          }
        }

        function clamp(value, min, max) {
          return Math.min(Math.max(value, min), max);
        }

        function buildChapterMarkup(chapter) {
          return '<section data-chapter-index="' + chapter.index + '"><div class="reader-body-content">' + chapter.html + '</div></section>';
        }

        function findCurrentChapter() {
          const sections = Array.from(document.querySelectorAll('section[data-chapter-index]'));
          if (!sections.length) return null;
          const threshold = window.scrollY + Math.min(window.innerHeight * 0.35, 180);
          let active = sections[0];
          for (const section of sections) {
            if (section.offsetTop <= threshold) active = section;
          }
          return active;
        }

        function emitLocation() {
          const section = findCurrentChapter();
          if (!section) return;
          const chapterIndex = Number(section.getAttribute('data-chapter-index') || 0);
          const nextTop = section.nextElementSibling ? section.nextElementSibling.offsetTop : document.documentElement.scrollHeight;
          const chapterHeight = Math.max(1, nextTop - section.offsetTop - window.innerHeight * 0.4);
          const progressInChapter = clamp((window.scrollY - section.offsetTop) / chapterHeight, 0, 1);
          post({
            type: 'location',
            payload: {
              chapterIndex,
              progressInChapter,
              scrollTop: window.scrollY,
              scrollHeight: document.documentElement.scrollHeight,
              clientHeight: window.innerHeight,
            },
          });
          post({ type: 'chapter-change', payload: { chapterIndex } });
        }

        function scrollToChapter(chapterIndex, progress, smooth) {
          const target = document.querySelector('section[data-chapter-index="' + chapterIndex + '"]');
          if (!target) return;
          const nextTop = target.nextElementSibling ? target.nextElementSibling.offsetTop : document.documentElement.scrollHeight;
          const available = Math.max(0, nextTop - target.offsetTop - window.innerHeight);
          const top = target.offsetTop + Math.round(available * clamp(progress || 0, 0, 1));
          window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
        }

        function onScroll() {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            ticking = false;
            emitLocation();
          });
        }

        document.body.classList.toggle('theme-dark', state.theme === 'dark');
        document.documentElement.style.setProperty('--text-scale', String(state.textScale || 1));
        const root = document.getElementById('root');
        root.innerHTML = state.chapters.map(buildChapterMarkup).join('');
        window.addEventListener('scroll', onScroll, { passive: true });
        requestAnimationFrame(() => {
          scrollToChapter(state.currentChapterIndex, state.initialProgress || 0, false);
          post({ type: 'ready' });
          emitLocation();
        });
      })();
    </script>
  </body>
</html>`;
}

export function ReflowWebViewBridge({
  chapters,
  currentChapterIndex,
  initialProgress = 0,
  textScale = 1,
  theme = "light",
  onLocationChange,
  onChapterChange,
}: ReflowWebViewBridgeProps) {
  const [webViewReady, setWebViewReady] = useState(false);
  const lastChapterRef = useRef<number | null>(null);

  const html = useMemo(
    () =>
      buildBridgeHtml({
        chapters,
        currentChapterIndex,
        initialProgress,
        textScale,
        theme,
      }),
    [chapters, currentChapterIndex, initialProgress, textScale, theme]
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const parsed = JSON.parse(event.nativeEvent.data) as BridgeMessage;
        if (parsed.type === "ready") {
          setWebViewReady(true);
          return;
        }
        if (parsed.type === "location") {
          onLocationChange?.(parsed.payload);
          return;
        }
        if (parsed.type === "chapter-change") {
          if (lastChapterRef.current === parsed.payload.chapterIndex) {
            return;
          }
          lastChapterRef.current = parsed.payload.chapterIndex;
          onChapterChange?.(parsed.payload.chapterIndex);
        }
      } catch (error) {
        console.warn("[mobile-reflow-bridge] message-parse-failed", error);
      }
    },
    [onChapterChange, onLocationChange]
  );

  if (chapters.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="rgba(255,255,255,0.72)" />
        <Text style={styles.statusText}>正在准备章节内容…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        key={html}
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.webView}
        onMessage={handleMessage}
        onLoadStart={() => {
          setWebViewReady(false);
          lastChapterRef.current = null;
        }}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
      />
      {!webViewReady ? (
        <View pointerEvents="none" style={styles.overlay}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.72)" />
          <Text style={styles.statusText}>正在渲染 EPUB…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    gap: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,17,17,0.2)",
    gap: 12,
  },
  statusText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
  },
});
