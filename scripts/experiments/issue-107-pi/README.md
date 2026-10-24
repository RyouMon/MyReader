# Issue #107 Pi 会话试验

这是独立试验包，不属于生产 pnpm workspace。对照方案、证据边界和选型见
[ADR-0024](../../../docs/adr/0024-llm-book-narration-in-core.md)。

要求 Node.js 22.19 或更高。使用固定模型响应和本机 HTTP fixture，不使用 API 密钥。

```sh
cd scripts/experiments/issue-107-pi
npm install
npm test
```

测试使用真正的 Pi durable Harness 和 SQLite，执行搜索/读取工具、压缩、关闭/重开，以及
相同 request ID 的重复提交。人物身份、音色和指令保存在独立 Chord document。
输出的 `ContextChars` 是 JSON 序列化后的 JavaScript 字符数，不是 token 或网络字节数。

浏览器试验使用 IndexedDB：

```sh
npm run browser
python3 -m http.server 59380 --bind 127.0.0.1
```

在浏览器打开 `http://127.0.0.1:59380/browser.html` 查看结果。浏览器版本的搜索/读取返回
内存 fixture；Node 版本通过 HTTP 工具访问本机 fixture。二者都不能用于评估真实检索质量。

Hermes 编译试验先将 async generator 和 dynamic import 转换为兼容语法，再运行项目自带
的 `hermesc`。成功仅证明字节码编译，不证明 IndexedDB 等浏览器能力能直接在 React Native 中使用。
