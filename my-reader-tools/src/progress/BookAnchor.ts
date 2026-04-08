/**
 * 与设备/字体/栏宽无关的内容锚点（以章节内文本位置为主）。
 *
 * 文本书（如 EPUB）：`charOffset` 为相对 {@link chapterIndex} 所指章节 **body** 下文档序文本的 UTF-16 码元偏移；
 * 恢复时跳转到该章并按偏移对齐列页。`textSnippet` / `textSnippetAfter` 用于校验与将来模糊匹配。
 * 漫画/PDF 等通常仅使用 `chapterIndex`（视作页或块下标）。
 */
export interface BookAnchor {
  /** 全书线性章节下标（与 BookReader spine/章列表一致）；PDF/漫画可作页码 */
  chapterIndex: number
  /** 可选：该章 body 内 UTF-16 码元偏移（与合成 DOM 文本一致） */
  charOffset?: number
  /** 可选：锚点向前截断的短文本，用于校验与模糊恢复（建议约 32–120 字） */
  textSnippet?: string
  /** 可选：锚点后若干字，降低 snippet 碰撞 */
  textSnippetAfter?: string
}

/** 由当前阅读器导航状态构造待持久化锚点（无分页测量时仅章下标）。 */
export function bookAnchorFromReaderState(params: {
  chapterIndex: number
}): BookAnchor {
  return {
    chapterIndex: Math.max(0, Math.floor(params.chapterIndex)),
  }
}
