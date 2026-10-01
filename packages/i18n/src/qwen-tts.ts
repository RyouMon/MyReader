/** Map Core preset IDs to the same copy in desktop and mobile forms. */
export function qwenTtsSourceKeys(id: string) {
  if (id === "tokenPlan" || id === "qianwen" || id === "dashscope") {
    return {
      title: `qwenTts.sources.${id}.title`,
      description: `qwenTts.sources.${id}.description`,
      credential: `qwenTts.sources.${id}.credential`,
    } as const
  }
  return {
    title: "qwenTts.title",
    description: "qwenTts.description",
    credential: "qwenTts.credentialRequired",
  } as const
}
