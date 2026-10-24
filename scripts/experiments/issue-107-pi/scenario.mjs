import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context"
import { createModels } from "@earendil-works/pi-ai/models"
import { Type } from "@earendil-works/pi-ai"
import {
  fauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux"
import {
  Harness,
  createRegistry,
  defineDoc,
  defineExtension,
  defineTool,
} from "@earendil-works/pi-durable"

const context = BACKGROUND_CONTEXT
const Character = defineDoc({
  kind: "reader.characters",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({
    id: "char-chen",
    name: "陈默",
    aliases: ["老陈"],
    voice: "A",
    instructions: "沉稳男声",
  }),
  checkpointWhen: () => true,
})
export async function runScenario(openStorage, fetchSource) {
  const start = performance.now()
  const faux = fauxProvider({
    provider: "fixture",
    models: [{ id: "narrator", contextWindow: 4096, maxTokens: 512 }],
  })
  const models = createModels()
  models.setProvider(faux.provider)
  const registry = createRegistry()
  const calls = []
  registry.install(
    defineExtension({
      name: "book-research",
      tools: [
        defineTool({
          name: "search_web",
          description: "Search for the book cast",
          parameters: Type.Object({ query: Type.String() }),
          replay: "safe",
          execute: async (args) => {
            calls.push("search")
            return {
              output: [
                { type: "text", text: await fetchSource("search", args.query) },
              ],
            }
          },
        }),
        defineTool({
          name: "read_page",
          description: "Read a source",
          parameters: Type.Object({ url: Type.String() }),
          replay: "safe",
          execute: async (args) => {
            calls.push("read")
            return {
              output: [
                { type: "text", text: await fetchSource("read", args.url) },
              ],
            }
          },
        }),
      ],
    }),
  )
  const options = {
    models,
    registry,
    settings: {
      compaction: {
        enabled: false,
        keepRecentTokens: 64,
        reserveTokens: 512,
        backgroundTokens: 0,
      },
    },
  }
  let harness = await Harness.open(await openStorage(), options, context)
  let book = await harness.root(context, {
    agent: { model: { provider: "fixture", modelId: "narrator" } },
  })
  await book.commit(async (tx) => {
    ;(await tx.doc(Character, book.id)).name = "陈默"
  }, context)
  const id = book.id
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("search_web", { query: "沿河而行 沈川 登场人物" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxToolCall("read_page", { url: "fixture://cast" }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(
      "陈默的别名是老陈。" + "人物身份来自同一作品。".repeat(120),
    ),
    fauxAssistantMessage(
      "当前说话人为 char-chen。" + "林岚正在向陈默提问。".repeat(100),
    ),
  ])
  for (const [requestId, content] of [
    ["cast", "导入人物列表"],
    ["chapter-7", "林岚问他为何不走。“总要有人留下。”陈默说。"],
  ]) {
    const result = await (
      await book.submit({ type: "input", requestId, content }, context)
    ).wait(context)
    if (result.status !== "done") throw Error(JSON.stringify(result))
  }
  const before = await book.context(context)
  faux.setResponses([
    fauxAssistantMessage(
      "人物：char-chen 陈默（老陈）；当前场景：渡口，林岚与陈默对话。",
    ),
  ])
  const compact = await book.compact("保留人物ID、别名和当前场景。", context)
  const outcome = (await harness.waitForTask(compact, context)).state.outcome
  if (outcome.status !== "completed") throw Error(JSON.stringify(outcome))
  if (outcome.result.submissionId)
    await (await harness.submission(outcome.result.submissionId, context)).wait(
      context,
    )
  const after = await book.context(context)
  const entries = await book.entries({}, 100, undefined, context)
  const character = await harness.snapshot(Character, book.id, context)
  await harness.close(context)
  harness = await Harness.open(await openStorage(), options, context)
  book = await harness.root(context)
  const restored = await book.context(context)
  const restoredCharacter = await harness.snapshot(Character, book.id, context)
  const duplicate = await (
    await book.submit(
      { type: "input", requestId: "cast", content: "导入人物列表" },
      context,
    )
  ).wait(context)
  const report = {
    runtime: "pi-durable@1.4.0",
    toolCalls: calls,
    sessionPreserved: book.id === id,
    characterPreserved:
      JSON.stringify(character) === JSON.stringify(restoredCharacter),
    historyEntries: entries.items.length,
    compactionStored: entries.items.some((x) => x.kind === "pi.compaction"),
    beforeContextChars: JSON.stringify(before.messages).length,
    afterContextChars: JSON.stringify(after.messages).length,
    restoredContextChars: JSON.stringify(restored.messages).length,
    duplicateStatus: duplicate.status,
    elapsedMs: Math.round(performance.now() - start),
  }
  if (
    calls.join(",") !== "search,read" ||
    !report.sessionPreserved ||
    !report.characterPreserved ||
    !report.compactionStored ||
    report.afterContextChars >= report.beforeContextChars
  )
    throw Error(JSON.stringify(report))
  await harness.close(context)
  return report
}
